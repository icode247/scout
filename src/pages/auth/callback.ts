import type { APIContext, APIRoute } from "astro";
import type { User } from "@supabase/supabase-js";
import { safeNext } from "../../lib/api";
import { createSupabaseServerClient } from "../../lib/supabase";
import { escapeHtml } from "../../lib/email";
import { getPostHogServer } from "../../lib/posthog-server";
import { sendGoogleAnalyticsEvent } from "../../lib/google-analytics";

export const prerender = false;

type OtpType = "email" | "magiclink";
const otpType = (value: unknown): OtpType | null => (value === "email" || value === "magiclink" ? value : null);

async function recordSignIn(user: User | null | undefined, method: string) {
  if (!user) return;
  const posthog = getPostHogServer();
  if (posthog) {
    posthog.identify({ distinctId: user.id, properties: { name: user.user_metadata?.full_name || undefined } });
    posthog.capture({ distinctId: user.id, event: "user_signed_in", properties: { method } });
    await posthog.flush();
  }
  await sendGoogleAnalyticsEvent({ userId: user.id, name: "login", params: { method } })
    .catch((analyticsError) => console.error("[google-analytics] login event failed", analyticsError));
}

function signIn(context: APIContext) {
  const supabase = createSupabaseServerClient(context);
  // Seal cookie writes before sending the response so Supabase's async post-sign-in cookie
  // re-write (which fires after this redirect) does not warn about writing after headers are sent.
  const finish = (to: string) => { supabase.sealCookies(); return context.redirect(to, 303); };
  // Keep the destination on failure, so a fresh link still lands the member where they were going.
  const failed = (next: string) => finish(`/login?error=callback&next=${encodeURIComponent(next)}`);
  return { supabase, finish, failed };
}

/**
 * A page that signs in only when submitted. Email security scanners open every
 * link in a message; if this GET verified the one-time token, the scanner would
 * use it up and the member would see "invalid or expired". Some scanners also run
 * scripts, so nothing submits automatically: the person taps the button.
 */
function continuePage(tokenHash: string, type: OtpType, next: string) {
  const field = (name: string, value: string) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Sign in · Scout</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#f4ffeb;font-family:Arial,sans-serif;color:#14210f}main{max-width:380px;padding:32px 24px;text-align:center}button{margin-top:20px;border:0;border-radius:999px;background:#14210f;color:#fff;font-weight:700;font-size:16px;padding:14px 26px;cursor:pointer}p{color:#3d4a35}</style>
</head><body><main><h1 style="margin:0;font-size:26px">Almost there</h1><p>Tap the button to open your Scout account.</p>
<form id="continue" method="post" action="/auth/callback">${field("token_hash", tokenHash)}${field("type", type)}${field("next", next)}<button type="submit">Continue to Scout</button></form></main>
</body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}

export const GET: APIRoute = async (context) => {
  const next = safeNext(context.url.searchParams.get("next"));
  const code = context.url.searchParams.get("code");
  const tokenHash = context.url.searchParams.get("token_hash");
  const type = otpType(context.url.searchParams.get("type"));

  // Email links carry a one-time token: show the continue page instead of spending it here.
  if (tokenHash && type) return continuePage(tokenHash, type, next);

  const { supabase, finish, failed } = signIn(context);
  if (code) {
    // Google sign-in (and older Supabase emails) return a PKCE code to the same browser.
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await recordSignIn(data?.user, data?.user?.app_metadata?.provider || "google");
      return finish(next);
    }
  }
  return failed(next);
};

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData().catch(() => null);
  const next = safeNext(form?.get("next"));
  const tokenHash = String(form?.get("token_hash") || "");
  const type = otpType(form?.get("type"));
  const { supabase, finish, failed } = signIn(context);
  if (!tokenHash || !type) return failed(next);
  // "email" is Supabase's documented type for token-hash sign-in links; links
  // minted as "magiclink" are retried with their own type for older emails.
  let result = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (result.error && type !== "email") result = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (result.error) {
    console.error("[auth] sign-in link rejected", { code: (result.error as any).code, status: result.error.status, message: result.error.message });
    return failed(next);
  }
  await recordSignIn(result.data?.user, "magic_link");
  return finish(next);
};
