import { defineMiddleware } from "astro:middleware";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient, createSupabaseTokenClient, decodeSessionEmail, demoModeEnabled, getSupabaseConfig } from "./lib/supabase";
import { getDemoState } from "./lib/demo-store";
import { EMPTY_ENTITLEMENT, loadEntitlement } from "./lib/entitlements";
import { isNonIndexablePath } from "./config/seo";

const memberPrefixes = ["/dashboard", "/agent", "/jobs", "/ai-jobs", "/applications", "/profiles", "/settings"];
const adminPrefixes = ["/admin"];
const protectedPrefixes = [...memberPrefixes, "/onboarding", "/extension/connect"];
// /api/billing/webhook is deliberately absent: it is called by Dodo, not the
// browser, and authenticates itself with a Standard Webhooks signature.
const protectedApiPrefixes = ["/api/app", "/api/admin", "/api/extension", "/_actions", "/api/billing/checkout", "/api/billing/portal", "/api/billing/status"];
const demoUserId = "00000000-0000-4000-8000-000000000001";
const extensionCors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

function configurationError(pathname: string) {
  const message = "Scout authentication is not configured. Set the required Supabase environment variables.";
  if (pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ error: message, code: "configuration_missing" }), {
      status: 503,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  const body = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>Scout configuration error</title></head><body><main style=\"max-width:42rem;margin:10vh auto;padding:2rem;font-family:system-ui\"><h1>Scout is not configured</h1><p>" + message + "</p></main></body></html>";
  return new Response(body, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

/**
 * Astro's router logs "Error while trying to render the route <path>" and drops the cause,
 * so a production 500 gives no message, no stack and no file — which is exactly what
 * happened to /jobs. Re-throw untouched; this only adds the detail to the log.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  try {
    const response = await handle(context, next);
    if (!isNonIndexablePath(context.url.pathname)) return response;

    // Protected and utility routes often redirect before their HTML-level
    // noindex tag can be rendered. Preserve that directive on the response so
    // crawlers receive it even when signed-out traffic is sent to /login.
    const headers = new Headers(response.headers);
    headers.set("X-Robots-Tag", "noindex, nofollow");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.error(
      `[middleware] ${context.request.method} ${context.url.pathname} threw:`,
      error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error),
      error instanceof Error && error.cause ? `\ncause: ${error.cause}` : "",
    );
    throw error;
  }
});

const handle = async (context: Parameters<Parameters<typeof defineMiddleware>[0]>[0], next: Parameters<Parameters<typeof defineMiddleware>[0]>[1]) => {
  context.locals.demoMode = false;
  context.locals.entitlement = EMPTY_ENTITLEMENT;
  const pathname = context.url.pathname;

  if (pathname.startsWith("/api/extension") && context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: extensionCors });
  }

  const needsAuth = matchesPrefix(pathname, [...protectedPrefixes, ...adminPrefixes, ...protectedApiPrefixes]);
  const authRelated = pathname.startsWith("/api/auth") || pathname.startsWith("/auth/");
  if (!needsAuth && !authRelated) {
    // Marketing pages skip the whole auth pipeline, so `locals.user` is never set
    // here. The header still needs to know whether to show "Sign in" or "Go to
    // dashboard", so decode the cookie's email without verifying the JWT. This is
    // a rendering hint ONLY — it gates nothing, and every protected route above
    // continues to verify through supabase.auth.getUser().
    // Prerendered routes have no real request to read, and personalizing a page
    // baked at build time is meaningless — reading headers there only produces
    // an Astro warning. Every marketing page that matters is server-rendered.
    if (context.request.method === "GET" && !pathname.startsWith("/api/") && !context.isPrerendered) {
      try { context.locals.sessionEmail = decodeSessionEmail(context.request); } catch { context.locals.sessionEmail = null; }
    }
    return next();
  }

  const config = getSupabaseConfig();
  if (config.configured) {
    const bearer = context.request.headers.get("authorization");
    if (pathname.startsWith("/api/extension") && bearer?.startsWith("Bearer ")) {
      const supabase = createSupabaseTokenClient(bearer.slice(7));
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Invalid extension token" }), {
          status: 401,
          headers: { "content-type": "application/json", ...extensionCors },
        });
      }
      context.locals.supabase = supabase;
      context.locals.user = user;
      const [profileResult, entitlement] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
        loadEntitlement(user.id, supabase, false),
      ]);
      context.locals.scoutProfile = profileResult.data;
      context.locals.entitlement = entitlement;
      return next();
    }

    const supabase = createSupabaseServerClient(context);
    context.locals.supabase = supabase;
    const { data: { user } } = await supabase.auth.getUser();
    context.locals.user = user ?? undefined;

    let profile: any = null;
    if (user) {
      // One round-trip: the profile and the entitlement resolve together.
      const [profileResult, entitlement] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
        loadEntitlement(user.id, supabase, false),
      ]);
      profile = profileResult.data;
      context.locals.scoutProfile = profile;
      context.locals.entitlement = entitlement;
      context.locals.sessionEmail = user.email ?? null;
    }

    if (needsAuth && !user) {
      if (pathname.startsWith("/api/")) {
        return new Response(JSON.stringify({ error: "Your session has expired. Sign in again." }), {
          status: 401,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      }
      const nextPath = encodeURIComponent(pathname + context.url.search);
      return context.redirect("/login?next=" + nextPath, 303);
    }

    if (user && matchesPrefix(pathname, memberPrefixes) && profile?.onboarding_complete !== true) {
      const intent = profile?.assistant_type === "ai" ? "?intent=ai" : profile?.assistant_type === "human" ? "?intent=human" : "";
      return context.redirect("/onboarding" + intent, 303);
    }

    if (user && pathname === "/onboarding" && profile?.onboarding_complete === true) {
      return context.redirect("/dashboard", 303);
    }

    return next();
  }

  if (demoModeEnabled()) {
    context.locals.demoMode = true;
    const email = context.cookies.get("scout_demo_email")?.value || "alex@example.com";
    const demoUser = {
      id: demoUserId,
      aud: "authenticated",
      role: "authenticated",
      email,
      app_metadata: { provider: "demo", providers: ["demo"] },
      user_metadata: { full_name: "Alex Kim" },
      identities: [],
      created_at: new Date().toISOString(),
    } as unknown as User;
    context.locals.user = demoUser;
    context.locals.scoutProfile = getDemoState(demoUserId, email).profile;
    context.locals.entitlement = await loadEntitlement(demoUserId, undefined, true);
    context.locals.sessionEmail = email;
    return next();
  }

  return configurationError(pathname);
};
