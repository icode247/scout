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
