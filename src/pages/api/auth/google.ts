import type { APIRoute } from "astro";
import { safeNext } from "../../../lib/api";
import { createSupabaseServerClient, demoModeEnabled, getSupabaseConfig, publicSiteUrl, sealSupabaseCookies } from "../../../lib/supabase";

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
  // Supabase emits an async auth notification that tries to write cookies on a
  // later tick — after this redirect has already shipped its headers. Sealing
  // first turns that no-op write into a clean skip instead of an Astro warning.
  sealSupabaseCookies(supabase);
  if (error || !data.url) return context.redirect("/login?error=oauth", 303);
  return context.redirect(data.url, 303);
};
