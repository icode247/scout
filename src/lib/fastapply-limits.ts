/**
 * The customer's plan, pushed to FastApply as per-applicant limits.
 *
 * FastApply enforces a beneficiary's plan at apply time (`PUT /api/v1/applicants/:id`
 * with `monthlyApplicationLimit`, `dailyApplicationLimit`, `limitPeriodStartedAt`;
 * see its enterprise-reseller-integration guide). Until Scout pushed these, a
 * customer whose Scout plan ended kept applying for as long as their automation
 * lived. The rule now:
 *
 * - an active plan → the plan's monthly rate, anchored to the billing period start
 *   (a quarterly plan is "3x the monthly allowance", so it sends the monthly third);
 * - anything else (cancelled, expired, past due, no plan) → 0 applications a day and
 *   a month, which FastApply applies at once; the automation goes quiet and resumes
 *   on the next successful payment, when the webhook pushes the plan again.
 *
 * One FastApply applicant exists per Scout job profile (`fastApplyExternalId`), so a
 * plan that allows several active profiles is enforced per profile; Scout's own
 * entitlement still gates new activations on the total.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { planByCode, type Plan } from "../config/plans";
import { evaluateEntitlement, type SubscriptionRow } from "./entitlements";
import { FirstApplyError, firstApply } from "./first-apply";

export interface ApplicantPlanLimits {
  /** null clears a daily cap; 0 stops the customer at once. */
  dailyApplicationLimit: number | null;
  monthlyApplicationLimit: number;
  /** ISO timestamp FastApply anchors the monthly window to; null keeps its default. */
  limitPeriodStartedAt: string | null;
}

/** A lapsed, cancelled or past-due customer: FastApply refuses every apply at once. */
export const NO_APPLICATIONS: ApplicantPlanLimits = {
  dailyApplicationLimit: 0,
  monthlyApplicationLimit: 0,
  limitPeriodStartedAt: null,
};

export type PlanLimitRow = SubscriptionRow & { current_period_start?: string | null };

/** The monthly rate a plan sells: its quota per billing cycle spread over the cycle's months. */
export function monthlyAllowance(plan: Plan): number {
  const months = plan.billingMonths >= 1
    ? plan.billingMonths
    : plan.validityDays
      ? Math.max(1, Math.round(plan.validityDays / 30))
      : 1;
  return Math.ceil(plan.applicationsQuota / months);
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * When the current billing period began. The webhook records it on every activation
 * and renewal; a row from before that column existed derives it from the period end
 * and the plan's cycle, and a row with neither leaves FastApply's default (the day the
 * applicant was created).
 */
export function periodStart(row: PlanLimitRow, plan: Plan): string | null {
  const recorded = isoOrNull(row.current_period_start);
  if (recorded) return recorded;
  const end = isoOrNull(row.current_period_end);
  if (!end) return null;
  const start = new Date(end);
  if (plan.billingMonths >= 1) start.setUTCMonth(start.getUTCMonth() - plan.billingMonths);
  else if (plan.validityDays) start.setTime(start.getTime() - plan.validityDays * 86400000);
  else return null;
  return start.toISOString();
}

/** The limits a customer's subscription row entitles every one of their applicants to, right now. */
export function applicantPlanLimits(row: PlanLimitRow | null | undefined): ApplicantPlanLimits {
  if (!row) return NO_APPLICATIONS;
  const entitlement = evaluateEntitlement(row);
  const plan = planByCode(row.plan_code);
  if (!entitlement.paid || !plan) return NO_APPLICATIONS;
  return {
    dailyApplicationLimit: null,
    monthlyApplicationLimit: monthlyAllowance(plan),
    limitPeriodStartedAt: periodStart(row, plan),
  };
}

export interface PushResult {
  pushed: string[];
  failed: { externalId: string; error: string }[];
}

/**
 * Pushes `limits` to every FastApply applicant the user owns (one per job profile that
 * has been synced), or to `onlyExternalId`. Never throws: FastApply's write is
 * idempotent and last-write-wins, so a failure is reported for the caller to decide on
 * and the next push repairs it.
 */
export async function pushApplicantPlanLimits(
  supabase: SupabaseClient,
  userId: string,
  limits: ApplicantPlanLimits,
  onlyExternalId?: string,
): Promise<PushResult> {
  const result: PushResult = { pushed: [], failed: [] };
  let externalIds: string[];
  if (onlyExternalId) {
    externalIds = [onlyExternalId];
  } else {
    const rows = await supabase.from("fastapply_applicant_sync").select("external_id").eq("user_id", userId);
    if (rows.error) {
      result.failed.push({ externalId: "*", error: rows.error.message });
      return result;
    }
    externalIds = (rows.data || []).map((row: { external_id: string }) => row.external_id).filter(Boolean);
  }
  for (const externalId of externalIds) {
    try {
      await firstApply.upsertApplicant(externalId, { ...limits });
      result.pushed.push(externalId);
    } catch (error) {
      result.failed.push({ externalId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

/**
 * The subscription row the entitlement is evaluated from (same choice as
 * `loadEntitlement`), with the period start when the column exists. `select("*")` on
 * purpose: a deploy that runs before the migration still works, it just derives the
 * period start instead.
 */
export async function loadPlanLimitRow(supabase: SupabaseClient, userId: string): Promise<PlanLimitRow | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["active", "past_due"])
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as PlanLimitRow | null) ?? null;
}

/** Loads the user's current plan and pushes what it entitles to their applicant(s). */
export async function syncApplicantPlanLimits(
  supabase: SupabaseClient,
  userId: string,
  onlyExternalId?: string,
): Promise<PushResult> {
  const row = await loadPlanLimitRow(supabase, userId);
  return pushApplicantPlanLimits(supabase, userId, applicantPlanLimits(row), onlyExternalId);
}

/** The message activation answers with when the plan could not be set upstream. */
export const PLAN_LIMIT_PUSH_FAILED =
  "Scout could not register your plan's application allowance with the application service. Try again in a minute.";

/** Activation must not start an automation whose plan is not enforced upstream. */
export function assertPlanLimitsPushed(result: PushResult) {
  if (result.failed.length === 0) return;
  throw new FirstApplyError(PLAN_LIMIT_PUSH_FAILED, 502, result.failed);
}

export interface PauseResult {
  paused: number;
  failed: { configId: string; error: string }[];
}

/**
 * A cancel FastApply refused because there is nothing left to stop: the automation is gone (404),
 * or already completed or failed (422, "Cannot cancel a completed or failed automation"; 400 from
 * older versions).
 */
export function isStoppedUpstream(error: unknown): boolean {
  return error instanceof FirstApplyError && (error.status === 404 || error.status === 400 || error.status === 422);
}

/**
 * Cancels every running Scout AI automation the user has and marks its config paused,
 * so a plan that ended stops searching and scoring as well as applying. A remote
 * cancel refused because the automation is already stopped (isStoppedUpstream) still
 * marks the config paused; any other failure leaves it active to retry.
 */
export async function pauseScoutAiAutomations(supabase: SupabaseClient, userId: string): Promise<PauseResult> {
  const result: PauseResult = { paused: 0, failed: [] };
  const configs = await supabase
    .from("ai_agent_configs")
    .select("id,first_apply_id")
    .eq("user_id", userId)
    .in("status", ["active", "activating"]);
  if (configs.error) {
    result.failed.push({ configId: "*", error: configs.error.message });
    return result;
  }
  for (const config of (configs.data || []) as { id: string; first_apply_id: string | null }[]) {
    try {
      if (config.first_apply_id) {
        try {
          await firstApply.cancelAutomation(config.first_apply_id);
        } catch (error) {
          if (!isStoppedUpstream(error)) throw error;
        }
      }
      const updated = await supabase
        .from("ai_agent_configs")
        .update({ status: "paused", last_error: null, synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", config.id);
      if (updated.error) throw new Error(updated.error.message);
      result.paused++;
    } catch (error) {
      result.failed.push({ configId: config.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

/**
 * After a plan ended or a payment failed, what the customer is entitled to now comes from the
 * subscription rows that remain (another plan may still be paid for): those limits are pushed to
 * every applicant, and with `pauseUnlessAgentPlan` Scout AI stops only when nothing left allows it.
 * Throws when the remaining plan cannot be read, so the webhook can ask Dodo to deliver again.
 */
export async function settleAfterPlanChange(
  supabase: SupabaseClient,
  userId: string,
  options: { pauseUnlessAgentPlan: boolean },
): Promise<{ remaining: PlanLimitRow | null; push: PushResult; paused: PauseResult | null }> {
  const remaining = await loadPlanLimitRow(supabase, userId);
  const push = await pushApplicantPlanLimits(supabase, userId, applicantPlanLimits(remaining));
  const agentPlanLeft = evaluateEntitlement(remaining).canActivateAgent;
  const paused = options.pauseUnlessAgentPlan && !agentPlanLeft ? await pauseScoutAiAutomations(supabase, userId) : null;
  return { remaining, push, paused };
}

/**
 * Cancels a job profile's Scout AI automation upstream before the profile is deleted: its settings
 * row is deleted with the profile (on delete cascade), after which nothing could stop it. Throws
 * when FastApply did not confirm, so the deletion is refused and can be retried.
 */
export async function stopProfileAutomation(supabase: SupabaseClient, userId: string, profileId: string): Promise<void> {
  const config = await supabase
    .from("ai_agent_configs")
    .select("id,first_apply_id,status")
    .eq("user_id", userId)
    .eq("job_profile_id", profileId)
    .maybeSingle();
  if (config.error) throw new Error(config.error.message);
  const data = config.data as { first_apply_id: string | null; status: string } | null;
  // A paused config's automation was cancelled when it was paused.
  if (!data?.first_apply_id || data.status === "paused") return;
  try {
    await firstApply.cancelAutomation(data.first_apply_id);
  } catch (error) {
    if (!isStoppedUpstream(error)) throw error;
  }
}
