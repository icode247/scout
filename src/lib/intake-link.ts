/**
 * Personal intake links: /intake?t=<token>. The token names a Scout account and is signed, so the
 * questionnaire can show that client the details already on file (lib/applicant-intake.ts,
 * INTAKE_PREFILL_KEYS) without any of them in the URL, and nobody can open someone else's by
 * guessing. The signing key is derived from the Supabase service-role key, which only the server
 * holds; rotating that key retires every link, and operations copy a fresh one from the client page.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pickIntakePrefill, type IntakePrefill } from "./applicant-intake";

const USER_HEX = /^[0-9a-f]{32}$/;

function signature(userHex: string, secret: string) {
  return createHmac("sha256", secret).update(`scout-intake-link:${userHex}`).digest("base64url").slice(0, 22);
}

export function createIntakeToken(userId: string, secret: string) {
  const hex = userId.replaceAll("-", "").toLowerCase();
  if (!USER_HEX.test(hex) || !secret) throw new Error("An intake link needs a user id and a signing key.");
  return `${hex}.${signature(hex, secret)}`;
}

/** The user id a token names, or null for anything malformed or not signed with this key. */
export function readIntakeToken(token: string, secret: string): string | null {
  const [hex = "", given = "", extra] = token.split(".");
  if (!secret || extra !== undefined || !USER_HEX.test(hex)) return null;
  const expected = Buffer.from(signature(hex, secret));
  const actual = Buffer.from(given);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** What the client's link shows: their account email, the name and answers from their latest intake, and the WhatsApp number on their account if the intake has none. */
export async function loadIntakePrefill(supabase: SupabaseClient, userId: string): Promise<{ email: string; name: string; answers: IntakePrefill } | null> {
  const profile = await supabase.from("profiles").select("full_name,email,whatsapp_phone").eq("user_id", userId).maybeSingle();
  if (profile.error) throw profile.error;
  const email = String(profile.data?.email || "").toLowerCase();
  if (!email) return null;
  const intake = await supabase.from("assistant_intakes").select("full_name,answers").eq("email", email).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (intake.error) throw intake.error;
  const answers = pickIntakePrefill(intake.data?.answers || {});
  if (!answers.whatsappPhone && profile.data?.whatsapp_phone) answers.whatsappPhone = profile.data.whatsapp_phone;
  return { email, name: intake.data?.full_name || profile.data?.full_name || "", answers };
}
