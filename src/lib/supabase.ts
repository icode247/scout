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

  return (createServerClient as any)(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return requestCookies(context.request);
      },
      setAll(cookiesToSet) {
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

export function demoModeEnabled() {
  return import.meta.env.DEV || import.meta.env.SCOUT_DEMO_MODE === "true";
}

export function publicSiteUrl(request?: Request) {
  const configured = import.meta.env.PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (request) return new URL(request.url).origin;
  return "http://localhost:4321";
}
