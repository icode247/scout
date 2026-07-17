import { defineMiddleware } from "astro:middleware";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient, createSupabaseTokenClient, demoModeEnabled, getSupabaseConfig } from "./lib/supabase";
import { getDemoState } from "./lib/demo-store";

const memberPrefixes = ["/dashboard", "/agent", "/jobs", "/ai-jobs", "/applications", "/profiles", "/settings"];
const adminPrefixes = ["/admin"];
const protectedPrefixes = [...memberPrefixes, "/onboarding"];
const protectedApiPrefixes = ["/api/app", "/api/admin", "/api/extension", "/_actions"];
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

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.demoMode = false;
  const pathname = context.url.pathname;

  if (pathname.startsWith("/api/extension") && context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: extensionCors });
  }

  const needsAuth = matchesPrefix(pathname, [...protectedPrefixes, ...adminPrefixes, ...protectedApiPrefixes]);
  const authRelated = pathname.startsWith("/api/auth") || pathname.startsWith("/auth/");
  if (!needsAuth && !authRelated) return next();

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
      const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      context.locals.scoutProfile = profile;
      return next();
    }

    const supabase = createSupabaseServerClient(context);
    context.locals.supabase = supabase;
    const { data: { user } } = await supabase.auth.getUser();
    context.locals.user = user ?? undefined;

    let profile: any = null;
    if (user) {
      const result = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      profile = result.data;
      context.locals.scoutProfile = profile;
    }

    if (needsAuth && !user) {
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
    return next();
  }

  return configurationError(pathname);
});
