import type { APIRoute } from "astro";
import { errorMessage, json, readBody, requireUser } from "../../../lib/api";
import { getDemoState } from "../../../lib/demo-store";
import { loadScoutData } from "../../../lib/scout-data";

export const prerender = false;
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, OPTIONS" };

export const OPTIONS: APIRoute = async () => new Response(null, { status: 204, headers: cors });

export const GET: APIRoute = async (context) => {
  try {
    const user = requireUser(context);
    const data = await loadScoutData(user, context.locals.supabase, context.locals.demoMode);
    return json({ profiles: data.jobProfiles.map(profile => ({ id: profile.id, name: profile.name, assistant_type: profile.assistant_type })) }, { headers: cors });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400, headers: cors });
  }
};

export const POST: APIRoute = async (context) => {
  try {
    const user = requireUser(context);
    const body = await readBody(context.request);
    const profileId = String(body.job_profile_id || "") || null;
    const title = String(body.title || "").trim();
    const company = String(body.company || "").trim();
    if (!title || !company) return json({ error: "title and company are required" }, { status: 400, headers: cors });
    let assistant: "human" | "ai" = "ai";
    if (context.locals.demoMode) {
      const state = getDemoState(user.id, user.email);
      assistant = state.jobProfiles.find(profile => profile.id === profileId)?.assistant_type || "ai";
      const job = { id: crypto.randomUUID(), title, company, location: String(body.location || ""), description: String(body.description || ""), external_url: String(body.external_url || "") || null, status: "delegated" as const, fit_score: 0, assistant_type: assistant, job_profile_id: profileId, created_at: new Date().toISOString() };
      state.jobs.unshift(job);
      state.applications.unshift({ id: crypto.randomUUID(), job_id: job.id, job_profile_id: profileId, resume_id: state.jobProfiles.find((profile) => profile.id === profileId)?.resume_ids[0] || null, assistant_type: assistant, status: "preparing", submitted_at: null, notes: "Added from the Scout browser extension.", answer_evidence: [] });
      return json({ ok: true, job }, { headers: cors });
    }
    const supabase = context.locals.supabase!;
    if (profileId) {
      const result = await supabase.from("job_profiles").select("assistant_type").eq("id", profileId).eq("user_id", user.id).single();
      if (result.error) throw result.error;
      assistant = result.data.assistant_type;
    }
    const result = await supabase.from("jobs").insert({ user_id: user.id, job_profile_id: profileId, title, company, location: String(body.location || ""), description: String(body.description || ""), external_url: String(body.external_url || "") || null, source: "extension", status: "delegated", assistant_type: assistant }).select("*").single();
    if (result.error) throw result.error;
    const primary = profileId ? await supabase.from("job_profile_resumes").select("resume_id").eq("job_profile_id", profileId).order("is_primary", { ascending: false }).limit(1).maybeSingle() : { data: null };
    const application = await supabase.from("applications").insert({ user_id: user.id, job_id: result.data.id, job_profile_id: profileId, resume_id: primary.data?.resume_id || null, assistant_type: assistant, status: "preparing", notes: "Added from the Scout browser extension." });
    if (application.error) throw application.error;
    return json({ ok: true, job: result.data }, { headers: cors });
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status, headers: { ...Object.fromEntries(error.headers), ...cors } });
    return json({ error: errorMessage(error) }, { status: 400, headers: cors });
  }
};
