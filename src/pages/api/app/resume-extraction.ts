import type { APIRoute } from "astro";
import { assertSameOrigin, errorMessage, json, requireUser } from "../../../lib/api";
import { extractResume, validateResumeFile } from "../../../lib/resume";

export const prerender = false;
export const maxDuration = 60;

export const GET: APIRoute = async (context) => {
  try {
    const user = requireUser(context);
    const id = context.url.searchParams.get("id");
    if (!id) return json({ error: "Resume id is required" }, { status: 400 });
    const result = await context.locals.supabase!.from("resumes").select("id,name,extracted_data,extraction_status,extraction_error").eq("id", id).eq("user_id", user.id).single();
    if (result.error) throw result.error;
    return json({ resume: result.data });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};

export const POST: APIRoute = async (context) => {
  let resumeId: string | null = null;
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const form = await context.request.formData();
    const file = form.get("resume");
    if (!(file instanceof File)) return json({ error: "Choose a resume file" }, { status: 400 });
    await validateResumeFile(file);

    if (context.locals.demoMode) {
      return json({ resume: { id: crypto.randomUUID(), name: file.name, extraction_status: "failed", extraction_error: "Extraction is unavailable in demo mode", extracted_data: {} }, manual_entry: true });
    }

    const supabase = context.locals.supabase!;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = user.id + "/" + crypto.randomUUID() + "-" + safeName;
    const upload = await supabase.storage.from("resumes").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (upload.error) throw upload.error;

    const inserted = await supabase.from("resumes").insert({
      user_id: user.id, name: file.name, storage_path: path,
      extracted_data: { version: 1, status: "processing" },
      extraction_status: "processing", extraction_started_at: new Date().toISOString(),
    }).select("id,name").single();
    if (inserted.error) {
      await supabase.storage.from("resumes").remove([path]);
      throw inserted.error;
    }
    resumeId = inserted.data.id;

    try {
      const extracted = await extractResume(file);
      const updated = await supabase.from("resumes").update({
        extracted_data: extracted, extraction_status: "complete", extraction_error: null,
        extraction_completed_at: new Date().toISOString(),
      }).eq("id", resumeId).eq("user_id", user.id).select("id,name,extracted_data,extraction_status").single();
      if (updated.error) throw updated.error;
      return json({ resume: updated.data });
    } catch (extractionError) {
      const message = errorMessage(extractionError);
      await supabase.from("resumes").update({
        extracted_data: { version: 1, status: "failed" }, extraction_status: "failed",
        extraction_error: message, extraction_completed_at: new Date().toISOString(),
      }).eq("id", resumeId).eq("user_id", user.id);
      return json({ resume: { id: resumeId, name: file.name, extraction_status: "failed", extraction_error: message, extracted_data: {} }, manual_entry: true });
    }
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error), resume_id: resumeId }, { status: 400 });
  }
};
