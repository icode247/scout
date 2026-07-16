import { defineMiddleware } from "astro:middleware";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient, createSupabaseTokenClient, demoModeEnabled, getSupabaseConfig } from "./lib/supabase";
import { getDemoState } from "./lib/demo-store";

const protectedPrefixes = ["/dashboard", "/jobs", "/applications", "/profiles", "/onboarding"];
const protectedApiPrefixes = ["/api/app", "/api/extension", "/_actions"];
const demoUserId = "00000000-0000-4000-8000-000000000001";

function isProtected(pathname: string) {
  return [...protectedPrefixes, ...protectedApiPrefixes].some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.demoMode = false;
  const pathname = context.url.pathname;
  const needsAuth = isProtected(pathname);
  const authRelated = pathname.startsWith("/api/auth") || pathname.startsWith("/auth/");
  if (!needsAuth && !authRelated) return next();

  const config = getSupabaseConfig();
  if (config.configured) {
    const bearer = context.request.headers.get("authorization");
    if (pathname.startsWith("/api/extension") && bearer?.startsWith("Bearer ")) {
      const supabase = createSupabaseTokenClient(bearer.slice(7));
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: "Invalid extension token" }), { status: 401, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
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
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      context.locals.scoutProfile = profile;
    }
    if (needsAuth && !user) {
      const nextPath = encodeURIComponent(pathname + context.url.search);
      return context.redirect(`/login?next=${nextPath}`, 303);
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

  if (needsAuth) return context.redirect("/login?error=configuration", 303);
  return next();
});
