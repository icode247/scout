import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { APIContext } from "astro";

type ServerContext = Pick<APIContext, "cookies" | "request">;

export function getSupabaseConfig() {
  const url = import.meta.env.PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return {
    url,
    publishableKey,
    configured: Boolean(url && publishableKey && !url.includes("YOUR_PROJECT") && !publishableKey.includes("REPLACE_ME")),
  };
}

function requestCookies(request: Request) {
  const header = request.headers.get("cookie") || "";
  if (!header) return [];
  return header.split(";").map((part) => {
    const separator = part.indexOf("=");
    const name = separator >= 0 ? part.slice(0, separator).trim() : part.trim();
    const raw = separator >= 0 ? part.slice(separator + 1).trim() : "";
    let value = raw;
    try { value = decodeURIComponent(raw); } catch {}
    return { name, value };
  }).filter((cookie) => cookie.name);
}

export function createSupabaseServerClient(context: ServerContext): any {
  const config = getSupabaseConfig();
  if (!config.configured || !config.url || !config.publishableKey) {
    throw new Error("Supabase is not configured. Add PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }

  // Supabase fires an async SIGNED_IN / token-refresh notification that re-writes the session
  // cookies on a later tick. Once a route has returned its response (e.g. the OAuth callback's 303),
  // that late write lands after headers are sent — Astro logs a warning and the write is a no-op
  // anyway, since the real cookies already shipped with the response. `sealCookies()` lets a route
  // mark the response committed so these redundant late writes are skipped cleanly.
  let sealed = false;
  const client = (createServerClient as any)(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return requestCookies(context.request);
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
        if (sealed) return;
        cookiesToSet.forEach(({ name, value, options }) => {
          context.cookies.set(name, value, {
            ...options,
            path: options?.path || "/",
            sameSite: options?.sameSite ?? "lax",
            secure: import.meta.env.PROD,
          });
        });
      },
    },
  });
  client.sealCookies = () => { sealed = true; };
  return client;
}

export function createSupabaseTokenClient(token: string): SupabaseClient {
  const config = getSupabaseConfig();
  if (!config.configured || !config.url || !config.publishableKey) {
    throw new Error("Supabase is not configured.");
  }
  return createClient(config.url, config.publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Service-role client. Bypasses RLS, so it is only for server-side work that has
 * no authenticated user to act as: the Dodo webhook, anonymous booking leads, and
 * the board ingest cron. Never construct this from a request path a visitor controls.
 */
export function createSupabaseServiceClient(): SupabaseClient {
  const config = getSupabaseConfig();
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!config.url || !serviceKey || serviceKey.includes("REPLACE_ME")) {
    throw new Error("Supabase service role is not configured. Set SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(config.url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Reads the email out of the Supabase auth cookie WITHOUT verifying the JWT.
 *
 * This exists only so marketing pages can decide whether to render "Sign in" or
 * "Go to dashboard" without paying for a `getUser()` round-trip on every pageview.
 * It is NOT an authorization check and must never gate access to anything —
 * protected routes continue to verify through `supabase.auth.getUser()`.
 */
export function decodeSessionEmail(request: Request): string | null {
  const config = getSupabaseConfig();
  if (!config.url) return null;
  let projectRef = "";
  try { projectRef = new URL(config.url).hostname.split(".")[0]; } catch { return null; }

  const cookies = requestCookies(request);
  const prefix = `sb-${projectRef}-auth-token`;
  const chunks = cookies
    .filter((cookie) => cookie.name === prefix || cookie.name.startsWith(`${prefix}.`))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((cookie) => cookie.value);
  if (!chunks.length) return null;

  let raw = chunks.join("");
  if (raw.startsWith("base64-")) {
    try { raw = Buffer.from(raw.slice(7), "base64").toString("utf8"); } catch { return null; }
  }

  try {
    const session = JSON.parse(raw);
    const token = String(session?.access_token || "");
    const payload = token.split(".")[1];
    if (!payload) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    // An expired token means the nav should render as signed out.
    if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) return null;
    return typeof claims.email === "string" ? claims.email : null;
  } catch {
    return null;
  }
}

export function demoModeEnabled() {
  return import.meta.env.DEV && import.meta.env.SCOUT_DEMO_MODE === "true";
}

export function publicSiteUrl(request?: Request) {
  const configured = import.meta.env.PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (request) return new URL(request.url).origin;
  return "http://localhost:4321";
}
