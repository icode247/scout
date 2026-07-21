import type { APIRoute } from "astro";
import { getSupabaseConfig } from "../../lib/supabase";

export const prerender = false;

function validChromeRedirect(value: string) {
  try {
    const url = new URL(value);
    const configuredId = import.meta.env.PUBLIC_CHROME_EXTENSION_ID?.trim();
    const allowedHost = configuredId
      ? `${configuredId}.chromiumapp.org`
      : import.meta.env.DEV && /^[a-p]{32}\.chromiumapp\.org$/.test(url.hostname)
        ? url.hostname
        : "";
    return url.protocol === "https:"
      && url.hostname === allowedHost
      && url.username === ""
      && url.password === "";
  } catch {
    return false;
  }
}

export const GET: APIRoute = async (context) => {
  const redirectUri = context.url.searchParams.get("redirect_uri") || "";
  if (import.meta.env.PROD && !import.meta.env.PUBLIC_CHROME_EXTENSION_ID?.trim()) {
    return new Response("Scout's Chrome extension ID is not configured.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  if (!validChromeRedirect(redirectUri)) {
    return new Response("Invalid Chrome extension redirect URI.", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const supabase = context.locals.supabase!;
  const { data: { session }, error } = await supabase.auth.getSession();
  const config = getSupabaseConfig();
  if (error || !session || !config.url || !config.publishableKey) {
    return new Response("Unable to connect Scout. Please sign in again.", {
      status: 401,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
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
