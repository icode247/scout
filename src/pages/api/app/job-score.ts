import type { APIRoute } from "astro";
import { assertSameOrigin, errorMessage, json, readBody, requireUser } from "../../../lib/api";
import { scoreAndPersistJob } from "../../../lib/job-match";

export const prerender = false;
export const maxDuration = 60;

export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const body = await readBody(context.request);
    const id = String(body.id || "");
    if (!id) return json({ error: "Job id is required" }, { status: 400 });
    if (context.locals.demoMode) return json({ error: "Live scoring is unavailable in demo mode" }, { status: 400 });
    const supabase = context.locals.supabase!;
    const result = await supabase.from("jobs").select("*").eq("id", id).eq("user_id", user.id).single();
    if (result.error) return json({ error: "Job not found" }, { status: 404 });
    const job = await scoreAndPersistJob(supabase, user.id, result.data);
    return json({ job });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 422 });
  }
};
