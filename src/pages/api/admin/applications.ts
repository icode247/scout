import type { APIRoute } from "astro";
import { createAdminClient, requireAdmin } from "../../../lib/admin";
import { assertSameOrigin, errorMessage, json, readBody } from "../../../lib/api";

export const prerender = false;
export const GET: APIRoute = async (context) => {
  try { requireAdmin(context); return context.redirect("/admin", 303); }
  catch (error) { if (error instanceof Response) return error; return json({ error: errorMessage(error) }, { status: 500 }); }
};

const allowed = new Set(["preparing", "submitted", "needs_input", "evidence_ready", "interview", "rejected", "withdrawn"]);

export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    requireAdmin(context);
    const body = await readBody(context.request);
    const id = String(body.id || "");
    const status = String(body.status || "");
    if (!id || !allowed.has(status)) return json({ error: "Valid application and status are required" }, { status: 400 });
    const admin = createAdminClient();
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
