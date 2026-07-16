import type { APIRoute } from "astro";
import { assertSameOrigin, errorMessage, json, requireUser } from "../../../lib/api";
import { getDemoState } from "../../../lib/demo-store";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const form = await context.request.formData();
    const file = form.get("resume");
    if (!(file instanceof File) || !file.size) return json({ error: "Choose a resume file" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return json({ error: "Resume must be under 10 MB" }, { status: 400 });
    if (context.locals.demoMode) {
      const resume = { id: crypto.randomUUID(), name: file.name, kind: "original" as const, storage_path: null, created_at: new Date().toISOString() };
      getDemoState(user.id, user.email).resumes.unshift(resume);
      return json({ ok: true, resume });
    }
    const supabase = context.locals.supabase!;
    const path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const upload = await supabase.storage.from("resumes").upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;
    const result = await supabase.from("resumes").insert({ user_id: user.id, name: file.name, storage_path: path, extracted_data: { status: "queued" } }).select("*").single();
    if (result.error) throw result.error;
    return json({ ok: true, resume: result.data });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};
