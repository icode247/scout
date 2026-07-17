import type { APIRoute } from "astro";
import { assertSameOrigin, errorMessage, json, readBody, requireUser } from "../../../lib/api";
import { getDemoState } from "../../../lib/demo-store";
import { extractResume, validateResumeFile } from "../../../lib/resume";

export const prerender = false;
export const maxDuration = 60;

export const POST: APIRoute = async (context) => {
  let path: string | null = null;
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const form = await context.request.formData();
    const file = form.get("resume");
    if (!(file instanceof File)) return json({ error: "Choose a resume file" }, { status: 400 });
    await validateResumeFile(file);

    if (context.locals.demoMode) {
      const resume = { id: crypto.randomUUID(), name: file.name, kind: "original" as const, storage_path: null, created_at: new Date().toISOString(), extraction_status: "failed" };
      getDemoState(user.id, user.email).resumes.unshift(resume);
      return json({ ok: true, resume, warning: "Extraction is unavailable in demo mode" });
    }

    const supabase = context.locals.supabase!;
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
      return json({ ok: true, resume: updated.data });
    } catch (extractionError) {
      const warning = errorMessage(extractionError);
      const updated = await supabase.from("resumes").update({
        extracted_data: { version: 1, status: "failed" }, extraction_status: "failed",
        extraction_error: warning, extraction_completed_at: new Date().toISOString(),
      }).eq("id", inserted.data.id).eq("user_id", user.id).select("*").single();
      return json({ ok: true, resume: updated.data || inserted.data, warning });
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
    const result = await context.locals.supabase!.from("resumes").update({ name }).eq("id", id).eq("user_id", user.id).select("*").single();
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
    const deleted = await supabase.from("resumes").delete().eq("id", id).eq("user_id", user.id);
    if (deleted.error) throw deleted.error;
    let warning;
    if (resume.data.storage_path) {
      const removed = await supabase.storage.from("resumes").remove([resume.data.storage_path]);
      if (removed.error) warning = "The resume record was deleted, but its stored file needs cleanup";
    }
    return json({ ok: true, warning });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};
