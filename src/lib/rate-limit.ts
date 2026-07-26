import type { SupabaseClient } from "@supabase/supabase-js";
import { json } from "./api";

export interface RateLimitOptions {
  /** Maximum number of requests permitted within the window. */
  max: number;
  /** Rolling window length in seconds. */
  windowSeconds: number;
}

/**
 * Fixed-window rate limit backed by the Postgres `scout_rate_limit` SECURITY DEFINER
 * function. `key` should scope the limit to the subject and action, e.g. `ai-apply:<userId>`
 * or `auth-otp:<ip>`.
 *
 * Fails OPEN (returns allowed) if the limiter itself errors: this is a cost/abuse guard, not
 * an authentication boundary, and a limiter outage must not take down legitimate traffic.
 */
export async function rateLimit(supabase: SupabaseClient, key: string, options: RateLimitOptions): Promise<{ allowed: boolean }> {
  try {
    const { data, error } = await supabase.rpc("scout_rate_limit", {
      p_key: key,
      p_max: options.max,
      p_window_seconds: options.windowSeconds,
    });
    if (error) return { allowed: true };
    return { allowed: data === true };
  } catch {
    return { allowed: true };
  }
}

/** Standard 429 response with a Retry-After hint. */
export function tooManyRequests(retryAfterSeconds = 60) {
  return json(
    { error: "You're doing that too often. Please wait a moment and try again." },
    { status: 429, headers: { "retry-after": String(retryAfterSeconds), "cache-control": "no-store" } },
  );
}

/** Best-effort client IP for limiting unauthenticated endpoints. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
