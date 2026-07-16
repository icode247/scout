import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";
import { assertSameOrigin, errorMessage, json, requireUser } from "../../../lib/api";
import { resetDemoState } from "../../../lib/demo-store";
import { getSupabaseConfig } from "../../../lib/supabase";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const form = await context.request.formData();
    if (String(form.get("confirmation") || "").trim().toUpperCase() !== "DELETE") {
      return context.redirect("/delete-account?error=confirmation", 303);
    }
    if (context.locals.demoMode) {
      resetDemoState(user.id, user.email);
      context.cookies.delete("scout_demo_email", { path: "/" });
      return context.redirect("/login?deleted=1", 303);
    }
    const supabase = context.locals.supabase!;
    const resumeObjects = await supabase.storage.from("resumes").list(user.id, { limit: 1000 });
    if (resumeObjects.data?.length) await supabase.storage.from("resumes").remove(resumeObjects.data.map((item:any) => `${user.id}/${item.name}`));
    const evidenceObjects = await supabase.storage.from("application-evidence").list(user.id, { limit: 1000 });
    if (evidenceObjects.data?.length) await supabase.storage.from("application-evidence").remove(evidenceObjects.data.map((item:any) => `${user.id}/${item.name}`));
    const config = getSupabaseConfig();
    const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!config.url || !serviceKey) return context.redirect("/delete-account?error=configuration", 303);
    const admin = createClient(config.url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await admin.auth.admin.deleteUser(user.id);
    if (result.error) throw result.error;
    await supabase.auth.signOut();
    return context.redirect("/login?deleted=1", 303);
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};
