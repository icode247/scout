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
}

export type ScoutData = DemoState;

function normalizeState(profile: any, resumes: any[], jobProfiles: any[], jobs: any[], applications: any[], profileResumes: any[] = []): ScoutData {
  const normalizedJobProfiles = (jobProfiles || []).map((jobProfile) => ({
    ...jobProfile,
    assistant_type: jobProfile.assistant_type === "human" ? "human" : "ai",
    target_roles: Array.isArray(jobProfile.target_roles) ? jobProfile.target_roles : [],
    locations: Array.isArray(jobProfile.locations) ? jobProfile.locations : [],
    resume_ids: profileResumes.length
      ? profileResumes.filter((link) => link.job_profile_id === jobProfile.id).map((link) => link.resume_id)
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
      };
    }),
    applications: (applications || []).map((application) => ({
      ...application,
      answer_evidence: Array.isArray(application.answer_evidence) ? application.answer_evidence : [],
    })),
  };
}

export async function loadScoutData(user: User, supabase?: SupabaseClient, demoMode = false): Promise<ScoutData> {
  if (demoMode || !supabase) {
    const state = getDemoState(user.id, user.email);
    return normalizeState(state.profile, state.resumes, state.jobProfiles, state.jobs, state.applications);
  }
  const [profileResult, resumesResult, jobProfilesResult, jobsResult, applicationsResult, profileResumesResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("resumes").select("*").order("created_at", { ascending: false }),
    supabase.from("job_profiles").select("*").order("created_at", { ascending: true }),
    supabase.from("jobs").select("*").order("created_at", { ascending: false }),
    supabase.from("applications").select("*").order("created_at", { ascending: false }),
    supabase.from("job_profile_resumes").select("job_profile_id,resume_id,is_primary"),
  ]);
  const error = profileResult.error || resumesResult.error || jobProfilesResult.error || jobsResult.error || applicationsResult.error || profileResumesResult.error;
  if (error) throw new Error(`Unable to load Scout data: ${error.message}`);
  const profile = profileResult.data ?? {
    user_id: user.id,
    full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Scout member",
    email: user.email || "",
    assistant_type: "ai",
    onboarding_complete: false,
    assistant_name: null,
    whatsapp_url: null,
  };
  return normalizeState(profile, resumesResult.data || [], jobProfilesResult.data || [], jobsResult.data || [], applicationsResult.data || [], profileResumesResult.data || []);
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
