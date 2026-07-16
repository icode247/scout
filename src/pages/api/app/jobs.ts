import type { APIRoute } from "astro";
import { assertSameOrigin, errorMessage, json, readBody, requireUser } from "../../../lib/api";
import { getDemoState, type JobStatus } from "../../../lib/demo-store";

export const prerender = false;
const statuses = new Set(["saved", "delegated", "preparing", "applied", "interview", "skipped"]);

export const POST: APIRoute = async (context) => {
  try {
    assertSameOrigin(context);
    const user = requireUser(context);
    const body = await readBody(context.request);
    const profileId = String(body.job_profile_id || "") || null;
    const assistant: "human" | "ai" = body.assistant_type === "human" ? "human" : "ai";
    const record = {
      title: String(body.title || "").trim(),
      company: String(body.company || "").trim(),
      location: String(body.location || "").trim(),
      description: String(body.description || "").trim(),
      external_url: String(body.external_url || "").trim() || null,
      status: statuses.has(String(body.status)) ? String(body.status) as JobStatus : "saved" as JobStatus,
      fit_score: Math.min(100, Math.max(0, Number(body.fit_score) || 0)),
      assistant_type: assistant,
      job_profile_id: profileId,
    };
    if (!record.title || !record.company) return json({ error: "Job title and company are required" }, { status: 400 });
    if (context.locals.demoMode) {
      const job = { id: crypto.randomUUID(), ...record, created_at: new Date().toISOString() };
      const state = getDemoState(user.id, user.email);
      state.jobs.unshift(job);
      if (record.status === "delegated") state.applications.unshift({ id: crypto.randomUUID(), job_id: job.id, job_profile_id: job.job_profile_id, resume_id: state.jobProfiles.find((profile) => profile.id === job.job_profile_id)?.resume_ids[0] || null, assistant_type: job.assistant_type, status: "preparing", submitted_at: null, notes: "Added from your Scout dashboard.", answer_evidence: [] });
      return json({ ok: true, job });
    }
    const result = await context.locals.supabase!.from("jobs").insert({ user_id: user.id, source: String(body.source || "dashboard"), ...record }).select("*").single();
    if (result.error) throw result.error;
    if (record.status === "delegated") {
      const primary = result.data.job_profile_id ? await context.locals.supabase!.from("job_profile_resumes").select("resume_id").eq("job_profile_id", result.data.job_profile_id).order("is_primary", { ascending: false }).limit(1).maybeSingle() : { data: null };
      const application = await context.locals.supabase!.from("applications").insert({ user_id: user.id, job_id: result.data.id, job_profile_id: result.data.job_profile_id, resume_id: primary.data?.resume_id || null, assistant_type: result.data.assistant_type, status: "preparing", notes: "Added from your Scout dashboard." });
      if (application.error) throw application.error;
    }
    return json({ ok: true, job: result.data });
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
    const status = String(body.status || "");
    if (!id || !statuses.has(status)) return json({ error: "Valid job id and status are required" }, { status: 400 });
    if (context.locals.demoMode) {
      const state = getDemoState(user.id, user.email);
      const job = state.jobs.find((item) => item.id === id);
      if (!job) return json({ error: "Job not found" }, { status: 404 });
      job.status = status as JobStatus;
      if (status === "delegated" && !state.applications.some((item) => item.job_id === id)) {
        state.applications.unshift({ id: crypto.randomUUID(), job_id: id, job_profile_id: job.job_profile_id, resume_id: state.resumes[0]?.id || null, assistant_type: job.assistant_type, status: "preparing", submitted_at: null, notes: null, answer_evidence: [] });
      }
      return json({ ok: true, job });
    }
    const supabase = context.locals.supabase!;
    const result = await supabase.from("jobs").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).select("*").single();
    if (result.error) throw result.error;
    if (status === "delegated") {
      const primary = result.data.job_profile_id ? await supabase.from("job_profile_resumes").select("resume_id").eq("job_profile_id", result.data.job_profile_id).order("is_primary", { ascending: false }).limit(1).maybeSingle() : { data: null };
      const app = await supabase.from("applications").upsert({ user_id: user.id, job_id: id, job_profile_id: result.data.job_profile_id, resume_id: primary.data?.resume_id || null, assistant_type: result.data.assistant_type, status: "preparing" }, { onConflict: "user_id,job_id", ignoreDuplicates: true });
      if (app.error) throw app.error;
    }
    return json({ ok: true, job: result.data });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: errorMessage(error) }, { status: 400 });
  }
};
