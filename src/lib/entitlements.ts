import type { SupabaseClient } from "@supabase/supabase-js";
import { planByCode, type Lane } from "../config/plans";

/**
 * Active job profiles allowed without a plan. Onboarding creates one before the member
 * ever reaches checkout, so the free allowance has to cover it.
 */
const FREE_PROFILE_LIMIT = 1;

/**
 * Resumes one job profile may hold. Every upload costs a model call, so this is a cost
 * ceiling rather than a plan feature — it is the same on every plan, and generous enough
 * that no genuine applicant hits it (a default plus a few variants).
 */
export const RESUMES_PER_PROFILE = 10;

export type EntitlementStatus = "active" | "past_due" | "canceled" | "expired";
export type EntitlementReason = "no_plan" | "quota_exhausted" | "past_due" | null;

export interface SubscriptionRow {
  plan_code: string;
  lane: Lane;
  status: EntitlementStatus;
  applications_quota: number;
  applications_used: number;
  current_period_end: string | null;
}

export interface Entitlement {
  paid: boolean;
  lane: Lane | null;
  planCode: string | null;
  status: EntitlementStatus | null;
  applicationsUsed: number;
  applicationsQuota: number;
  applicationsRemaining: number;
  canApply: boolean;
  canActivateAgent: boolean;
  hasHumanAssistant: boolean;
  /** Active job profiles this plan allows. Existing profiles are never revoked. */
  profileLimit: number;
  reason: EntitlementReason;
}

export const EMPTY_ENTITLEMENT: Entitlement = {
  paid: false, lane: null, planCode: null, status: null,
  applicationsUsed: 0, applicationsQuota: 0, applicationsRemaining: 0,
  canApply: false, canActivateAgent: false, hasHumanAssistant: false,
  profileLimit: FREE_PROFILE_LIMIT,
  reason: "no_plan",
};

/**
 * Pure evaluation of what a subscription row permits. Kept free of I/O so the
 * whole matrix — active, past due, canceled, lapsed period, exhausted quota —
 * is unit-testable.
 */
export function evaluateEntitlement(row: SubscriptionRow | null | undefined): Entitlement {
  if (!row) return EMPTY_ENTITLEMENT;

  const periodEnded = row.current_period_end
    ? new Date(row.current_period_end).getTime() < Date.now()
    : false;
  const active = row.status === "active" && !periodEnded;
  const used = Math.max(0, Number(row.applications_used) || 0);
  const quota = Math.max(0, Number(row.applications_quota) || 0);
  const remaining = Math.max(0, quota - used);

  if (!active) {
    return {
      ...EMPTY_ENTITLEMENT,
      lane: row.lane,
      planCode: row.plan_code,
      status: periodEnded ? "expired" : row.status,
      applicationsUsed: used,
      applicationsQuota: quota,
      applicationsRemaining: remaining,
      reason: row.status === "past_due" ? "past_due" : "no_plan",
    };
  }

  const canApply = remaining > 0;
  return {
    paid: true,
    lane: row.lane,
    planCode: row.plan_code,
    status: "active",
    applicationsUsed: used,
    applicationsQuota: quota,
    applicationsRemaining: remaining,
    canApply,
    canActivateAgent: canApply && row.lane === "ai",
    hasHumanAssistant: row.lane === "human",
    // An unrecognised plan code (renamed or retired) must not silently grant more
    // profiles than the free tier.
    profileLimit: planByCode(row.plan_code)?.profileLimit ?? FREE_PROFILE_LIMIT,
    reason: canApply ? null : "quota_exhausted",
  };
}

export async function loadEntitlement(
  userId: string,
  supabase: SupabaseClient | undefined,
  demoMode = false,
): Promise<Entitlement> {
  // Demo mode has no billing backend; grant a full AI plan so the demo stays usable.
  if (demoMode || !supabase) {
    return evaluateEntitlement({
      plan_code: "ai_plus", lane: "ai", status: "active",
      applications_quota: 200, applications_used: 0, current_period_end: null,
    });
  }
  // past_due rows are fetched too, otherwise a member whose card failed is told
  // to "choose a plan" instead of to fix their billing. Active sorts first so a
  // member who repurchased after a failure is not held back by the stale row.
  const { data } = await supabase
    .from("subscriptions")
    .select("plan_code,lane,status,applications_quota,applications_used,current_period_end")
    .eq("user_id", userId)
    .in("status", ["active", "past_due"])
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return evaluateEntitlement(data as SubscriptionRow | null);
}

export function entitlementMessage(entitlement: Entitlement) {
  if (entitlement.reason === "quota_exhausted") return "You have used every application in your plan.";
  if (entitlement.reason === "past_due") return "Your payment did not go through. Update your billing details to continue.";
  return "Choose a plan to let Scout apply for you.";
}

export function paymentRequired(entitlement: Entitlement, lane?: Lane) {
  return new Response(JSON.stringify({
    error: entitlementMessage(entitlement),
    code: "payment_required",
    reason: entitlement.reason,
    lane: lane ?? entitlement.lane ?? null,
  }), { status: 402, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

/** Throws a 402 Response the API route handlers already know how to forward. */
export function assertCanApply(entitlement: Entitlement) {
  if (!entitlement.canApply) throw paymentRequired(entitlement);
}

export function assertCanActivateAgent(entitlement: Entitlement) {
  if (!entitlement.canActivateAgent) throw paymentRequired(entitlement, "ai");
}

export function assertResumeLimit(current: number) {
  if (current < RESUMES_PER_PROFILE) return;
  throw new Response(JSON.stringify({
    error: `A job profile can hold ${RESUMES_PER_PROFILE} resumes. Remove one before adding another.`,
    code: "resume_limit_reached",
    resumeLimit: RESUMES_PER_PROFILE,
  }), { status: 409, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

/**
 * Guards how many *active* job profiles a plan allows — the limit the pricing page
 * advertises ("Up to 3 active job profiles"). It only ever blocks adding or resuming
 * one, so a member whose plan lapsed or downgraded keeps every profile they have.
 */
export function assertProfileLimit(entitlement: Entitlement, activeProfiles: number) {
  if (activeProfiles < entitlement.profileLimit) return;
  const limit = entitlement.profileLimit;
  throw new Response(JSON.stringify({
    error: entitlement.paid
      ? `Your plan covers ${limit} active job profile${limit === 1 ? "" : "s"}. Pause or delete one, or upgrade to add another.`
      : `Choose a plan to run more than ${limit} active job profile${limit === 1 ? "" : "s"}.`,
    code: "profile_limit_reached",
    profileLimit: limit,
    activeProfiles,
    lane: entitlement.lane ?? null,
  }), { status: 402, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
