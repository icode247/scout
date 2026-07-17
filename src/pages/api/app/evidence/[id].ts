import type { APIRoute } from "astro";
import { json, requireUser } from "../../../../lib/api";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const user = requireUser(context);
  const id = context.params.id!;
  if (context.locals.demoMode) return json({ error: "Evidence preview is unavailable in demo mode" }, { status: 404 });
  const supabase = context.locals.supabase!;
  const result = await supabase.from("application_evidence").select("storage_path").eq("id", id).eq("user_id", user.id).single();
  if (result.error) return json({ error: "Evidence not found" }, { status: 404 });
  const signed = await supabase.storage.from("application-evidence").createSignedUrl(result.data.storage_path, 60);
  if (signed.error) return json({ error: signed.error.message }, { status: 400 });
  return context.redirect(signed.data.signedUrl, 302);
};
