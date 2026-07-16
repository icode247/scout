import type { APIRoute } from "astro";
import { json, requireUser } from "../../../../lib/api";
import { getDemoState } from "../../../../lib/demo-store";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const user = requireUser(context);
  const id = context.params.id!;
  if (context.locals.demoMode) {
    const resume = getDemoState(user.id, user.email).resumes.find((item) => item.id === id);
    return resume ? json({ name: resume.name, demo: true }) : json({ error: "Resume not found" }, { status: 404 });
  }
  const supabase = context.locals.supabase!;
  const result = await supabase.from("resumes").select("name,storage_path").eq("id", id).eq("user_id", user.id).single();
  if (result.error || !result.data.storage_path) return json({ error: "Resume not found" }, { status: 404 });
  const signed = await supabase.storage.from("resumes").createSignedUrl(result.data.storage_path, 60);
  if (signed.error) return json({ error: signed.error.message }, { status: 400 });
  return context.redirect(signed.data.signedUrl, 302);
};
