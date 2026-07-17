import type { APIRoute } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSameOrigin, errorMessage, json, list, requireUser } from "../../../lib/api";
import { getDemoState } from "../../../lib/demo-store";
import { extractResume, validateResumeFile } from "../../../lib/resume";

export const prerender = false;
export const maxDuration = 60;

function profileRecord(body: Record<string, any>, assistantType: "human" | "ai") {
  const name = String(body.name || "").trim().slice(0, 120);
  const targetRoles = list(body.target_roles).slice(0, 20);
  const locations = list(body.locations).slice(0, 20);
  const salary = body.salary_min === "" || body.salary_min == null ? null : Number(body.salary_min);
  if (!name) throw new Error("Profile name is required");
  if (!targetRoles.length) throw new Error("Add at least one target role");
  if (salary !== null && (!Number.isFinite(salary) || salary < 0 || salary > 10_000_000)) throw new Error("Enter a valid minimum salary");
  return {
    name,
    assistant_type: assistantType,
    target_roles: targetRoles,
    locations,
    salary_min: salary === null ? null : Math.round(salary),
    resume_behavior: body.resume_behavior === "original" ? "original" as const : "tailor" as const,
    active: body.active === false || body.active === "false" ? false : true,
  };
}

async function uploadResumes(supabase: SupabaseClient, userId: string, files: File[]) {
  const uploaded: Array<{ id: string; name: string; storage_path: string; extraction_status: string }> = [];
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
      uploaded.push(updated.data);
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

async function ownedResumeIds(supabase: SupabaseClient, userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  const result = await supabase.from("resumes").select("id").eq("user_id", userId).in("id", unique);
  if (result.error) throw result.error;
  if ((result.data || []).length !== unique.length) throw new Error("One or more selected resumes could not be found");
  return unique;
}

export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const form = await context.request.formData();
    const { body, files, resumeIds } = multipartBody(form);
    const record = profileRecord(body, context.locals.scoutProfile?.assistant_type === "human" ? "human" : "ai");

    if (context.locals.demoMode) {
      const state = getDemoState(user.id, user.email);
      const uploaded = files.map((file) => {
        const resume = { id: crypto.randomUUID(), name: file.name, kind: "original" as const, storage_path: null, created_at: new Date().toISOString(), extraction_status: "failed" };
        state.resumes.unshift(resume);
        return resume;
      });
      const linkedIds = [...new Set([...resumeIds.filter((id) => state.resumes.some((resume) => resume.id === id)), ...uploaded.map((resume) => resume.id)])];
      if (!linkedIds.length) return json({ error: "Select or upload at least one resume" }, { status: 400 });
      const item = { id: crypto.randomUUID(), ...record, resume_ids: linkedIds };
      state.jobProfiles.unshift(item);
      return json({ ok: true, profile: item, resumes: uploaded });
    }

    const supabase = context.locals.supabase!;
    const existingIds = await ownedResumeIds(supabase, user.id, resumeIds);
    const uploaded = await uploadResumes(supabase, user.id, files);
    const linkedIds = [...new Set([...existingIds, ...uploaded.map((resume) => resume.id)])];
    if (!linkedIds.length) return json({ error: "Select or upload at least one resume" }, { status: 400 });

    const result = await supabase.from("job_profiles").insert({ user_id: user.id, ...record, resume_id: linkedIds[0] }).select("*").single();
    if (result.error) throw result.error;
    const links = linkedIds.map((resumeId, index) => ({ user_id: user.id, job_profile_id: result.data.id, resume_id: resumeId, is_primary: index === 0 }));
    const linked = await supabase.from("job_profile_resumes").insert(links);
    if (linked.error) {
      await supabase.from("job_profiles").delete().eq("id", result.data.id).eq("user_id", user.id);
      throw linked.error;
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

    if (context.locals.demoMode) {
      const state = getDemoState(user.id, user.email);
      const profile = state.jobProfiles.find((item) => item.id === id);
      if (!profile) return json({ error: "Profile not found" }, { status: 404 });
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
    const existingProfile = await supabase.from("job_profiles").select("id").eq("id", id).eq("user_id", user.id).single();
    if (existingProfile.error) return json({ error: "Profile not found" }, { status: 404 });
    const existingIds = await ownedResumeIds(supabase, user.id, resumeIds);
    const uploaded = await uploadResumes(supabase, user.id, files);
    const linkedIds = [...new Set([...existingIds, ...uploaded.map((resume) => resume.id)])];
    if (!linkedIds.length) return json({ error: "Select or upload at least one resume" }, { status: 400 });

    const result = await supabase.from("job_profiles").update({ ...record, resume_id: linkedIds[0], updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).select("*").single();
    if (result.error) throw result.error;
    const links = linkedIds.map((resumeId, index) => ({ user_id: user.id, job_profile_id: id, resume_id: resumeId, is_primary: index === 0 }));
    const linked = await supabase.from("job_profile_resumes").upsert(links, { onConflict: "job_profile_id,resume_id" });
    if (linked.error) throw linked.error;
    const currentLinks = await supabase.from("job_profile_resumes").select("resume_id").eq("job_profile_id", id).eq("user_id", user.id);
    if (currentLinks.error) throw currentLinks.error;
    const removedIds = (currentLinks.data || []).map((item) => item.resume_id).filter((resumeId) => !linkedIds.includes(resumeId));
    if (removedIds.length) {
      const removed = await supabase.from("job_profile_resumes").delete().eq("job_profile_id", id).eq("user_id", user.id).in("resume_id", removedIds);
      if (removed.error) throw removed.error;
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
    const result = await context.locals.supabase!.from("job_profiles").delete().eq("id", id).eq("user_id", user.id).select("id").maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return json({ error: "Profile not found" }, { status: 404 });
    return json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};
