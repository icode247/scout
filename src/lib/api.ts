import type { APIContext } from "astro";
import type { User } from "@supabase/supabase-js";

export function requireUser(context: APIContext): User {
  const user = context.locals.user;
  if (!user) throw new Response(JSON.stringify({ error: "Authentication required" }), { status: 401, headers: { "content-type": "application/json" } });
  return user;
}

export function assertSameOrigin(context: APIContext) {
  const origin = context.request.headers.get("origin");
  if (origin && origin !== context.url.origin) {
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
  return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}
