import type { APIRoute } from "astro";
import { assertSameOrigin, safeNext } from "../../../lib/api";
import { createSupabaseServerClient, demoModeEnabled, getSupabaseConfig, publicSiteUrl } from "../../../lib/supabase";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  assertSameOrigin(context);
  const form = await context.request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const next = safeNext(form.get("next"));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return context.redirect("/login?error=email", 303);

  if (!getSupabaseConfig().configured && demoModeEnabled()) {
    context.cookies.set("scout_demo_email", email, { path: "/", httpOnly: true, sameSite: "lax", secure: import.meta.env.PROD, maxAge: 60 * 60 * 24 * 30 });
    return context.redirect(next, 303);
  }

  const supabase = createSupabaseServerClient(context);
  const callback = new URL("/auth/callback", publicSiteUrl(context.request));
  callback.searchParams.set("next", next);
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callback.href, shouldCreateUser: true } });
  if (error) return context.redirect("/login?error=send", 303);
  return context.redirect(`/login?sent=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`, 303);
};
