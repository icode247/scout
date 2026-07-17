import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getDemoState, type AssistantType, type DemoState, type JobStatus } from "./demo-store";

export interface ScoutProfile {
  user_id: string;
  full_name: string;
  email: string;
  assistant_type: AssistantType;
  onboarding_complete: boolean;
  assistant_name: string | null;
  whatsapp_url: string | null;
  whatsapp_phone: string | null;
}

export type ScoutData = DemoState;

function normalizeState(profile: any, resumes: any[], jobProfiles: any[], jobs: any[], applications: any[], profileResumes: any[] = [], applicationEvidence: any[] = []): ScoutData {
  const normalizedJobProfiles = (jobProfiles || []).map((jobProfile) => ({
    ...jobProfile,
    assistant_type: jobProfile.assistant_type === "human" ? "human" : "ai",
    target_roles: Array.isArray(jobProfile.target_roles) ? jobProfile.target_roles : [],
    locations: Array.isArray(jobProfile.locations) ? jobProfile.locations : [],
    resume_ids: profileResumes.length
      ? profileResumes.filter((link) => link.job_profile_id === jobProfile.id).sort((a,b) => Number(b.is_primary) - Number(a.is_primary)).map((link) => link.resume_id)
      : Array.isArray(jobProfile.resume_ids)
        ? jobProfile.resume_ids
        : jobProfile.resume_id
          ? [jobProfile.resume_id]
          : [],
  }));
  return {
    profile,
    resumes: resumes || [],
    jobProfiles: normalizedJobProfiles,
    jobs: (jobs || []).map((job) => {
      const jobProfile = normalizedJobProfiles.find((item) => item.id === job.job_profile_id);
      return {
        ...job,
        title: job.title || "Untitled role",
        company: job.company || "Company not provided",
        assistant_type: job.assistant_type === "human" || job.assistant_type === "ai"
          ? job.assistant_type
          : jobProfile?.assistant_type || "ai",
        status: job.status || "saved",
        is_saved: Boolean(job.is_saved ?? job.status === "saved"),
        fit_score: typeof job.fit_score === "number" ? job.fit_score : null,
        fit_status: job.fit_status || (typeof job.fit_score === "number" ? "complete" : "pending"),
        fit_analysis: job.fit_analysis && typeof job.fit_analysis === "object" ? job.fit_analysis : {},
      };
    }),
    applications: (applications || []).map((application) => ({
      ...application,
      answer_evidence: Array.isArray(application.answer_evidence) ? application.answer_evidence : [],
      evidence: applicationEvidence.filter((item) => item.application_id === application.id),
    })),
  };
}

export async function loadScoutData(user: User, supabase?: SupabaseClient, demoMode = false): Promise<ScoutData> {
  if (demoMode || !supabase) {
    const state = getDemoState(user.id, user.email);
    return normalizeState(state.profile, state.resumes, state.jobProfiles, state.jobs, state.applications);
  }
  const [profileResult, resumesResult, jobProfilesResult, jobsResult, applicationsResult, profileResumesResult, evidenceResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("resumes").select("*").order("created_at", { ascending: false }),
    supabase.from("job_profiles").select("*").order("created_at", { ascending: true }),
    supabase.from("jobs").select("*").order("created_at", { ascending: false }),
    supabase.from("applications").select("*").order("created_at", { ascending: false }),
    supabase.from("job_profile_resumes").select("job_profile_id,resume_id,is_primary"),
    supabase.from("application_evidence").select("id,application_id,label,mime_type,created_at").order("created_at", { ascending: true }),
  ]);
  const error = profileResult.error || resumesResult.error || jobProfilesResult.error || jobsResult.error || applicationsResult.error || profileResumesResult.error || evidenceResult.error;
  if (error) throw new Error(`Unable to load Scout data: ${error.message}`);
  const profile = profileResult.data ?? {
    user_id: user.id,
    full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Scout member",
    email: user.email || "",
    assistant_type: "ai",
    onboarding_complete: false,
    assistant_name: null,
    whatsapp_url: null,
    whatsapp_phone: null,
  };
  return normalizeState(profile, resumesResult.data || [], jobProfilesResult.data || [], jobsResult.data || [], applicationsResult.data || [], profileResumesResult.data || [], evidenceResult.data || []);
}

export function profileById(data: ScoutData, id: string | null) {
  return data.jobProfiles.find((profile) => profile.id === id) ?? null;
}

export function jobById(data: ScoutData, id: string) {
  return data.jobs.find((job) => job.id === id) ?? null;
}

export function applicationRows(data: ScoutData) {
  return data.applications.map((application) => ({
    ...application,
    job: jobById(data, application.job_id),
    jobProfile: profileById(data, application.job_profile_id),
    resume: data.resumes.find((resume) => resume.id === application.resume_id) ?? null,
  })).filter((row) => row.job);
}

export type { AssistantType, JobStatus };
