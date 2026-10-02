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
 * Corrects an application an assistant already logged: the job details, the
 * resume used, the note to the client, extra screenshots, or a replacement
 * tailored resume. Applications are never deleted here; the record the client
 * sees stays, it just becomes accurate.
 */
export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const staff = requireStaff(context);
    const form = await context.request.formData();
    const applicationId = text(form, "application_id", 64);
    if (!applicationId) return json({ error: "Application is required" }, { status: 400 });

    const title = text(form, "title", 200);
    const company = text(form, "company", 200);
    const jobUrl = text(form, "job_url", 2000);
    if (!title || !company) return json({ error: "Job title and company are required" }, { status: 400 });
    if (jobUrl && !validJobUrl(jobUrl)) return json({ error: "Enter a valid job link" }, { status: 400 });

    const screenshots = evidenceFiles(form, "screenshots");
    const tailored = evidenceFiles(form, "tailored_resume");
    const problem = evidenceProblem(screenshots);
    if (problem) return json({ error: problem }, { status: 400 });
    if (tailored.some((file) => !tailoredResumeType(file))) return json({ error: "Upload the tailored resume as a PDF or Word (.docx) file" }, { status: 400 });
    if (tailored.some((file) => file.size > EVIDENCE_MAX_BYTES)) return json({ error: "The tailored resume must be under 10 MB" }, { status: 400 });

    const admin = createAdminClient();
    const application = await admin.from("applications").select("id,user_id,job_id,status").eq("id", applicationId).maybeSingle();
    if (application.error) throw application.error;
    if (!application.data) return json({ error: "Application not found" }, { status: 404 });
    const { user_id: userId, job_id: jobId } = application.data;
    await assertCanWorkClient(staff, admin, userId);

    const resumeId = text(form, "resume_id", 64) || null;
    if (resumeId) {
      const owned = await admin.from("resumes").select("id").eq("id", resumeId).eq("user_id", userId).maybeSingle();
      if (owned.error || !owned.data) return json({ error: "That resume does not belong to this client" }, { status: 400 });
    }
    if (jobUrl) {
      const duplicate = await admin.from("jobs").select("id").eq("user_id", userId).eq("external_url", jobUrl).neq("id", jobId).limit(1).maybeSingle();
      if (duplicate.error) throw duplicate.error;
      if (duplicate.data) return json({ error: "Another application for this client already uses that job link" }, { status: 409 });
    }

    const now = new Date().toISOString();
    const jobUpdate = await admin.from("jobs").update({
      title, company, location: text(form, "location", 200), ...(jobUrl ? { external_url: jobUrl } : {}), updated_at: now,
    }).eq("id", jobId).eq("user_id", userId);
    if (jobUpdate.error) throw jobUpdate.error;

    const applicationUpdate = await admin.from("applications").update({
      resume_id: resumeId, notes: text(form, "notes", 5000) || null, updated_at: now,
      // Screenshots added to an application logged without them complete its evidence.
      ...(screenshots.length && application.data.status === "submitted" ? { status: "evidence_ready" } : {}),
    }).eq("id", applicationId);
    if (applicationUpdate.error) throw applicationUpdate.error;

    if (screenshots.length) await storeEvidence(admin, userId, applicationId, screenshots, "Application answers");
    if (tailored.length) {
      // A replacement tailored resume supersedes the previous one.
      const previous = await admin.from("application_evidence").select("id,storage_path").eq("application_id", applicationId).eq("label", TAILORED_RESUME_LABEL);
      if (previous.error) throw previous.error;
      await storeEvidence(admin, userId, applicationId, tailored.slice(0, 1), TAILORED_RESUME_LABEL, (file) => tailoredResumeType(file)!);
      if (previous.data?.length) {
        await admin.storage.from("application-evidence").remove(previous.data.map((row) => row.storage_path));
        await admin.from("application_evidence").delete().in("id", previous.data.map((row) => row.id));
      }
    }
    return json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 500 });
  }
};
