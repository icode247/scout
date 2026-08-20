import type { APIRoute } from "astro";
import { createSupabaseServiceClient } from "../../../lib/supabase";

export const prerender = false;

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

function tokenFrom(request: Request) {
  return new URL(request.url).searchParams.get("token")?.trim() || "";
}

export const POST: APIRoute = async ({ request }) => {
  const token = tokenFrom(request);
  if (!/^[0-9a-f-]{36}$/i.test(token)) return response({ error: "Invalid unsubscribe link" }, 400);
  const db = createSupabaseServiceClient();
  const result = await db.from("launch_email_enrollments")
    .update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString(), claimed_at: null, updated_at: new Date().toISOString() })
    .eq("unsubscribe_token", token).in("status", ["active", "processing"]);
  if (result.error) return response({ error: "Unable to update email preferences" }, 500);
  return response({ ok: true });
};
