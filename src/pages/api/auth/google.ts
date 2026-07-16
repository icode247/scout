import type { APIRoute } from "astro";
import { safeNext } from "../../../lib/api";
import { createSupabaseServerClient, demoModeEnabled, getSupabaseConfig, publicSiteUrl } from "../../../lib/supabase";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const next = safeNext(context.url.searchParams.get("next"));
  if (!getSupabaseConfig().configured && demoModeEnabled()) {
    context.cookies.set("scout_demo_email", "alex@example.com", { path: "/", httpOnly: true, sameSite: "lax", secure: import.meta.env.PROD, maxAge: 60 * 60 * 24 * 30 });
    return context.redirect(next, 303);
  }
  const supabase = createSupabaseServerClient(context);
  const callback = new URL("/auth/callback", publicSiteUrl(context.request));
  callback.searchParams.set("next", next);
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback.href } });
  if (error || !data.url) return context.redirect("/login?error=oauth", 303);
  return context.redirect(data.url, 303);
};
