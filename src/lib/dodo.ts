import { createHmac, timingSafeEqual } from "node:crypto";
import type { Plan } from "../config/plans";

const TOLERANCE_SECONDS = 5 * 60;

export class DodoError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "DodoError";
    this.status = status;
  }
}

function apiKey() {
  const key = import.meta.env.DODO_API_KEY?.trim();
  if (!key) throw new DodoError("Payments are not configured yet.", 503);
  return key;
}

export function dodoConfigured() {
  return Boolean(import.meta.env.DODO_API_KEY?.trim());
}

export function dodoBaseUrl() {
  return import.meta.env.DODO_ENVIRONMENT?.trim() === "live_mode"
    ? "https://live.dodopayments.com"
    : "https://test.dodopayments.com";
}

export function productIdForPlan(plan: Plan) {
  const id = (import.meta.env as Record<string, string | undefined>)[plan.productEnvKey]?.trim();
  if (!id) throw new DodoError(`${plan.name} is not available yet.`, 503);
  return id;
}

async function dodoFetch(path: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(`${dodoBaseUrl()}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${apiKey()}`, "content-type": "application/json", ...(init.headers || {}) },
    });
  } catch (error) {
    if (error instanceof DodoError) throw error;
    throw new DodoError("Scout could not reach the payment provider.", 502);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new DodoError(String((payload as any)?.message || `The payment provider returned ${response.status}.`), response.status);
  }
  return payload as any;
}

export async function createCheckoutSession(input: {
  plan: Plan;
  userId: string;
  email: string;
  name?: string;
  returnUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}) {
  const payload = await dodoFetch("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      product_cart: [{ product_id: productIdForPlan(input.plan), quantity: 1 }],
      customer: { email: input.email, ...(input.name ? { name: input.name } : {}) },
      return_url: input.returnUrl,
      cancel_url: input.cancelUrl,
      metadata: {
        user_id: input.userId,
        plan_code: input.plan.code,
        lane: input.plan.lane,
        ...(input.metadata || {}),
      },
    }),
  });
  const checkoutUrl = payload?.checkout_url;
  if (!checkoutUrl) throw new DodoError("The payment provider did not return a checkout URL.");
  return { sessionId: String(payload.session_id || ""), checkoutUrl: String(checkoutUrl) };
}

export async function createPortalSession(customerId: string) {
  const payload = await dodoFetch(`/customers/${encodeURIComponent(customerId)}/customer-portal/session`, { method: "POST" });
  const link = payload?.link;
  if (!link) throw new DodoError("The payment provider did not return a portal link.");
  return { link: String(link) };
}

/**
 * Standard Webhooks verification: base64 HMAC-SHA256 over `id.timestamp.body`.
 * The header may carry several space-separated `v1,<signature>` entries, so any
 * one matching entry authenticates the delivery.
 *
 * The caller MUST pass the raw request body, read before any JSON parsing —
 * re-serializing the parsed object changes the bytes and the HMAC will not match.
 */
export function verifyWebhookSignature(input: {
  id: string;
  timestamp: string;
  signature: string;
  rawBody: string;
  secret: string;
}) {
  if (!input.id || !input.timestamp || !input.signature || !input.secret) return false;

  const sent = Number(input.timestamp);
  if (!Number.isFinite(sent)) return false;
  // Reject replays of an old delivery.
  if (Math.abs(Math.floor(Date.now() / 1000) - sent) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(input.secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${input.id}.${input.timestamp}.${input.rawBody}`)
    .digest();

  return input.signature.split(" ").some((part) => {
    const value = part.includes(",") ? part.split(",")[1] : part;
    if (!value) return false;
    let candidate: Buffer;
    try {
      candidate = Buffer.from(value, "base64");
    } catch {
      return false;
    }
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}
