import type { APIRoute } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSameOrigin, errorMessage, json, requireUser } from "../../../lib/api";
import { getDemoState } from "../../../lib/demo-store";
import { extractResume, validateResumeFile } from "../../../lib/resume";
import { fastApplyProfilePayload } from "../../../lib/applicant-payload";
import { answersForSave, cleanApplicantProfile } from "../../../lib/applicant-profile";
import { reconcileSelfIdConsent } from "../../../lib/self-id-consent";
import { assertProfileLimit, assertResumeLimit } from "../../../lib/entitlements";
import { getPostHogServer } from "../../../lib/posthog-server";
import { removeMediaObjects } from "../../../lib/profile-media";
import { retireProfileUpstream } from "../../../lib/fastapply-applicant";
import { isStoredPhoto, isStoredVideo, ownsMediaPath } from "../../../lib/profile-media-rules";

export const prerender = false;
export const maxDuration = 60;

function applicantProfile(value: unknown) {
  if (!value) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(String(value)); } catch { throw new Error("Application details could not be read"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Application details must be an object");
  // One cleaning rule for every writer (lib/applicant-profile.ts): FastApply's canonical values,
  // folded countries, the phone country as an ISO id, and the paired fields kept in step.
  return cleanApplicantProfile(parsed as Record<string, unknown>);
}

function profileRecord(body: Record<string, any>, assistantType: "human" | "ai") {
  const name = String(body.name || "").trim().slice(0, 120);
  if (!name) throw new Error("Profile name is required");
  return {
    name,
    assistant_type: assistantType,
    active: body.active === false || body.active === "false" ? false : true,
    applicant_profile: applicantProfile(body.applicant_profile),
  };
}

async function uploadResumes(supabase: SupabaseClient, userId: string, files: File[], alreadyHeld = 0) {
  const uploaded: Array<{ id: string; name: string; storage_path: string; extraction_status: string; extracted_data?: Record<string, any> }> = [];
  assertResumeLimit(alreadyHeld + files.length - 1);
  for (const file of files) {
    await validateResumeFile(file);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = userId + "/" + crypto.randomUUID() + "-" + safeName;
    const storage = await supabase.storage.from("resumes").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (storage.error) throw storage.error;
    const resume = await supabase.from("resumes").insert({
      user_id: userId, name: file.name, kind: "original", storage_path: path,
      extracted_data: { version: 1, status: "processing" }, extraction_status: "processing",
      extraction_started_at: new Date().toISOString(),
    }).select("id,name,storage_path,extraction_status").single();
    if (resume.error) {
      await supabase.storage.from("resumes").remove([path]);
      throw resume.error;
    }
    try {
      const extracted = await extractResume(file);
      const updated = await supabase.from("resumes").update({
        extracted_data: extracted, extraction_status: "complete", extraction_error: null,
        extraction_completed_at: new Date().toISOString(),
      }).eq("id", resume.data.id).eq("user_id", userId).select("id,name,storage_path,extraction_status").single();
      if (updated.error) throw updated.error;
      uploaded.push({ ...updated.data, extracted_data: extracted as Record<string, any> });
    } catch (error) {
      const warning = errorMessage(error);
      await supabase.from("resumes").update({
        extracted_data: { version: 1, status: "failed" }, extraction_status: "failed",
        extraction_error: warning, extraction_completed_at: new Date().toISOString(),
      }).eq("id", resume.data.id).eq("user_id", userId);
      uploaded.push({ ...resume.data, extraction_status: "failed" });
    }
  }
  return uploaded;
}

function multipartBody(form: FormData) {
  const body = Object.fromEntries(form.entries()) as Record<string, any>;
  const files = form.getAll("resumes").filter((value): value is File => value instanceof File && value.size > 0);
  const resumeIds = form.getAll("resume_ids").map(String).filter(Boolean);
  return { body, files, resumeIds };
}

/**
 * Resumes belong to exactly one job profile, so a submitted id must be this user's and must
 * be either unattached (just uploaded for a profile being created) or already attached to
 * the profile being saved. This is what stops one profile claiming another's resume.
 */
async function ownedResumeIds(supabase: SupabaseClient, userId: string, ids: string[], profileId?: string) {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const result = await supabase.from("resumes").select("id").eq("user_id", userId).in("id", unique);
  if (result.error) throw result.error;
  if ((result.data || []).length !== unique.length) throw new Error("One or more selected resumes could not be found");
  const links = await supabase.from("job_profile_resumes").select("resume_id,job_profile_id").eq("user_id", userId).in("resume_id", unique);
  if (links.error) throw links.error;
  const claimed = (links.data || []).filter((link) => link.job_profile_id !== profileId);
  if (claimed.length) throw new Error("A resume already belongs to another job profile. Upload it again for this profile.");
  return unique;
}

export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const form = await context.request.formData();
    const { body, files, resumeIds } = multipartBody(form);
    const record = profileRecord(body, context.locals.scoutProfile?.assistant_type === "human" ? "human" : "ai");

    // Self-identification answers obey the member's consent decision (lib/self-id-consent.ts);
    // a new profile has nothing stored to reconcile against.
    record.applicant_profile = reconcileSelfIdConsent(record.applicant_profile, null);

    if (context.locals.demoMode) {
      const state = getDemoState(user.id, user.email);
      if (record.active) assertProfileLimit(context.locals.entitlement, state.jobProfiles.filter((item) => item.active).length);
      const uploaded = files.map((file) => {
        const resume = { id: crypto.randomUUID(), name: file.name, kind: "original" as const, storage_path: null, created_at: new Date().toISOString(), extraction_status: "failed" };
        state.resumes.unshift(resume);
        return resume;
      });
      const linkedIds = [...new Set([...resumeIds.filter((id) => state.resumes.some((resume) => resume.id === id)), ...uploaded.map((resume) => resume.id)])];
      if (!linkedIds.length) return json({ error: "Upload at least one resume for this profile" }, { status: 400 });
      const item = { id: crypto.randomUUID(), target_roles: [], locations: [], salary_min: null, resume_behavior: "tailor" as const, ...record, resume_ids: linkedIds };
      state.jobProfiles.unshift(item);
      return json({ ok: true, profile: item, resumes: uploaded });
    }

    const supabase = context.locals.supabase!;
    // Plan limit, checked before anything is uploaded so a refused profile costs no
    // storage or extraction. Counts active profiles only — the pricing page sells
    // "active job profiles", and a paused one consumes nothing.
    if (record.active) {
      const active = await supabase.from("job_profiles").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("active", true);
      if (active.error) throw active.error;
      assertProfileLimit(context.locals.entitlement, active.count || 0);
    }
    const existingIds = await ownedResumeIds(supabase, user.id, resumeIds);
    const uploaded = await uploadResumes(supabase, user.id, files, existingIds.length);
    if (uploaded[0]?.extracted_data) {
      const extractedApplicant = applicantProfile(JSON.stringify(fastApplyProfilePayload(user, {}, uploaded[0])));
      record.applicant_profile = { ...extractedApplicant, ...record.applicant_profile };
    }
    const linkedIds = [...new Set([...existingIds, ...uploaded.map((resume) => resume.id)])];
    if (!linkedIds.length) return json({ error: "Upload at least one resume for this profile" }, { status: 400 });

    const result = await supabase.from("job_profiles").insert({ user_id: user.id, target_roles: [], locations: [], salary_min: null, resume_behavior: "tailor", ...record, resume_id: linkedIds[0] }).select("*").single();
    if (result.error) throw result.error;
    const links = linkedIds.map((resumeId, index) => ({ user_id: user.id, job_profile_id: result.data.id, resume_id: resumeId, is_primary: index === 0 }));
    const linked = await supabase.from("job_profile_resumes").insert(links);
    if (linked.error) {
      await supabase.from("job_profiles").delete().eq("id", result.data.id).eq("user_id", user.id);
      throw linked.error;
    }
    const posthogCreate = getPostHogServer();
    if (posthogCreate) {
      posthogCreate.capture({ distinctId: user.id, event: "job_profile_created", properties: { assistant_type: record.assistant_type, resume_count: linkedIds.length } });
      await posthogCreate.flush();
    }
    return json({ ok: true, profile: { ...result.data, resume_ids: linkedIds }, resumes: uploaded });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};

export const PATCH: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const form = await context.request.formData();
    const { body, files, resumeIds } = multipartBody(form);
    const id = String(body.id || "");
    if (!id) return json({ error: "Profile id is required" }, { status: 400 });
    const record = profileRecord(body, context.locals.scoutProfile?.assistant_type === "human" ? "human" : "ai");
    // A form posted before the answers editor was listening carries no `applicant_profile` at all.
    // That means "unchanged", never "empty": saving {} would erase every answer the profile holds.
    const answersSent = form.has("applicant_profile");

    if (context.locals.demoMode) {
      const state = getDemoState(user.id, user.email);
      const profile = state.jobProfiles.find((item) => item.id === id);
      if (!profile) return json({ error: "Profile not found" }, { status: 404 });
      if (record.active && !profile.active) assertProfileLimit(context.locals.entitlement, state.jobProfiles.filter((item) => item.active).length);
      record.applicant_profile = answersForSave(answersSent, record.applicant_profile, (profile as any).applicant_profile);
      const uploaded = files.map((file) => {
        const resume = { id: crypto.randomUUID(), name: file.name, kind: "original" as const, storage_path: null, created_at: new Date().toISOString(), extraction_status: "failed" };
        state.resumes.unshift(resume);
        return resume;
      });
      const linkedIds = [...new Set([...resumeIds.filter((resumeId) => state.resumes.some((resume) => resume.id === resumeId)), ...uploaded.map((resume) => resume.id)])];
      if (!linkedIds.length) return json({ error: "Select or upload at least one resume" }, { status: 400 });
      Object.assign(profile, record, { resume_ids: linkedIds });
      return json({ ok: true, profile, resumes: uploaded });
    }

    const supabase = context.locals.supabase!;
    const existingProfile = await supabase.from("job_profiles").select("id,active,applicant_profile").eq("id", id).eq("user_id", user.id).single();
    if (existingProfile.error) return json({ error: "Profile not found" }, { status: 404 });
    // The consent decision and the answers it gates are reconciled against the stored profile: a
    // form without a decision never withdraws consent or clears answers by accident, and the
    // stamp moves only when the decision does (lib/self-id-consent.ts).
    record.applicant_profile = answersForSave(answersSent, record.applicant_profile, existingProfile.data.applicant_profile);
    // Resuming a paused profile consumes a slot, so it is checked like a creation.
    // Editing an already-active profile is not, or a downgraded member could never save.
    if (record.active && !existingProfile.data.active) {
      const active = await supabase.from("job_profiles").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("active", true);
      if (active.error) throw active.error;
      assertProfileLimit(context.locals.entitlement, active.count || 0);
    }
    const existingIds = await ownedResumeIds(supabase, user.id, resumeIds, id);
    const uploaded = await uploadResumes(supabase, user.id, files, existingIds.length);
    if (uploaded[0]?.extracted_data) {
      const extractedApplicant = applicantProfile(JSON.stringify(fastApplyProfilePayload(user, {}, uploaded[0])));
      record.applicant_profile = { ...extractedApplicant, ...record.applicant_profile };
    }
    const linkedIds = [...new Set([...existingIds, ...uploaded.map((resume) => resume.id)])];
    if (!linkedIds.length) return json({ error: "This profile needs at least one resume" }, { status: 400 });

    const result = await supabase.from("job_profiles").update({ ...record, resume_id: linkedIds[0], updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).select("*").single();
    if (result.error) throw result.error;
    // Only one link per profile may be primary (partial unique index), so every link is
    // written non-primary first and the default is promoted in a statement of its own.
    const links = linkedIds.map((resumeId) => ({ user_id: user.id, job_profile_id: id, resume_id: resumeId, is_primary: false }));
    const linked = await supabase.from("job_profile_resumes").upsert(links, { onConflict: "job_profile_id,resume_id" });
    if (linked.error) throw linked.error;
    const currentLinks = await supabase.from("job_profile_resumes").select("resume_id").eq("job_profile_id", id).eq("user_id", user.id);
    if (currentLinks.error) throw currentLinks.error;
    const removedIds = (currentLinks.data || []).map((item) => item.resume_id).filter((resumeId) => !linkedIds.includes(resumeId));
    if (removedIds.length) {
      const removed = await supabase.from("job_profile_resumes").delete().eq("job_profile_id", id).eq("user_id", user.id).in("resume_id", removedIds);
      if (removed.error) throw removed.error;
    }
    const promoted = await supabase.from("job_profile_resumes").update({ is_primary: true }).eq("job_profile_id", id).eq("user_id", user.id).eq("resume_id", linkedIds[0]);
    if (promoted.error) throw promoted.error;
    const posthogUpdate = getPostHogServer();
    if (posthogUpdate) {
      posthogUpdate.capture({ distinctId: user.id, event: "job_profile_updated", properties: { resume_count: linkedIds.length } });
      await posthogUpdate.flush();
    }
    return json({ ok: true, profile: { ...result.data, resume_ids: linkedIds }, resumes: uploaded });
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
    if (!id) return json({ error: "Profile id is required" }, { status: 400 });
    if (context.locals.demoMode) {
      const state = getDemoState(user.id, user.email);
      state.jobProfiles = state.jobProfiles.filter((item) => item.id !== id);
      return json({ ok: true });
    }
    const db = context.locals.supabase!;
    const owned = await db.from("job_profiles").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (owned.error) throw owned.error;
    if (!owned.data) return json({ error: "Profile not found" }, { status: 404 });
    // First, while the rows that point at them still exist: this profile's Scout AI automation and
    // FastApply's applicant. Both rows go with the profile, and nothing could stop either afterwards.
    try {
      await retireProfileUpstream(db, user.id, id);
    } catch (error) {
      console.error("[profiles] could not retire the profile upstream", id, error);
      return json({ error: "Scout could not stop this profile's Scout AI just now, so nothing was deleted. Try again in a minute." }, { status: 502 });
    }
    // select("*"), not the media columns by name: deleting must work before the media migration runs.
    const result = await db.from("job_profiles").delete().eq("id", id).eq("user_id", user.id).select("*").maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return json({ error: "Profile not found" }, { status: 404 });
    // The profile's photo and video go with it (the files are in the member's own folder).
    const deleted = result.data as { id: string; photo: unknown; video: unknown };
    await removeMediaObjects(db, [
      isStoredPhoto(deleted.photo) && ownsMediaPath(user.id, id, deleted.photo.path) ? deleted.photo.path : null,
      isStoredVideo(deleted.video) && ownsMediaPath(user.id, id, deleted.video.path) ? deleted.video.path : null,
    ]);
    const posthogDelete = getPostHogServer();
    if (posthogDelete) {
      posthogDelete.capture({ distinctId: user.id, event: "job_profile_deleted" });
      await posthogDelete.flush();
    }
    return json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};
