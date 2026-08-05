import type { APIRoute } from "astro";
import { planByCode } from "../../../config/plans";
import { verifyWebhookSignature } from "../../../lib/dodo";
import { assignedHumanAssistant } from "../../../lib/human-assistants";
import { createSupabaseServiceClient } from "../../../lib/supabase";
import { getPostHogServer } from "../../../lib/posthog-server";

export const prerender = false;

const ACTIVATING = new Set(["payment.succeeded", "subscription.active", "subscription.renewed"]);
const DEACTIVATING = new Set(["subscription.cancelled", "subscription.canceled", "subscription.expired", "subscription.failed"]);

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export const POST: APIRoute = async (context) => {
  // The raw body must be read before any parsing: re-serializing the parsed
  // object changes the bytes and the HMAC would never match.
  const rawBody = await context.request.text();
  const secret = import.meta.env.DODO_WEBHOOK_SECRET?.trim() || "";
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

  const data = event.data || {};
  const metadata = data.metadata || {};
  const userId = String(metadata.user_id || "");
  const plan = planByCode(String(metadata.plan_code || ""));

  // Events we did not originate (or cannot attribute) are acknowledged so Dodo
  // stops retrying, but change nothing.
  if (!userId || !plan) return reply({ ok: true, ignored: true });

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
      applications_quota: plan.applicationsQuota,
      applications_used: 0,
      updated_at: new Date().toISOString(),
    };

    // A renewal refreshes the period and quota on the existing row; a first
    // purchase inserts one. Both key on the Dodo identifier.
    const existing = subscriptionId
      ? await supabase.from("subscriptions").select("id").eq("dodo_subscription_id", subscriptionId).maybeSingle()
      : { data: null };

    const written = existing.data
      ? await supabase.from("subscriptions").update(row).eq("id", (existing.data as any).id)
      : await supabase.from("subscriptions").insert(row);
    if (written.error) return reply({ error: written.error.message }, 500);

    // This is the only place a human assistant is assigned — payment has cleared.
    const profileUpdate = plan.lane === "human"
      ? { assistant_type: "human", assistant_name: assignedHumanAssistant(userId).name, updated_at: new Date().toISOString() }
      : { assistant_type: "ai", assistant_name: "Scout AI", updated_at: new Date().toISOString() };
    const profile = await supabase.from("profiles").update(profileUpdate).eq("user_id", userId);
    if (profile.error) return reply({ error: profile.error.message }, 500);

    const posthog = getPostHogServer();
    if (posthog) {
      posthog.capture({
        distinctId: userId,
        event: "subscription_activated",
        properties: { plan_code: plan.code, lane: plan.lane, billing: plan.billing, event_type: type },
      });
      await posthog.flush();
    }
  } else if (DEACTIVATING.has(type)) {
    const canceled = await supabase.from("subscriptions")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("user_id", userId).eq("plan_code", plan.code).eq("status", "active");
    if (canceled.error) return reply({ error: canceled.error.message }, 500);
  } else if (type === "payment.failed") {
    const pastDue = await supabase.from("subscriptions")
      .update({ status: "past_due", updated_at: new Date().toISOString() })
      .eq("user_id", userId).eq("status", "active");
    if (pastDue.error) return reply({ error: pastDue.error.message }, 500);
  }

  return reply({ ok: true });
};
