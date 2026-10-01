import type { APIRoute } from "astro";
import { assertCanWorkClient, createAdminClient, requireStaff } from "../../../lib/admin";
import { assertSameOrigin, errorMessage, json, readBody } from "../../../lib/api";

export const prerender = false;
export const GET: APIRoute = async (context) => {
  try { requireStaff(context); return context.redirect("/admin", 303); }
  catch (error) { if (error instanceof Response) return error; return json({ error: errorMessage(error) }, { status: 500 }); }
};

const allowed = new Set(["preparing", "submitted", "needs_input", "evidence_ready", "interview", "rejected", "withdrawn"]);

export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const staff = requireStaff(context);
    const body = await readBody(context.request);
    const id = String(body.id || "");
    const status = String(body.status || "");
    if (!id || !allowed.has(status)) return json({ error: "Valid application and status are required" }, { status: 400 });
    const admin = createAdminClient();
    const owner = await admin.from("applications").select("user_id").eq("id", id).maybeSingle();
    if (owner.error) throw owner.error;
    if (!owner.data) return json({ error: "Application not found" }, { status: 404 });
    await assertCanWorkClient(staff, admin, owner.data.user_id);
    // A delegated job the assistant could not apply to (expired, not a fit) was
    // charged when the client delegated it, so `refund` hands that back — but
    // only while it was still unworked, so it can never refund twice.
    if (body.refund && status === "withdrawn") {
      const current = await admin.from("applications").select("user_id,status").eq("id", id).single();
      if (current.error) throw current.error;
      if (["preparing", "needs_input"].includes(current.data.status)) {
        const subscription = await admin.from("subscriptions").select("id,applications_used").eq("user_id", current.data.user_id).eq("status", "active").maybeSingle();
        if (subscription.error) throw subscription.error;
        if (subscription.data && subscription.data.applications_used > 0) {
          await admin.from("subscriptions")
            .update({ applications_used: subscription.data.applications_used - 1, updated_at: new Date().toISOString() })
            .eq("id", subscription.data.id).eq("applications_used", subscription.data.applications_used);
        }
      }
    }
    const changes: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (["submitted", "evidence_ready", "interview"].includes(status)) changes.submitted_at = new Date().toISOString();
    if (body.notes !== undefined) changes.notes = String(body.notes).slice(0, 5000);
    if (body.resume_id) changes.resume_id = String(body.resume_id);
    const result = await admin.from("applications").update(changes).eq("id", id).select("id,job_id,status,submitted_at").single();
    if (result.error) throw result.error;
    const jobStatus = status === "interview"
      ? "interview"
      : ["submitted", "evidence_ready"].includes(status)
        ? "applied"
        : ["rejected", "withdrawn"].includes(status)
          ? "skipped"
          : "delegated";
    const jobUpdate = await admin.from("jobs").update({ status: jobStatus, updated_at: new Date().toISOString() }).eq("id", result.data.job_id);
    if (jobUpdate.error) throw jobUpdate.error;
    const accept = context.request.headers.get("accept") || "";
    if (accept.includes("text/html")) return context.redirect("/admin?updated=" + result.data.id, 303);
    return json({ application: result.data });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 500 });
  }
};
