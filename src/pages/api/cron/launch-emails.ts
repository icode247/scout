import type { APIRoute } from "astro";
import { sendLaunchEmail, type LaunchEmailNumber, type LaunchLane } from "../../../lib/launch-email";
import { createSupabaseServiceClient } from "../../../lib/supabase";
import { serverEnv } from "../../../lib/server-env";

export const prerender = false;

function authorized(request: Request) {
  const secret = serverEnv("CRON_SECRET")?.trim() || "";
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

const delayAfter: Record<LaunchEmailNumber, number | null> = { 1: 3, 2: 3, 3: 4, 4: null };

export const GET: APIRoute = async ({ request }) => {
  if (!authorized(request)) return reply({ error: "Unauthorized" }, 401);
  const db = createSupabaseServiceClient();
  const now = new Date();
  const staleClaim = new Date(now.getTime() - 30 * 60_000).toISOString();

  await db.from("launch_email_enrollments")
    .update({ status: "active", claimed_at: null, updated_at: now.toISOString() })
    .eq("status", "processing").lt("claimed_at", staleClaim);

  const due = await db.from("launch_email_enrollments")
    .select("id,user_id,email,first_name,preferred_lane,next_email,unsubscribe_token,next_send_at")
    .eq("status", "active").lte("next_send_at", now.toISOString())
    .order("next_send_at", { ascending: true }).limit(50);
  if (due.error) return reply({ error: due.error.message }, 500);

  let sent = 0;
  let suppressed = 0;
  let failed = 0;

  for (const row of due.data || []) {
    const claimed = await db.from("launch_email_enrollments")
      .update({ status: "processing", claimed_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("id", row.id).eq("status", "active").eq("next_send_at", row.next_send_at)
      .select("id").maybeSingle();
    if (!claimed.data) continue;

    if (row.user_id) {
      const purchase = await db.from("subscriptions").select("id").eq("user_id", row.user_id).eq("status", "active").limit(1).maybeSingle();
      if (purchase.data) {
        await db.from("launch_email_enrollments").update({ status: "purchased", purchased_at: new Date().toISOString(), claimed_at: null, updated_at: new Date().toISOString() }).eq("id", row.id);
        suppressed += 1;
        continue;
      }
    }

    const emailNumber = Number(row.next_email) as LaunchEmailNumber;
    try {
      const result = await sendLaunchEmail({
        to: row.email,
        firstName: row.first_name,
        emailNumber,
        preferredLane: row.preferred_lane as LaunchLane | null,
        unsubscribeToken: row.unsubscribe_token,
        enrollmentId: row.id,
      });
      if (!result) throw new Error("Email delivery is not configured.");

      await db.from("launch_email_deliveries").upsert({ enrollment_id: row.id, email_number: emailNumber, provider_id: result.id }, { onConflict: "enrollment_id,email_number", ignoreDuplicates: true });
      const delay = delayAfter[emailNumber];
      if (delay === null) {
        await db.from("launch_email_enrollments").update({ status: "completed", completed_at: new Date().toISOString(), claimed_at: null, updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "processing");
      } else {
        await db.from("launch_email_enrollments").update({ status: "active", next_email: emailNumber + 1, next_send_at: new Date(now.getTime() + delay * 86_400_000).toISOString(), claimed_at: null, last_error: null, updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "processing");
      }
      sent += 1;
    } catch (error) {
      failed += 1;
      await db.from("launch_email_enrollments").update({ status: "active", claimed_at: null, last_error: error instanceof Error ? error.message.slice(0, 1000) : "Unknown email error", next_send_at: new Date(Date.now() + 60 * 60_000).toISOString(), updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "processing");
    }
  }

  return reply({ ok: true, due: due.data?.length || 0, sent, suppressed, failed });
};
