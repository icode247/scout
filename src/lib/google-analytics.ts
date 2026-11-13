import { serverEnv } from "./server-env";

type AnalyticsParams = Record<string, string | number | boolean | null | undefined | Record<string, unknown>[]>;

export async function sendGoogleAnalyticsEvent(input: {
  clientId?: string | null;
  userId?: string | null;
  name: string;
  params?: AnalyticsParams;
}) {
  const measurementId = serverEnv("PUBLIC_GA_MEASUREMENT_ID");
  const apiSecret = serverEnv("GA_API_SECRET");
  if (!measurementId || !apiSecret) return;

  const clientId = input.clientId || (input.userId ? `1.${stableNumericId(input.userId)}` : `1.${Date.now()}`);
  const response = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      ...(input.userId ? { user_id: input.userId } : {}),
      events: [{ name: input.name, params: { engagement_time_msec: 1, ...(input.params || {}) } }],
    }),
  });
  if (!response.ok) throw new Error(`Google Analytics returned ${response.status}`);
}

function stableNumericId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return String(hash >>> 0);
}

export function googleClientIdFromCookie(cookie: string | undefined) {
  if (!cookie) return null;
  const parts = cookie.split(".");
  return parts.length >= 4 ? `${parts.at(-2)}.${parts.at(-1)}` : null;
}

/** The `_ga_<stream>` cookie name gtag uses for a measurement id like G-ABC123. */
export function googleSessionCookieName(measurementId: string | null | undefined) {
  const id = String(measurementId || "").trim().replace(/^G-/i, "");
  return id ? `_ga_${id}` : null;
}

/**
 * The browser's current GA4 session id from its `_ga_<stream>` cookie, in the old
 * (`GS1.1.<session>.…`) or current (`GS2.1.s<session>$o…`) format. Sent with a Measurement
 * Protocol event, it puts the event in that session, so GA4 credits the session's source.
 */
export function googleSessionIdFromCookie(cookie: string | undefined) {
  const part = cookie?.split(".")[2] || "";
  const match = part.match(/^s?(\d{6,})/);
  return match ? match[1] : null;
}
