import { createClient } from "@supabase/supabase-js";
import type { APIContext } from "astro";
import { getSupabaseConfig } from "./supabase";
import { savedHumanAssistant } from "./human-assistants";

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

export type StaffRole = "admin" | "agent";
export interface StaffMember {
  email: string;
  role: StaffRole;
  /** The Human Assistant this login works as, e.g. "Clinton". Null for an admin who does not take clients. */
  assistantName: string | null;
}

/**
 * Agent logins, as `email=Assistant Name` pairs separated by commas:
 *   AGENT_EMAILS=angela@applyscout.app=Angela Price,clinton@applyscout.app=Clinton
 * An admin listed here as well also works as that assistant.
 */
export function agentAssignments() {
  const map = new Map<string, string>();
  for (const entry of (import.meta.env.AGENT_EMAILS || "").split(",")) {
    const [email, ...name] = entry.split("=");
    const cleanEmail = email?.trim().toLowerCase();
    const cleanName = name.join("=").trim();
    if (cleanEmail && cleanName) map.set(cleanEmail, cleanName);
  }
  return map;
}

/** The operations role for an email, or null for clients and visitors. */
export function staffMember(email: string | null | undefined): StaffMember | null {
  const clean = email?.trim().toLowerCase();
  if (!clean) return null;
  const assistantName = agentAssignments().get(clean) ?? null;
  if (adminEmails().has(clean)) return { email: clean, role: "admin", assistantName };
  if (assistantName) return { email: clean, role: "agent", assistantName };
  return null;
}

/** Admins and agents. Agents are then limited to their own clients with `canWorkClient`. */
export function requireStaff(context: APIContext): StaffMember {
  const staff = staffMember(context.locals.user?.email);
  if (!staff) {
    throw new Response(JSON.stringify({ error: "Operations access required" }), { status: 403, headers: { "content-type": "application/json" } });
  }
  return staff;
}

/** Admins see every client; an agent only the clients assigned to their assistant name. */
export function canWorkClient(staff: StaffMember, clientAssistantName: string | null | undefined) {
  if (staff.role === "admin") return true;
  return Boolean(staff.assistantName && clientAssistantName && sameAssistant(staff.assistantName, clientAssistantName));
}

/** Compares by the canonical assistant, so a client saved under a former name still matches. */
function sameAssistant(a: string, b: string) {
  const left = savedHumanAssistant(a)?.name ?? a.trim();
  const right = savedHumanAssistant(b)?.name ?? b.trim();
  return left.toLowerCase() === right.toLowerCase();
}

/** Loads the client's assigned assistant and throws 403 when this staff member may not work them. */
export async function assertCanWorkClient(staff: StaffMember, admin: ReturnType<typeof createAdminClient>, userId: string) {
  if (staff.role === "admin") return;
  const profile = await admin.from("profiles").select("assistant_name").eq("user_id", userId).maybeSingle();
  if (profile.error) throw profile.error;
  if (!canWorkClient(staff, profile.data?.assistant_name)) {
    throw new Response(JSON.stringify({ error: "This client is assigned to another assistant" }), { status: 403, headers: { "content-type": "application/json" } });
  }
}

export function createAdminClient() {
  const config = getSupabaseConfig();
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!config.url || !key) throw new Error("Admin service access is not configured");
  return createClient(config.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
