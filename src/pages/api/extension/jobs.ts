import type { APIRoute } from "astro";
import { errorMessage, json, readBody, requireUser } from "../../../lib/api";
import { getDemoState } from "../../../lib/demo-store";
import { loadScoutData } from "../../../lib/scout-data";
import { scoreAndPersistJob } from "../../../lib/job-match";

export const prerender = false;
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, OPTIONS" };

export const OPTIONS: APIRoute = async () => new Response(null, { status: 204, headers: cors });

export const GET: APIRoute = async (context) => {
  try {
    const user = requireUser(context);
    if (context.locals.scoutProfile?.assistant_type === "ai") return json({ error: "The Chrome extension is not available for AI Agent accounts." }, { status: 403, headers: cors });
    const data = await loadScoutData(user, context.locals.supabase, context.locals.demoMode);
    return json({ profiles: data.jobProfiles.filter(profile => profile.active).map(profile => ({ id: profile.id, name: profile.name, assistant_type: profile.assistant_type })) }, { headers: cors });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400, headers: cors });
  }
};

export const POST: APIRoute = async (context) => {
  try {
    const user = requireUser(context);
    if (context.locals.scoutProfile?.assistant_type === "ai") return json({ error: "The Chrome extension is not available for AI Agent accounts." }, { status: 403, headers: cors });
    const body = await readBody(context.request);
    const profileId = String(body.job_profile_id || "").trim();
    const title = String(body.title || "").trim();
    const company = String(body.company || "").trim();
    if (!title || !company) return json({ error: "title and company are required" }, { status: 400, headers: cors });
    if (!profileId) return json({ error: "Choose a job profile before sending this job" }, { status: 400, headers: cors });
    if (title.length > 180 || company.length > 180) return json({ error: "Job title and company must be under 180 characters" }, { status: 400, headers: cors });
    const externalUrl = String(body.external_url || "").trim();
    if (externalUrl) { try { const parsed = new URL(externalUrl); if (!["http:","https:"].includes(parsed.protocol)) throw new Error(); } catch { return json({ error: "Enter a valid HTTP or HTTPS job URL" }, { status: 400, headers: cors }); } }
    let assistant: "human" | "ai" = "ai";
    if (context.locals.demoMode) {
      const state = getDemoState(user.id, user.email);
      const profile = state.jobProfiles.find(profile => profile.id === profileId);
      if (!profile) return json({ error: "Job profile not found" }, { status: 404, headers: cors });
      if (!profile.resume_ids[0]) return json({ error: "Add a resume to this profile before delegating jobs" }, { status: 409, headers: cors });
      assistant = profile.assistant_type;
      const job = { id: crypto.randomUUID(), title, company, location: String(body.location || ""), description: String(body.description || ""), external_url: externalUrl || null, status: "delegated" as const, is_saved: false, fit_score: 0, fit_status: "complete" as const, fit_analysis: {}, assistant_type: assistant, job_profile_id: profileId, created_at: new Date().toISOString() };
      state.jobs.unshift(job);
      state.applications.unshift({ id: crypto.randomUUID(), job_id: job.id, job_profile_id: profileId, resume_id: state.jobProfiles.find((profile) => profile.id === profileId)?.resume_ids[0] || null, assistant_type: assistant, status: "preparing", submitted_at: null, notes: "Added from the Scout browser extension.", answer_evidence: [] });
      return json({ ok: true, job }, { headers: cors });
    }
    const supabase = context.locals.supabase!;
    const profileResult = await supabase.from("job_profiles").select("assistant_type,active").eq("id", profileId).eq("user_id", user.id).eq("active", true).single();
    if (profileResult.error) return json({ error: "Job profile not found" }, { status: 404, headers: cors });
    assistant = profileResult.data.assistant_type;
    const primary = await supabase.from("job_profile_resumes").select("resume_id").eq("job_profile_id", profileId).eq("user_id", user.id).order("is_primary", { ascending: false }).limit(1).maybeSingle();
    if (primary.error) throw primary.error;
    if (!primary.data?.resume_id) return json({ error: "Add a resume to this profile before delegating jobs" }, { status: 409, headers: cors });
    const result = await supabase.from("jobs").insert({ user_id: user.id, job_profile_id: profileId, title, company, location: String(body.location || ""), description: String(body.description || ""), external_url: String(body.external_url || "") || null, source: "extension", status: "delegated", assistant_type: assistant }).select("*").single();
    if (result.error) throw result.error;
    const application = await supabase.from("applications").insert({ user_id: user.id, job_id: result.data.id, job_profile_id: profileId, resume_id: primary.data?.resume_id || null, assistant_type: assistant, status: "preparing", notes: "Added from the Scout browser extension." });
    if (application.error) { await supabase.from("jobs").delete().eq("id", result.data.id).eq("user_id", user.id); throw application.error; }
    let scoredJob = result.data;
    let scoring_warning: string | undefined;
    try { scoredJob = await scoreAndPersistJob(supabase, user.id, result.data); }
    catch (error) { scoring_warning = error instanceof Error ? error.message : "Job scoring failed"; }
    return json({ ok: true, job: scoredJob, scoring_warning }, { headers: cors });
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status, headers: { ...Object.fromEntries(error.headers), ...cors } });
    return json({ error: errorMessage(error) }, { status: 400, headers: cors });
  }
};
