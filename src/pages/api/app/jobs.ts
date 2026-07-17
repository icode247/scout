import type { APIRoute } from "astro";
import { assertSameOrigin, errorMessage, json, readBody, requireUser } from "../../../lib/api";
import { getDemoState } from "../../../lib/demo-store";
import { scoreAndPersistJob } from "../../../lib/job-match";

export const prerender = false;
export const maxDuration = 60;

function jobFields(body: Record<string, any>) {
  const title = String(body.title || "").trim().slice(0, 180);
  const company = String(body.company || "").trim().slice(0, 180);
  const location = String(body.location || "").trim().slice(0, 240);
  const description = String(body.description || "").trim().slice(0, 50_000);
  const external = String(body.external_url || "").trim();
  if (!title || !company) throw new Error("Job title and company are required");
  if (external) {
    let parsed: URL;
    try { parsed = new URL(external); } catch { throw new Error("Enter a valid job URL"); }
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Job URL must start with http or https");
  }
  return { title, company, location, description, external_url: external || null };
}

async function ownedProfile(context: Parameters<APIRoute>[0], userId: string, profileId: string) {
  if (!profileId) throw new Error("Choose a job profile");
  if (context.locals.demoMode) {
    const profile = getDemoState(userId, context.locals.user?.email).jobProfiles.find((item) => item.id === profileId);
    if (!profile) throw new Error("Job profile not found");
    return profile;
  }
  const result = await context.locals.supabase!.from("job_profiles").select("id,assistant_type,active").eq("id", profileId).eq("user_id", userId).eq("active", true).single();
  if (result.error) throw new Error("Job profile not found");
  return result.data;
}

async function createApplication(context: Parameters<APIRoute>[0], userId: string, job: any) {
  if (context.locals.demoMode) {
    const state = getDemoState(userId, context.locals.user?.email);
    if (!state.applications.some((item) => item.job_id === job.id)) {
      state.applications.unshift({ id: crypto.randomUUID(), job_id: job.id, job_profile_id: job.job_profile_id, resume_id: state.jobProfiles.find((profile) => profile.id === job.job_profile_id)?.resume_ids[0] || null, assistant_type: job.assistant_type, status: "preparing", submitted_at: null, notes: "Added from your Scout dashboard.", answer_evidence: [] });
    }
    return;
  }
  const supabase = context.locals.supabase!;
  const primary = await supabase.from("job_profile_resumes").select("resume_id").eq("job_profile_id", job.job_profile_id).eq("user_id", userId).order("is_primary", { ascending: false }).limit(1).maybeSingle();
  if (primary.error) throw primary.error;
  if (!primary.data?.resume_id) throw new Error("Attach a resume to this job profile before delegating a job");
  const application = await supabase.from("applications").upsert({
    user_id: userId, job_id: job.id, job_profile_id: job.job_profile_id,
    resume_id: primary.data.resume_id, assistant_type: job.assistant_type,
    status: "preparing", notes: "Added from your Scout dashboard.",
  }, { onConflict: "user_id,job_id", ignoreDuplicates: true });
  if (application.error) throw application.error;
}

export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    if (context.locals.scoutProfile?.assistant_type === "ai") return json({ error: "AI Agent accounts use Scout job search and cannot add jobs manually." }, { status: 403 });
    const body = await readBody(context.request);
    const profileId = String(body.job_profile_id || "");
    const profile = await ownedProfile(context, user.id, profileId);
    const status = body.status === "saved" ? "saved" as const : "delegated" as const;
    const record = { ...jobFields(body), status, is_saved: status === "saved", assistant_type: profile.assistant_type, job_profile_id: profileId };

    if (context.locals.demoMode) {
      const job = { id: crypto.randomUUID(), ...record, fit_score: 0, fit_status: "complete" as const, fit_analysis: {}, created_at: new Date().toISOString() };
      getDemoState(user.id, user.email).jobs.unshift(job);
      if (status === "delegated") await createApplication(context, user.id, job);
      return json({ ok: true, job });
    }

    const supabase = context.locals.supabase!;
    const result = await supabase.from("jobs").insert({ user_id: user.id, source: String(body.source || "dashboard").slice(0, 60), ...record }).select("*").single();
    if (result.error) throw result.error;
    try {
      if (status === "delegated") await createApplication(context, user.id, result.data);
    } catch (error) {
      await supabase.from("jobs").delete().eq("id", result.data.id).eq("user_id", user.id);
      throw error;
    }
    let scoredJob = result.data;
    let scoring_warning: string | undefined;
    try { scoredJob = await scoreAndPersistJob(supabase, user.id, result.data); }
    catch (error) { scoring_warning = errorMessage(error); }
    return json({ ok: true, job: scoredJob, scoring_warning });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};

export const PATCH: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const body = await readBody(context.request);
    const id = String(body.id || "");
    if (!id) return json({ error: "Job id is required" }, { status: 400 });

    if (typeof body.is_saved === "boolean") {
      if (context.locals.demoMode) {
        const job = getDemoState(user.id, user.email).jobs.find((item) => item.id === id);
        if (!job) return json({ error: "Job not found" }, { status: 404 });
        job.is_saved = body.is_saved;
        return json({ ok: true, job });
      }
      const saved = await context.locals.supabase!.from("jobs").update({ is_saved: body.is_saved, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).select("*").single();
      if (saved.error) return json({ error: "Job not found" }, { status: 404 });
      return json({ ok: true, job: saved.data });
    }

    if (body.action === "edit") {
      const profileId = String(body.job_profile_id || "");
      const profile = await ownedProfile(context, user.id, profileId);
      const changes = { ...jobFields(body), job_profile_id: profileId, assistant_type: profile.assistant_type, fit_score: null, fit_status: "pending", fit_analysis: {}, fit_error: null, updated_at: new Date().toISOString() };
      if (context.locals.demoMode) {
        const job = getDemoState(user.id, user.email).jobs.find((item) => item.id === id);
        if (!job) return json({ error: "Job not found" }, { status: 404 });
        Object.assign(job, changes);
        return json({ ok: true, job });
      }
      const supabase = context.locals.supabase!;
      const activeApplication = await supabase.from("applications").select("id").eq("job_id", id).eq("user_id", user.id).limit(1).maybeSingle();
      if (activeApplication.error) throw activeApplication.error;
      if (activeApplication.data) return json({ error: "Delegated jobs cannot be edited because their application record is already active" }, { status: 409 });
      const updated = await supabase.from("jobs").update(changes).eq("id", id).eq("user_id", user.id).select("*").single();
      if (updated.error) return json({ error: "Job not found" }, { status: 404 });
      let job = updated.data;
      let scoring_warning;
      try { job = await scoreAndPersistJob(supabase, user.id, updated.data); } catch (error) { scoring_warning = errorMessage(error); }
      return json({ ok: true, job, scoring_warning });
    }

    if (body.status !== "delegated") return json({ error: "Members can only delegate a job from this endpoint" }, { status: 400 });
    if (context.locals.demoMode) {
      const job = getDemoState(user.id, user.email).jobs.find((item) => item.id === id);
      if (!job) return json({ error: "Job not found" }, { status: 404 });
      job.status = "delegated";
      await createApplication(context, user.id, job);
      return json({ ok: true, job });
    }
    const supabase = context.locals.supabase!;
    const current = await supabase.from("jobs").select("*").eq("id", id).eq("user_id", user.id).single();
    if (current.error) return json({ error: "Job not found" }, { status: 404 });
    if (["applied", "interview"].includes(current.data.status)) return json({ error: "This job has already been submitted" }, { status: 409 });
    await createApplication(context, user.id, current.data);
    const result = await supabase.from("jobs").update({ status: "delegated", updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).select("*").single();
    if (result.error) throw result.error;
    return json({ ok: true, job: result.data });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};

export const DELETE: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const id = context.url.searchParams.get("id");
    if (!id) return json({ error: "Job id is required" }, { status: 400 });
    if (context.locals.demoMode) {
      const state = getDemoState(user.id, user.email);
      if (state.applications.some((item) => item.job_id === id)) return json({ error: "Delegated jobs remain in the application record and cannot be deleted" }, { status: 409 });
      state.jobs = state.jobs.filter((item) => item.id !== id);
      return json({ ok: true });
    }
    const supabase = context.locals.supabase!;
    const application = await supabase.from("applications").select("id").eq("job_id", id).eq("user_id", user.id).limit(1).maybeSingle();
    if (application.error) throw application.error;
    if (application.data) return json({ error: "Delegated jobs remain in the application record and cannot be deleted" }, { status: 409 });
    const result = await supabase.from("jobs").delete().eq("id", id).eq("user_id", user.id).select("id").maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return json({ error: "Job not found" }, { status: 404 });
    return json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};
