export type AssistantType = 'ai' | 'human';

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

export interface JobProfile {
  id: string;
  name: string;
  assistant_type: AssistantType;
  target_roles: string[];
  locations: string[];
  salary_min: number | null;
  resume_behavior: 'tailor' | 'original';
  active: boolean;
  resume_ids: string[];
  applicant_profile?: Record<string, unknown>;
}

export interface Resume {
  id: string;
  name: string;
  kind?: 'original' | 'tailored';
  storage_path: string | null;
  extraction_status?: 'processing' | 'complete' | 'failed';
  created_at: string;
}

export interface JobFitAnalysis {
  summary?: string;
  matched_skills?: string[];
  match_reason?: string;
  logo_url?: string;
  platform?: string;
  date_posted?: string;
  workplace_type?: string;
  experience_level?: string;
  search_filter_id?: string | null;
  [key: string]: unknown;
}

export type JobStatus =
  | 'search'
  | 'saved'
  | 'delegated'
  | 'preparing'
  | 'applied'
  | 'interview'
  | 'skipped';

export interface Job {
  id: string;
  persisted?: boolean;
  title: string;
  company: string;
  companyLogo?: string | null;
  initials?: string;
  location: string;
  employment_type?: string | null;
  salary?: string | null;
  description: string;
  external_url: string | null;
  source?: string | null;
  status: JobStatus | string;
  is_saved: boolean;
  fit_score: number | null;
  fit_status: 'pending' | 'processing' | 'complete' | 'failed';
  fit_analysis: JobFitAnalysis;
  assistant_type: AssistantType;
  job_profile_id: string | null;
  profileName?: string;
  posted_at?: string | null;
  created_at?: string;
}

export interface Evidence {
  id: string;
  application_id?: string;
  label: string;
  mime_type: string;
  created_at: string;
}

export interface Application {
  id: string;
  job_id: string;
  job_profile_id: string | null;
  resume_id: string | null;
  assistant_type: AssistantType;
  status: string;
  submitted_at: string | null;
  created_at?: string;
  notes: string | null;
  answer_evidence: { label: string; path?: string }[];
  evidence: Evidence[];
  job: Job;
  jobProfile?: JobProfile | null;
  resume?: Resume | null;
}

export interface Entitlement {
  paid: boolean;
  lane: AssistantType | null;
  planCode: string | null;
  status: 'active' | 'past_due' | 'canceled' | 'expired' | null;
  applicationsUsed: number;
  applicationsQuota: number;
  applicationsRemaining: number;
  canApply: boolean;
  canActivateAgent: boolean;
  hasHumanAssistant: boolean;
  profileLimit: number;
  reason: 'no_plan' | 'quota_exhausted' | 'past_due' | null;
}

export interface BootstrapData {
  profile: ScoutProfile;
  jobProfiles: JobProfile[];
  resumes: Resume[];
  jobs: Job[];
  applications: Application[];
  entitlement: Entitlement;
  syncedAt: string;
}

export interface JobSearchResponse {
  total: number;
  jobs: Job[];
  count: number;
  offset: number;
  nextOffset: number | null;
  relaxedDate?: boolean;
  dateWindowDays?: number | null;
  emptyReason?: string | null;
}

export interface ApiErrorBody {
  error?: string;
  code?: string;
  reason?: string;
}
