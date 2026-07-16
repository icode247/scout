import type { APIRoute } from "astro";
import { assertSameOrigin, errorMessage, json, list, readBody, requireUser } from "../../../lib/api";
import { getDemoState } from "../../../lib/demo-store";

export const prerender = false;
const allowedResumeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function validateResume(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB.`);
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!allowedResumeTypes.has(file.type) && !["pdf", "doc", "docx"].includes(extension || "")) {
    throw new Error(`${file.name} must be a PDF, DOC, or DOCX file.`);
  }
}

export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const contentType = context.request.headers.get("content-type") || "";
    let body: Record<string, any>;
    let files: File[] = [];
    if (contentType.includes("multipart/form-data")) {
      const form = await context.request.formData();
      body = Object.fromEntries(form.entries());
      files = form.getAll("resumes").filter((value): value is File => value instanceof File && value.size > 0);
    } else {
      body = await readBody(context.request);
    }
    files.forEach(validateResume);
    const record = {
      name: String(body.name || "New job profile").trim(),
      assistant_type: body.assistant_type === "human" ? "human" : "ai",
      target_roles: list(body.target_roles),
      locations: list(body.locations),
      salary_min: Number(body.salary_min) || null,
      resume_behavior: body.resume_behavior === "original" ? "original" : "tailor",
      active: true,
    } as const;

    if (context.locals.demoMode) {
      const state = getDemoState(user.id, user.email);
      const uploaded = files.map((file) => {
        const resume = { id: crypto.randomUUID(), name: file.name, kind: "original" as const, storage_path: null, created_at: new Date().toISOString() };
        state.resumes.unshift(resume);
        return resume;
      });
      const item = { id: crypto.randomUUID(), ...record, resume_ids: uploaded.map((resume) => resume.id) };
      state.jobProfiles.unshift(item);
      return json({ ok: true, profile: item, resumes: uploaded });
    }

    const supabase = context.locals.supabase!;
    const uploaded: Array<{ id: string; name: string; storage_path: string }> = [];
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
      const storage = await supabase.storage.from("resumes").upload(path, file, { contentType: file.type, upsert: false });
      if (storage.error) throw storage.error;
      const resume = await supabase.from("resumes").insert({ user_id: user.id, name: file.name, kind: "original", storage_path: path, extracted_data: { status: "queued" } }).select("id,name,storage_path").single();
      if (resume.error) throw resume.error;
      uploaded.push(resume.data);
    }

    const result = await supabase.from("job_profiles").insert({ user_id: user.id, ...record, resume_id: uploaded[0]?.id || null }).select("*").single();
    if (result.error) throw result.error;
    if (uploaded.length) {
      const links = uploaded.map((resume, index) => ({ user_id: user.id, job_profile_id: result.data.id, resume_id: resume.id, is_primary: index === 0 }));
      const linked = await supabase.from("job_profile_resumes").insert(links);
      if (linked.error) throw linked.error;
    }
    return json({ ok: true, profile: { ...result.data, resume_ids: uploaded.map((resume) => resume.id) }, resumes: uploaded });
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
    const result = await context.locals.supabase!.from("job_profiles").delete().eq("id", id).eq("user_id", user.id);
    if (result.error) throw result.error;
    return json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};
