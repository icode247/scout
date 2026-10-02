import type { APIRoute } from "astro";
import { assertCanWorkClient, createAdminClient, requireStaff } from "../../../lib/admin";
import { assertSameOrigin, errorMessage, json } from "../../../lib/api";
import { EVIDENCE_MAX_BYTES, TAILORED_RESUME_LABEL, evidenceFiles, evidenceProblem, storeEvidence, tailoredResumeType } from "../../../lib/application-evidence";

export const prerender = false;

const text = (form: FormData, key: string, max = 500) => String(form.get(key) || "").trim().slice(0, max);

function validJobUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch { return false; }
}

/**
 * The one action a Human Assistant takes after submitting an application: record
 * it for the client with the resume used and the screenshots, in a single step.
 *
 * - With `application_id`, it completes a job the client asked for (already
 *   counted against their plan when they delegated it).
 * - Without it, it logs a job the assistant found anywhere — a job board,
 *   LinkedIn, a company site, or a link the client sent in WhatsApp. That job
 *   is new, so it consumes one application from the client's plan here.
 */
export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const staff = requireStaff(context);
    const form = await context.request.formData();
    const userId = text(form, "user_id", 64);
    const applicationId = text(form, "application_id", 64);
    const resumeId = text(form, "resume_id", 64) || null;
    const note = text(form, "notes", 5000);
    const screenshots = evidenceFiles(form, "screenshots");
    const tailored = evidenceFiles(form, "tailored_resume");
    if (!userId) return json({ error: "Client is required" }, { status: 400 });
    if (!screenshots.length) return json({ error: "Add at least one screenshot of the submitted form or confirmation page" }, { status: 400 });
    const problem = evidenceProblem(screenshots);
    if (problem) return json({ error: problem }, { status: 400 });
    if (tailored.some((file) => !tailoredResumeType(file))) return json({ error: "Upload the tailored resume as a PDF or Word (.docx) file" }, { status: 400 });
    if (tailored.some((file) => file.size > EVIDENCE_MAX_BYTES)) return json({ error: "The tailored resume must be under 10 MB" }, { status: 400 });

    const admin = createAdminClient();
    await assertCanWorkClient(staff, admin, userId);
    if (resumeId) {
      const owned = await admin.from("resumes").select("id").eq("id", resumeId).eq("user_id", userId).maybeSingle();
      if (owned.error || !owned.data) return json({ error: "That resume does not belong to this client" }, { status: 400 });
    }
    const now = new Date().toISOString();
    let application: { id: string; job_id: string };

    if (applicationId) {
      const existing = await admin.from("applications").select("id,job_id,user_id,resume_id").eq("id", applicationId).eq("user_id", userId).single();
      if (existing.error) return json({ error: "That request was not found for this client" }, { status: 404 });
      const updated = await admin.from("applications").update({
        status: "evidence_ready", submitted_at: now, updated_at: now,
        resume_id: resumeId || existing.data.resume_id,
        ...(note ? { notes: note } : {}),
      }).eq("id", applicationId);
      if (updated.error) throw updated.error;
      application = { id: existing.data.id, job_id: existing.data.job_id };
    } else {
      const jobUrl = text(form, "job_url", 2000);
      const title = text(form, "title", 200);
      const company = text(form, "company", 200);
      const jobProfileId = text(form, "job_profile_id", 64) || null;
      if (!validJobUrl(jobUrl)) return json({ error: "Paste the job link you applied to" }, { status: 400 });
      if (!title || !company) return json({ error: "Job title and company are required" }, { status: 400 });

      const subscription = await admin.from("subscriptions").select("id,applications_used,applications_quota").eq("user_id", userId).eq("lane", "human").eq("status", "active").maybeSingle();
      if (subscription.error) throw subscription.error;
      if (!subscription.data) return json({ error: "This client has no active Human plan" }, { status: 400 });
      if (subscription.data.applications_used >= subscription.data.applications_quota) return json({ error: "This client has used every application in their plan. Tell them in WhatsApp before applying to more." }, { status: 400 });

      const duplicate = await admin.from("jobs").select("id").eq("user_id", userId).eq("external_url", jobUrl).limit(1).maybeSingle();
      if (duplicate.error) throw duplicate.error;
      if (duplicate.data) return json({ error: "This job is already on the client's list. Find it under Requested or Applied." }, { status: 409 });

      if (jobProfileId) {
        const owned = await admin.from("job_profiles").select("id").eq("id", jobProfileId).eq("user_id", userId).maybeSingle();
        if (owned.error || !owned.data) return json({ error: "That job profile does not belong to this client" }, { status: 400 });
      }

      const job = await admin.from("jobs").insert({
        user_id: userId, job_profile_id: jobProfileId, title, company,
        location: text(form, "location", 200), external_url: jobUrl,
        source: "assistant", status: "applied", assistant_type: "human",
      }).select("id").single();
      if (job.error) throw job.error;
      const inserted = await admin.from("applications").insert({
        user_id: userId, job_id: job.data.id, job_profile_id: jobProfileId, resume_id: resumeId,
        assistant_type: "human", status: "evidence_ready", submitted_at: now,
        notes: note || "Found and applied by your assistant.",
      }).select("id,job_id").single();
      if (inserted.error) {
        await admin.from("jobs").delete().eq("id", job.data.id);
        throw inserted.error;
      }
      application = inserted.data;

      // Conditional on the value we read, so two simultaneous logs cannot both
      // count as one. A lost race just leaves the counter one short, never over.
      await admin.from("subscriptions")
        .update({ applications_used: subscription.data.applications_used + 1, updated_at: now })
        .eq("id", subscription.data.id).eq("applications_used", subscription.data.applications_used);
    }

    await storeEvidence(admin, userId, application.id, screenshots, "Application answers");
    if (tailored.length) await storeEvidence(admin, userId, application.id, tailored, TAILORED_RESUME_LABEL, (file) => tailoredResumeType(file)!);
    const jobUpdate = await admin.from("jobs").update({ status: "applied", updated_at: now }).eq("id", application.job_id);
    if (jobUpdate.error) throw jobUpdate.error;
    return json({ application });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 500 });
  }
};
