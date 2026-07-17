import type { APIContext } from "astro";
import type { User } from "@supabase/supabase-js";

export function requireUser(context: APIContext): User {
  const user = context.locals.user;
  if (!user) throw new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { "content-type": "application/json" } });
  return user;
}

export function assertSameOrigin(context: APIContext) {
  const origin = context.request.headers.get("origin");
  const referer = context.request.headers.get("referer");
  let requestOrigin = origin;
  if (!requestOrigin && referer) {
    try { requestOrigin = new URL(referer).origin; } catch { requestOrigin = null; }
  }
  if (!requestOrigin || requestOrigin !== context.url.origin) {
    throw new Response(JSON.stringify({ error: "Invalid request origin" }), { status: 403, headers: { "content-type": "application/json" } });
  }
}

export function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), { ...init, headers: { "content-type": "application/json", ...(init.headers || {}) } });
}

export async function readBody(request: Request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) return await request.json() as Record<string, any>;
  const form = await request.formData();
  return Object.fromEntries(form.entries()) as Record<string, any>;
}

export function list(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

export function safeNext(value: unknown, fallback = "/onboarding") {
  const path = String(value || "");
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return fallback;
  try {
    const base = "https://scout.invalid";
    const url = new URL(path, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}

export function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && error.message) return error.message;
  return "Something went wrong";
}
