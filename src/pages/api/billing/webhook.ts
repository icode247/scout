import type { APIRoute } from "astro";
import { planByCode } from "../../../config/plans";
import { verifyWebhookSignature } from "../../../lib/dodo";
import { sendSubscriptionConfirmationEmail } from "../../../lib/email";
import { assignedHumanAssistant, refreshHumanAssistants } from "../../../lib/human-assistants";
import { createSupabaseServiceClient } from "../../../lib/supabase";
import { serverEnv } from "../../../lib/server-env";
import { getPostHogServer } from "../../../lib/posthog-server";
import { sendGoogleAnalyticsEvent } from "../../../lib/google-analytics";
import { applicantPlanLimits, pushApplicantPlanLimits, settleAfterPlanChange } from "../../../lib/fastapply-limits";

/**
 * Billing events are the only reliable signal that a customer's plan changed, so each one
 * pushes the customer's current allowance to FastApply (lib/fastapply-limits.ts). Best
 * effort here: a failed push does not fail the delivery, and the next activation or billing
 * event repairs it. A failed DATABASE write does (see `failed` in the handler).
 */
async function logPush(label: string, userId: string, work: Promise<{ failed: { error: string }[] }>) {
  try {
    const result = await work;
    if (result.failed.length) console.error(`[webhook] ${label}: FastApply limits push failed for user ${userId}`, result.failed);
  } catch (error) {
    console.error(`[webhook] ${label}: FastApply limits push threw for user ${userId}`, error);
  }
}

export const prerender = false;

const ACTIVATING = new Set(["payment.succeeded", "subscription.active", "subscription.renewed"]);
const DEACTIVATING = new Set(["subscription.cancelled", "subscription.canceled", "subscription.expired", "subscription.failed"]);

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/**
 * Moves ONE plan's rows to `status`: the subscription the event names, or (for events without
 * one, and rows stored before Scout kept the id) that plan's rows. Another plan the customer
 * still pays for is never touched. Returns how many rows changed.
 */
async function setPlanStatus(
  supabase: ServiceClient,
  userId: string,
  target: { planCode: string; subscriptionId: string | null; fromStatuses: string[] },
  status: "canceled" | "past_due",
): Promise<{ error: string | null; changed: number }> {
  const update = () => supabase.from("subscriptions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("user_id", userId).in("status", target.fromStatuses);
  if (target.subscriptionId) {
    const bySubscription = await update().eq("dodo_subscription_id", target.subscriptionId).select("id");
    if (bySubscription.error) return { error: bySubscription.error.message, changed: 0 };
    if (bySubscription.data?.length) return { error: null, changed: bySubscription.data.length };
  }
  const byPlan = await update().eq("plan_code", target.planCode).select("id");
  if (byPlan.error) return { error: byPlan.error.message, changed: 0 };
  return { error: null, changed: byPlan.data?.length ?? 0 };
}

function logSettled(label: string, userId: string, settled: Awaited<ReturnType<typeof settleAfterPlanChange>>) {
  if (settled.push.failed.length) console.error(`[webhook] ${label}: FastApply limits push failed for user ${userId}`, settled.push.failed);
  if (settled.paused?.failed.length) console.error(`[webhook] ${label}: could not pause every automation for user ${userId}`, settled.paused.failed);
}

export const POST: APIRoute = async (context) => {
  // The raw body must be read before any parsing: re-serializing the parsed
  // object changes the bytes and the HMAC would never match.
  const rawBody = await context.request.text();
  // Runtime read, so rotating the signing secret does not need a rebuild and
  // the secret never lands in the deployed bundle.
  const secret = serverEnv("DODO_WEBHOOK_SECRET") || "";
  const id = context.request.headers.get("webhook-id") || "";
  const timestamp = context.request.headers.get("webhook-timestamp") || "";
  const signature = context.request.headers.get("webhook-signature") || "";

  if (!verifyWebhookSignature({ id, timestamp, signature, rawBody, secret })) {
    return reply({ error: "Invalid signature" }, 401);
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return reply({ error: "Malformed payload" }, 400);
  }

  let supabase;
  try {
    supabase = createSupabaseServiceClient();
  } catch (error) {
    // Non-2xx makes Dodo retry, which is what we want for a config problem.
    return reply({ error: error instanceof Error ? error.message : "Unavailable" }, 500);
  }

  const type = String(event.type || "");

  // Idempotency: the primary key rejects a replayed delivery.
  const recorded = await supabase.from("webhook_events").insert({ dodo_event_id: id, event_type: type, payload: event });
  if (recorded.error) {
    if (recorded.error.code === "23505") return reply({ ok: true, duplicate: true });
    return reply({ error: recorded.error.message }, 500);
  }
  // A failure after the event is recorded must not be acknowledged as a duplicate when Dodo
  // delivers it again (a write before a migration ran, a database blip): the record is removed,
  // so the retry runs the whole event. Every write below is safe to repeat.
  const db = supabase;
  const failed = async (message: string) => {
    try { await db.from("webhook_events").delete().eq("dodo_event_id", id); } catch (error) { console.error("[webhook] could not release event", id, error); }
    return reply({ error: message }, 500);
  };

  const data = event.data || {};
  const metadata = data.metadata || {};
  const userId = String(metadata.user_id || "");
  const plan = planByCode(String(metadata.plan_code || ""));
  const gaClientId = String(metadata.ga_client_id || "") || null;

  // Events we did not originate (or cannot attribute) are acknowledged so Dodo
  // stops retrying, but change nothing.
  if (!userId || !plan) return reply({ ok: true, ignored: true });

  try {

  if (ACTIVATING.has(type)) {
    const subscriptionId = data.subscription_id ? String(data.subscription_id) : null;
    const row = {
      user_id: userId,
      plan_code: plan.code,
      lane: plan.lane,
      status: "active" as const,
      dodo_customer_id: data.customer?.customer_id ? String(data.customer.customer_id) : null,
      dodo_subscription_id: subscriptionId,
      dodo_payment_id: data.payment_id ? String(data.payment_id) : null,
      // Recurring plans expire when Dodo says the next charge is due. One-time
      // bundles normally never expire, except the discounted 90-day term, whose
      // whole premise is that the allowance has to be used inside that window.
      current_period_end: plan.billing === "recurring"
        ? (data.next_billing_date || null)
        : plan.validityDays
          ? new Date(Date.now() + plan.validityDays * 86400000).toISOString()
          : null,
      // The period starts now: FastApply's monthly application window is anchored to it.
      current_period_start: new Date().toISOString(),
      applications_quota: plan.applicationsQuota,
      applications_used: 0,
      updated_at: new Date().toISOString(),
    };

    // A renewal refreshes the period and quota on the existing row; a first
    // purchase inserts one. Both key on the Dodo identifier.
    const existing = subscriptionId
      ? await supabase.from("subscriptions").select("id").eq("dodo_subscription_id", subscriptionId).maybeSingle()
      : { data: null };

    if (existing.error) return failed(existing.error.message);
    const written = existing.data
      ? await supabase.from("subscriptions").update(row).eq("id", (existing.data as any).id)
      : await supabase.from("subscriptions").insert(row);
    if (written.error) return failed(written.error.message);

    // This is the only place a human assistant is assigned — payment has cleared.
    if (plan.lane === "human") await refreshHumanAssistants(supabase).catch((error) => console.error("[webhook] roster refresh failed", error));
    const assistant = plan.lane === "human" ? assignedHumanAssistant(userId) : null;
    const profileUpdate = assistant
      ? { assistant_type: "human", assistant_name: assistant.name, updated_at: new Date().toISOString() }
      : { assistant_type: "ai", assistant_name: "Scout AI", updated_at: new Date().toISOString() };
    const profile = await supabase.from("profiles").update(profileUpdate).eq("user_id", userId);
    if (profile.error) return failed(profile.error.message);

    // The plan the customer just paid for, enforced upstream from this moment (and a
    // customer coming back from past_due or a lapse gets their allowance back).
    await logPush(type, userId, pushApplicantPlanLimits(supabase, userId, applicantPlanLimits(row)));

    // Confirmation goes out on the first activation only: a renewal reuses the
    // row, and the second activating event Dodo sends for a new subscription
    // takes the update path above.
    if (!existing.data) {
      const recipient = String(data.customer?.email || "")
        || (await supabase.auth.admin.getUserById(userId)).data?.user?.email
        || "";
      if (recipient) {
        try {
          await sendSubscriptionConfirmationEmail({
            to: recipient,
            plan,
            assistant,
            idempotencyKey: `subscription-confirmation/${id}`,
          });
        } catch (error) {
          // Best effort only. A non-2xx here would make Dodo retry a delivery
          // whose event id is already in webhook_events, so the retry would be
          // acked as a duplicate without ever re-sending the email.
          console.error("Subscription confirmation email failed", error);
        }
      }
    }

    const posthog = getPostHogServer();
    if (posthog) {
      posthog.capture({
        distinctId: userId,
        event: "subscription_activated",
        properties: { plan_code: plan.code, lane: plan.lane, billing: plan.billing, event_type: type },
      });
      await posthog.flush();
    }
    const isRevenueEvent = type === "payment.succeeded" || type === "subscription.renewed";
    await sendGoogleAnalyticsEvent({
      clientId: gaClientId,
      userId,
      name: isRevenueEvent ? "purchase" : "subscription_activated",
      params: isRevenueEvent ? (() => {
        // Regional (PPP) buyers are charged a localized INR/NGN amount, so
        // revenue reports what was actually paid; the USD list price is only
        // the fallback for payloads that omit the amount.
        const paid = typeof data.total_amount === "number" ? data.total_amount / 100 : plan.priceCents / 100;
        return {
          transaction_id: String(data.payment_id || id),
          currency: String(data.currency || "USD").toUpperCase(),
          value: paid,
          customer_type: type === "subscription.renewed" ? "returning" : "new",
          plan_code: plan.code,
          lane: plan.lane,
          items: [{ item_id: plan.code, item_name: plan.name, item_category: plan.lane, price: paid, quantity: 1 }],
        };
      })() : { plan_code: plan.code, lane: plan.lane, billing: plan.billing },
    }).catch((error) => console.error("[google-analytics] payment event failed", error));
  } else if (DEACTIVATING.has(type)) {
    const subscriptionId = data.subscription_id ? String(data.subscription_id) : null;
    const canceled = await setPlanStatus(supabase, userId, { planCode: plan.code, subscriptionId, fromStatuses: ["active", "past_due"] }, "canceled");
    if (canceled.error) return failed(canceled.error);
    // What the customer still pays for decides what happens next: FastApply gets that plan's
    // limits (none, with no plan left), and Scout AI stops only when no remaining plan allows it.
    // A new purchase starts it again from /agent.
    logSettled(type, userId, await settleAfterPlanChange(supabase, userId, { pauseUnlessAgentPlan: true }));
    await sendGoogleAnalyticsEvent({ clientId: gaClientId, userId, name: type.includes("expired") ? "subscription_churned" : "subscription_cancelled", params: { plan_code: plan.code, lane: plan.lane, event_type: type } })
      .catch((error) => console.error("[google-analytics] churn event failed", error));
    const posthog = getPostHogServer();
    if (posthog) {
      posthog.capture({ distinctId: userId, event: type.includes("expired") ? "subscription_churned" : "subscription_cancelled", properties: { plan_code: plan.code, lane: plan.lane, event_type: type } });
      await posthog.flush();
    }
  } else if (type === "payment.failed") {
    // Only a renewal that failed puts a plan past due: a first payment that failed bought nothing,
    // and the plan the customer already has is not this payment's.
    const subscriptionId = data.subscription_id ? String(data.subscription_id) : null;
    if (subscriptionId) {
      const pastDue = await setPlanStatus(supabase, userId, { planCode: plan.code, subscriptionId, fromStatuses: ["active"] }, "past_due");
      if (pastDue.error) return failed(pastDue.error);
      // Quiet, not stopped: FastApply gets what any other plan allows, and the automations stay
      // so the next successful payment resumes them. Settled even when nothing changed: a retried
      // delivery finds the plan already past due, and still owes FastApply the limits.
      logSettled(type, userId, await settleAfterPlanChange(supabase, userId, { pauseUnlessAgentPlan: false }));
    }
    await sendGoogleAnalyticsEvent({ clientId: gaClientId, userId, name: "payment_failed", params: { plan_code: plan.code, lane: plan.lane } })
      .catch((error) => console.error("[google-analytics] payment failure event failed", error));
    const posthog = getPostHogServer();
    if (posthog) {
      posthog.capture({ distinctId: userId, event: "payment_failed", properties: { plan_code: plan.code, lane: plan.lane } });
      await posthog.flush();
    }
  }
  } catch (error) {
    console.error(`[webhook] ${type}: processing failed for user ${userId}`, error);
    return failed(error instanceof Error ? error.message : "Processing failed");
  }

  return reply({ ok: true });
};
