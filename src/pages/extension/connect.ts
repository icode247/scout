import type { APIRoute } from "astro";
import { getSupabaseConfig } from "../../lib/supabase";
import { chromeExtensionIds } from "../../lib/extension";
import { escapeHtml } from "../../lib/email";

export const prerender = false;

/** The extension id in a chrome.identity redirect URI, or null when it is not one. */
function redirectExtensionId(value: string) {
  try {
    const url = new URL(value);
    const match = url.hostname.match(/^([a-p]{32})\.chromiumapp\.org$/);
    if (url.protocol !== "https:" || url.username || url.password || !match) return null;
    return match[1];
  } catch {
    return null;
  }
}

/**
 * Chrome's sign-in window only reports "Authorization page could not be loaded"
 * for an error status, which hides the reason. Problems are shown as a readable
 * page instead (and logged), so the person and support can see what went wrong.
 */
function problem(title: string, detail: string) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Connect Scout</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#f4ffeb;font-family:Arial,sans-serif;color:#14210f}main{max-width:420px;padding:32px 24px;text-align:center}p{color:#3d4a35;line-height:1.5}code{font-size:12px;background:#fff;padding:2px 6px;border-radius:6px}</style>
</head><body><main><h1 style="font-size:24px;margin:0">${escapeHtml(title)}</h1><p>${detail}</p><p>Close this window and try again, or email <a href="mailto:support@applyscout.app">support@applyscout.app</a>.</p></main></body></html>`, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export const GET: APIRoute = async (context) => {
  const redirectUri = context.url.searchParams.get("redirect_uri") || "";
  const extensionId = redirectExtensionId(redirectUri);
  const allowed = chromeExtensionIds();

  if (!extensionId) {
    console.error("[extension/connect] invalid redirect_uri", { redirectUri });
    return problem("This link is not from the Scout extension", "Open the Scout extension and press Connect from there.");
  }
  // Local development accepts any unpacked build; production only the configured ids.
  if (!(allowed.includes(extensionId) || (import.meta.env.DEV && !allowed.length))) {
    console.error("[extension/connect] extension id not allowed", { extensionId, allowed });
    return problem(
      "This copy of the extension is not recognised",
      allowed.length
        ? `Install Scout from the Chrome Web Store, then connect again. (Extension <code>${escapeHtml(extensionId)}</code> is not on Scout's allowed list.)`
        : "Scout's extension connection is not configured yet.",
    );
  }

  const supabase = context.locals.supabase!;
  const { data: { session }, error } = await supabase.auth.getSession();
  const config = getSupabaseConfig();
  if (error || !session) {
    // Signed out, or the session cookie could not be read: sign in, then come straight back.
    return context.redirect(`/login?next=${encodeURIComponent(context.url.pathname + context.url.search)}`, 303);
  }
  if (!config.url || !config.publishableKey) {
    console.error("[extension/connect] Supabase config missing");
    return problem("Scout could not connect", "The connection service is not configured. Please contact support.");
  }

  const destination = new URL(redirectUri);
  destination.hash = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: String(session.expires_at || Math.floor(Date.now() / 1000) + 3600),
    supabase_url: config.url,
    supabase_key: config.publishableKey,
  }).toString();

  return context.redirect(destination.toString(), 302);
};
