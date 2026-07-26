import type { APIRoute } from "astro";
import { json } from "../../../lib/api";
import { createAdminClient } from "../../../lib/admin";
import { reconcileAutomations, scorePendingJobs } from "../../../lib/reconcile";

export const prerender = false;
// Reconciliation is cheap; background scoring drives LLM calls, so give the invocation room.
export const maxDuration = 300;

/**
 * Constant-time-ish bearer check against CRON_SECRET. Vercel Cron automatically sends
 * `Authorization: Bearer <CRON_SECRET>` when the env var is set, which is how this endpoint is
 * meant to be triggered. It is intentionally NOT reachable by ordinary authenticated users.
 */
function authorized(request: Request): boolean {
  const secret = import.meta.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

async function run(request: Request) {
  if (!authorized(request)) return json({ error: "Unauthorized" }, { status: 401 });

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return json({ error: "Service role is not configured" }, { status: 503 });
  }

  // Each stage is independent: a failure or timeout in one must not lose the other's committed work.
  const reconciled = await reconcileAutomations(admin).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  const scored = await scorePendingJobs(admin).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  // Best-effort GC of the rate-limit counter table; never let it fail the run.
  try {
    await admin.rpc("scout_rate_limit_gc", { p_older_than_seconds: 86400 });
  } catch {
    /* ignore */
  }

  return json({ ok: true, reconciled, scored });
}

export const GET: APIRoute = ({ request }) => run(request);
export const POST: APIRoute = ({ request }) => run(request);
