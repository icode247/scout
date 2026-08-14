import type { APIRoute } from "astro";
import { planByCode } from "../../../config/plans";
import { verifyWebhookSignature } from "../../../lib/dodo";
import { sendSubscriptionConfirmationEmail } from "../../../lib/email";
import { assignedHumanAssistant } from "../../../lib/human-assistants";
import { createSupabaseServiceClient } from "../../../lib/supabase";
import { serverEnv } from "../../../lib/server-env";
import { getPostHogServer } from "../../../lib/posthog-server";
import { sendGoogleAnalyticsEvent } from "../../../lib/google-analytics";

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

  const data = event.data || {};
  const metadata = data.metadata || {};
  const userId = String(metadata.user_id || "");
  const plan = planByCode(String(metadata.plan_code || ""));
  const gaClientId = String(metadata.ga_client_id || "") || null;

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
    const assistant = plan.lane === "human" ? assignedHumanAssistant(userId) : null;
    const profileUpdate = assistant
      ? { assistant_type: "human", assistant_name: assistant.name, updated_at: new Date().toISOString() }
      : { assistant_type: "ai", assistant_name: "Scout AI", updated_at: new Date().toISOString() };
    const profile = await supabase.from("profiles").update(profileUpdate).eq("user_id", userId);
    if (profile.error) return reply({ error: profile.error.message }, 500);

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
      params: isRevenueEvent ? {
        transaction_id: String(data.payment_id || id),
        currency: String(data.currency || "USD").toUpperCase(),
        value: plan.priceCents / 100,
        customer_type: type === "subscription.renewed" ? "returning" : "new",
        plan_code: plan.code,
        lane: plan.lane,
        items: [{ item_id: plan.code, item_name: plan.name, item_category: plan.lane, price: plan.priceCents / 100, quantity: 1 }],
      } : { plan_code: plan.code, lane: plan.lane, billing: plan.billing },
    }).catch((error) => console.error("[google-analytics] payment event failed", error));
  } else if (DEACTIVATING.has(type)) {
    const canceled = await supabase.from("subscriptions")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("user_id", userId).eq("plan_code", plan.code).eq("status", "active");
    if (canceled.error) return reply({ error: canceled.error.message }, 500);
    await sendGoogleAnalyticsEvent({ clientId: gaClientId, userId, name: type.includes("expired") ? "subscription_churned" : "subscription_cancelled", params: { plan_code: plan.code, lane: plan.lane, event_type: type } })
      .catch((error) => console.error("[google-analytics] churn event failed", error));
    const posthog = getPostHogServer();
    if (posthog) {
      posthog.capture({ distinctId: userId, event: type.includes("expired") ? "subscription_churned" : "subscription_cancelled", properties: { plan_code: plan.code, lane: plan.lane, event_type: type } });
      await posthog.flush();
    }
  } else if (type === "payment.failed") {
    const pastDue = await supabase.from("subscriptions")
      .update({ status: "past_due", updated_at: new Date().toISOString() })
      .eq("user_id", userId).eq("status", "active");
    if (pastDue.error) return reply({ error: pastDue.error.message }, 500);
    await sendGoogleAnalyticsEvent({ clientId: gaClientId, userId, name: "payment_failed", params: { plan_code: plan.code, lane: plan.lane } })
      .catch((error) => console.error("[google-analytics] payment failure event failed", error));
    const posthog = getPostHogServer();
    if (posthog) {
      posthog.capture({ distinctId: userId, event: "payment_failed", properties: { plan_code: plan.code, lane: plan.lane } });
      await posthog.flush();
    }
  }

  return reply({ ok: true });
};
