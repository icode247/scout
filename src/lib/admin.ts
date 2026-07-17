import { createClient } from "@supabase/supabase-js";
import type { APIContext } from "astro";
import { getSupabaseConfig } from "./supabase";

export function adminEmails() {
  return new Set((import.meta.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
}

export function requireAdmin(context: APIContext) {
  const email = context.locals.user?.email?.toLowerCase();
  if (!email || !adminEmails().has(email)) {
    throw new Response(JSON.stringify({ error: "Administrator access required" }), { status: 403, headers: { "content-type": "application/json" } });
  }
  return context.locals.user!;
}

export function createAdminClient() {
  const config = getSupabaseConfig();
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!config.url || !key) throw new Error("Admin service access is not configured");
  return createClient(config.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
