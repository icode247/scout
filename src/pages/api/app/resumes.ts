import type { APIRoute } from "astro";
import { assertSameOrigin, errorMessage, json, readBody, requireUser } from "../../../lib/api";
import { getDemoState } from "../../../lib/demo-store";
import { extractResume, validateResumeFile } from "../../../lib/resume";
import { applicantPrefill } from "../../../lib/applicant-profile";
import { assertResumeLimit, RESUMES_PER_PROFILE } from "../../../lib/entitlements";
import { getPostHogServer } from "../../../lib/posthog-server";

export const prerender = false;
export const maxDuration = 60;

/**
 * Add a resume to a profile. A profile owns several resumes, so this appends rather than
 * replacing; the first resume a profile receives becomes its default.
 */
async function attachResumeToProfile(supabase: any, userId: string, profileId: string, resumeId: string) {
  if (!profileId) return;
  const profile = await supabase.from("job_profiles").select("id").eq("id", profileId).eq("user_id", userId).single();
  if (profile.error) throw new Error("Profile not found");
  const existing = await supabase.from("job_profile_resumes").select("resume_id").eq("job_profile_id", profileId).eq("user_id", userId).limit(1);
  if (existing.error) throw existing.error;
  const isFirst = !(existing.data || []).length;
  const linked = await supabase.from("job_profile_resumes").upsert({
    user_id: userId, job_profile_id: profileId, resume_id: resumeId, is_primary: isFirst,
  }, { onConflict: "job_profile_id,resume_id" });
  if (linked.error) throw linked.error;
  if (isFirst) {
    const primary = await supabase.from("job_profiles").update({ resume_id: resumeId, updated_at: new Date().toISOString() }).eq("id", profileId).eq("user_id", userId);
    if (primary.error) throw primary.error;
  }
}

/** Make one of a profile's resumes its default, demoting whichever held the role. */
async function setDefaultResume(supabase: any, userId: string, resumeId: string) {
  const link = await supabase.from("job_profile_resumes").select("job_profile_id").eq("resume_id", resumeId).eq("user_id", userId).maybeSingle();
  if (link.error) throw link.error;
  if (!link.data) throw new Error("This resume is not attached to a job profile");
  const profileId = link.data.job_profile_id;
  // Demote first: a partial unique index allows only one default per profile.
  const demoted = await supabase.from("job_profile_resumes").update({ is_primary: false }).eq("job_profile_id", profileId).eq("user_id", userId).neq("resume_id", resumeId);
  if (demoted.error) throw demoted.error;
  const promoted = await supabase.from("job_profile_resumes").update({ is_primary: true }).eq("job_profile_id", profileId).eq("resume_id", resumeId).eq("user_id", userId);
  if (promoted.error) throw promoted.error;
  const profile = await supabase.from("job_profiles").update({ resume_id: resumeId, updated_at: new Date().toISOString() }).eq("id", profileId).eq("user_id", userId);
  if (profile.error) throw profile.error;
  return profileId;
}

export const POST: APIRoute = async (context) => {
  let path: string | null = null;
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const form = await context.request.formData();
    const file = form.get("resume");
    const profileId = String(form.get("profile_id") || "");
    if (!(file instanceof File)) return json({ error: "Choose a resume file" }, { status: 400 });
    await validateResumeFile(file);

    if (context.locals.demoMode) {
      const state = getDemoState(user.id, user.email);
      const profile = profileId ? state.jobProfiles.find((item) => item.id === profileId) : null;
      if (profileId && !profile) return json({ error: "Profile not found" }, { status: 404 });
      if (profile) assertResumeLimit(profile.resume_ids.length);
      const resume = { id: crypto.randomUUID(), name: file.name, kind: "original" as const, storage_path: null, created_at: new Date().toISOString(), extraction_status: "failed" };
      state.resumes.unshift(resume);
      if (profileId) {
        profile!.resume_ids = [resume.id];
      }
      return json({ ok: true, resume, prefill: {}, warning: "Extraction is unavailable in demo mode" });
    }

    const supabase = context.locals.supabase!;
    if (profileId) {
      const profile = await supabase.from("job_profiles").select("id").eq("id", profileId).eq("user_id", user.id).single();
      if (profile.error) return json({ error: "Profile not found" }, { status: 404 });
      // Checked before storing or extracting, so a refused upload costs nothing.
      const held = await supabase.from("job_profile_resumes").select("resume_id", { count: "exact", head: true }).eq("job_profile_id", profileId).eq("user_id", user.id);
      if (held.error) throw held.error;
      assertResumeLimit(held.count || 0);
    } else {
      // A profile being created has no id yet, so its resumes are the user's unattached
      // ones. Bounding those stops an unsaved dialog uploading without limit.
      const orphans = await supabase.from("resumes").select("id,job_profile_resumes(resume_id)").eq("user_id", user.id);
      if (orphans.error) throw orphans.error;
      assertResumeLimit((orphans.data || []).filter((row: any) => !row.job_profile_resumes?.length).length);
    }
    path = user.id + "/" + crypto.randomUUID() + "-" + file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const upload = await supabase.storage.from("resumes").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (upload.error) throw upload.error;

    const inserted = await supabase.from("resumes").insert({
      user_id: user.id, name: file.name, storage_path: path,
      extracted_data: { version: 1, status: "processing" }, extraction_status: "processing",
      extraction_started_at: new Date().toISOString(),
    }).select("*").single();
    if (inserted.error) throw inserted.error;

    try {
      const extracted = await extractResume(file);
      const updated = await supabase.from("resumes").update({
        extracted_data: extracted, extraction_status: "complete", extraction_error: null,
        extraction_completed_at: new Date().toISOString(),
      }).eq("id", inserted.data.id).eq("user_id", user.id).select("*").single();
      if (updated.error) throw updated.error;
      await attachResumeToProfile(supabase, user.id, profileId, updated.data.id);
      const posthog = getPostHogServer();
      if (posthog) {
        posthog.capture({ distinctId: user.id, event: "resume_uploaded", properties: { extraction_status: "complete", attached_to_profile: !!profileId } });
        await posthog.flush();
      }
      // The applicant answers this resume can fill in, so the profile editor can
      // prefill straight from the upload instead of waiting for a page reload.
      return json({ ok: true, resume: updated.data, prefill: applicantPrefill(user, {}, updated.data) });
    } catch (extractionError) {
      const warning = errorMessage(extractionError);
      const updated = await supabase.from("resumes").update({
        extracted_data: { version: 1, status: "failed" }, extraction_status: "failed",
        extraction_error: warning, extraction_completed_at: new Date().toISOString(),
      }).eq("id", inserted.data.id).eq("user_id", user.id).select("*").single();
      await attachResumeToProfile(supabase, user.id, profileId, inserted.data.id);
      const posthog = getPostHogServer();
      if (posthog) {
        posthog.capture({ distinctId: user.id, event: "resume_uploaded", properties: { extraction_status: "failed", attached_to_profile: !!profileId } });
        await posthog.flush();
      }
      return json({ ok: true, resume: updated.data || inserted.data, prefill: {}, warning });
    }
  } catch (error) {
    if (error instanceof Response) return error;
    if (path && context.locals.supabase) await context.locals.supabase.storage.from("resumes").remove([path]);
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};

export const PATCH: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const body = await readBody(context.request);
    const id = String(body.id || "");
    const name = String(body.name || "").trim().slice(0, 180);
    if (!id || !name) return json({ error: "Resume id and name are required" }, { status: 400 });
    if (context.locals.demoMode) {
      const resume = getDemoState(user.id, user.email).resumes.find((item) => item.id === id);
      if (!resume) return json({ error: "Resume not found" }, { status: 404 });
      resume.name = name;
      return json({ ok: true, resume });
    }
    const supabase = context.locals.supabase!;
    const result = await supabase.from("resumes").update({ name }).eq("id", id).eq("user_id", user.id).select("*").single();
    if (result.error) return json({ error: "Resume not found" }, { status: 404 });
    return json({ ok: true, resume: result.data });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};

export const DELETE: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const id = context.url.searchParams.get("id");
    if (!id) return json({ error: "Resume id is required" }, { status: 400 });
    if (context.locals.demoMode) {
      const state = getDemoState(user.id, user.email);
      if (state.applications.some((item) => item.resume_id === id)) return json({ error: "This resume is part of an application record and cannot be deleted" }, { status: 409 });
      state.resumes = state.resumes.filter((item) => item.id !== id);
      state.jobProfiles.forEach((profile) => { profile.resume_ids = profile.resume_ids.filter((resumeId) => resumeId !== id); });
      return json({ ok: true });
    }
    const supabase = context.locals.supabase!;
    const used = await supabase.from("applications").select("id").eq("resume_id", id).eq("user_id", user.id).limit(1).maybeSingle();
    if (used.error) throw used.error;
    if (used.data) return json({ error: "This resume is part of an application record and cannot be deleted" }, { status: 409 });
    const resume = await supabase.from("resumes").select("id,storage_path").eq("id", id).eq("user_id", user.id).single();
    if (resume.error) return json({ error: "Resume not found" }, { status: 404 });
    // Which profile owned it, and was it the default? Read before the delete cascades the link.
    const link = await supabase.from("job_profile_resumes").select("job_profile_id,is_primary").eq("resume_id", id).eq("user_id", user.id).maybeSingle();
    if (link.error) throw link.error;
    const deleted = await supabase.from("resumes").delete().eq("id", id).eq("user_id", user.id);
    if (deleted.error) throw deleted.error;
    // A profile is never left without a default: the oldest remaining resume takes over.
    if (link.data?.is_primary) {
      const next = await supabase.from("job_profile_resumes").select("resume_id").eq("job_profile_id", link.data.job_profile_id).eq("user_id", user.id).order("created_at").limit(1).maybeSingle();
      if (next.error) throw next.error;
      if (next.data) await setDefaultResume(supabase, user.id, next.data.resume_id);
      else await supabase.from("job_profiles").update({ resume_id: null, updated_at: new Date().toISOString() }).eq("id", link.data.job_profile_id).eq("user_id", user.id);
    }
    let warning;
    if (resume.data.storage_path) {
      // Resumes split across profiles by the ownership migration share one stored file, so
      // the object only goes when the last row referencing its path is gone.
      const shared = await supabase.from("resumes").select("id").eq("user_id", user.id).eq("storage_path", resume.data.storage_path).limit(1).maybeSingle();
      if (shared.error) throw shared.error;
      if (!shared.data) {
        const removed = await supabase.storage.from("resumes").remove([resume.data.storage_path]);
        if (removed.error) warning = "The resume record was deleted, but its stored file needs cleanup";
      }
    }
    const posthog = getPostHogServer();
    if (posthog) {
      posthog.capture({ distinctId: user.id, event: "resume_deleted" });
      await posthog.flush();
    }
    return json({ ok: true, warning });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};
