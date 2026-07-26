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

// Per-user safety bounds. Real accounts sit far below these; the caps exist only to keep
// a pathological account from streaming an unbounded result set into SSR memory. Rows are
// ordered newest-first, so a capped read keeps the most relevant records.
const MAX_JOBS = 2000;
const MAX_APPLICATIONS = 2000;
const MAX_RESUMES = 500;
const MAX_JOB_PROFILES = 500;
const MAX_PROFILE_RESUMES = 5000;
const MAX_EVIDENCE = 5000;

function normalizeState(profile: any, resumes: any[], jobProfiles: any[], jobs: any[], applications: any[], profileResumes: any[] = [], applicationEvidence: any[] = []): ScoutData {
  // Group profile→resume links by job_profile_id in a single pass: O(links) instead of
  // O(profiles × links) from a .filter() inside the profile map.
  const linksByProfile = new Map<string, any[]>();
  for (const link of profileResumes) {
    const bucket = linksByProfile.get(link.job_profile_id);
    if (bucket) bucket.push(link);
    else linksByProfile.set(link.job_profile_id, [link]);
  }
  // The join table, when populated, is authoritative for resume ordering; a fully empty
  // join table means legacy columns still hold the mapping. This preserves prior semantics.
  const useJoinTable = profileResumes.length > 0;

  const normalizedJobProfiles = (jobProfiles || []).map((jobProfile) => ({
    ...jobProfile,
    assistant_type: jobProfile.assistant_type === "human" ? "human" : "ai",
    target_roles: Array.isArray(jobProfile.target_roles) ? jobProfile.target_roles : [],
    locations: Array.isArray(jobProfile.locations) ? jobProfile.locations : [],
    resume_ids: useJoinTable
      ? (linksByProfile.get(jobProfile.id) || [])
          .slice()
          .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
          .map((link) => link.resume_id)
      : Array.isArray(jobProfile.resume_ids)
        ? jobProfile.resume_ids
        : jobProfile.resume_id
          ? [jobProfile.resume_id]
          : [],
  }));

  // Index job profiles and evidence once so the job/application maps below are O(n).
  const jobProfilesById = new Map<string, any>(normalizedJobProfiles.map((item) => [item.id, item]));
  const evidenceByApplication = new Map<string, any[]>();
  for (const item of applicationEvidence) {
    const bucket = evidenceByApplication.get(item.application_id);
    if (bucket) bucket.push(item);
    else evidenceByApplication.set(item.application_id, [item]);
  }

  return {
    profile,
    resumes: resumes || [],
    jobProfiles: normalizedJobProfiles,
    jobs: (jobs || []).map((job) => {
      const jobProfile = jobProfilesById.get(job.job_profile_id);
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
      evidence: evidenceByApplication.get(application.id) || [],
    })),
  };
}

export async function loadScoutData(user: User, supabase?: SupabaseClient, demoMode = false, preloadedProfile?: ScoutProfile | Record<string, any> | null): Promise<ScoutData> {
  if (demoMode || !supabase) {
    const state = getDemoState(user.id, user.email);
    return normalizeState(state.profile, state.resumes, state.jobProfiles, state.jobs, state.applications);
  }
  // The middleware already loaded this user's profile row into locals. When it is passed
  // through we skip the redundant profiles round-trip and only pay for the data queries.
  const profilePromise = preloadedProfile
    ? Promise.resolve({ data: preloadedProfile, error: null } as const)
    : supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();

  const [profileResult, resumesResult, jobProfilesResult, jobsResult, applicationsResult, profileResumesResult, evidenceResult] = await Promise.all([
    profilePromise,
    supabase.from("resumes").select("*").order("created_at", { ascending: false }).limit(MAX_RESUMES),
    supabase.from("job_profiles").select("*").order("created_at", { ascending: true }).limit(MAX_JOB_PROFILES),
    supabase.from("jobs").select("*").order("created_at", { ascending: false }).limit(MAX_JOBS),
    supabase.from("applications").select("*").order("created_at", { ascending: false }).limit(MAX_APPLICATIONS),
    supabase.from("job_profile_resumes").select("job_profile_id,resume_id,is_primary").limit(MAX_PROFILE_RESUMES),
    supabase.from("application_evidence").select("id,application_id,label,mime_type,created_at").order("created_at", { ascending: true }).limit(MAX_EVIDENCE),
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
  // Index once, then join in O(applications) rather than O(applications × (jobs + profiles + resumes)).
  const jobsById = new Map<string, any>(data.jobs.map((job) => [job.id, job]));
  const profilesById = new Map<string, any>(data.jobProfiles.map((profile) => [profile.id, profile]));
  const resumesById = new Map<string, any>(data.resumes.map((resume) => [resume.id, resume]));
  return data.applications.map((application) => ({
    ...application,
    job: jobsById.get(application.job_id) ?? null,
    jobProfile: application.job_profile_id ? profilesById.get(application.job_profile_id) ?? null : null,
    resume: application.resume_id ? resumesById.get(application.resume_id) ?? null : null,
  })).filter((row) => row.job);
}

export type { AssistantType, JobStatus };
