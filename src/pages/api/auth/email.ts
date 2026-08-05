import type { APIRoute } from "astro";
import { assertSameOrigin, safeNext } from "../../../lib/api";
import { createSupabaseServerClient, demoModeEnabled, getSupabaseConfig, publicSiteUrl, sealSupabaseCookies } from "../../../lib/supabase";
import { rateLimit, clientIp } from "../../../lib/rate-limit";

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

  // Throttle unauthenticated magic-link sends: per-IP against bulk abuse, and per-email so a
  // single address cannot be bombed. Both fail open if the limiter errors.
  const ip = clientIp(context.request);
  const ipAllowed = (await rateLimit(supabase, `auth-otp-ip:${ip}`, { max: 10, windowSeconds: 60 })).allowed;
  const emailAllowed = (await rateLimit(supabase, `auth-otp-email:${email}`, { max: 5, windowSeconds: 600 })).allowed;
  if (!ipAllowed || !emailAllowed) return context.redirect(`/login?error=rate&next=${encodeURIComponent(next)}`, 303);

  const callback = new URL("/auth/callback", publicSiteUrl(context.request));
  callback.searchParams.set("next", next);
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callback.href, shouldCreateUser: true } });
  // See the note in api/auth/google.ts: seal before redirecting so Supabase's
  // late cookie write does not land after headers are sent.
  sealSupabaseCookies(supabase);
  if (error) return context.redirect("/login?error=send", 303);
  return context.redirect(`/login?sent=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`, 303);
};
