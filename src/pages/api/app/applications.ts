import type { APIRoute } from "astro";
import { assertSameOrigin, errorMessage, json, readBody, requireUser } from "../../../lib/api";
import { getDemoState } from "../../../lib/demo-store";

export const prerender = false;

export const PATCH: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const body = await readBody(context.request);
    const id = String(body.id || "");
    if (!id || body.action !== "withdraw") return json({ error: "Valid application action is required" }, { status: 400 });

    if (context.locals.demoMode) {
      const state = getDemoState(user.id, user.email);
      const application = state.applications.find((item) => item.id === id);
      if (!application) return json({ error: "Application not found" }, { status: 404 });
      if (!["preparing", "needs_input"].includes(application.status)) return json({ error: "Submitted applications cannot be withdrawn from the preparation queue" }, { status: 409 });
      application.status = "withdrawn";
      const job = state.jobs.find((item) => item.id === application.job_id);
      if (job) job.status = "skipped";
      return json({ ok: true, application });
    }

    const supabase = context.locals.supabase!;
    const current = await supabase.from("applications").select("id,job_id,status").eq("id", id).eq("user_id", user.id).single();
    if (current.error) return json({ error: "Application not found" }, { status: 404 });
    if (!["preparing", "needs_input"].includes(current.data.status)) {
      return json({ error: "Submitted applications cannot be withdrawn from the preparation queue" }, { status: 409 });
    }
    const updated = await supabase.from("applications").update({ status: "withdrawn", updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).select("*").single();
    if (updated.error) throw updated.error;
    const job = await supabase.from("jobs").update({ status: "skipped", updated_at: new Date().toISOString() }).eq("id", current.data.job_id).eq("user_id", user.id);
    if (job.error) throw job.error;
    return json({ ok: true, application: updated.data });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};
