export type AssistantType = "human" | "ai";
export type JobStatus = "saved" | "delegated" | "preparing" | "applied" | "interview" | "skipped";

export interface DemoState {
  profile: {
    user_id: string;
    full_name: string;
    email: string;
    assistant_type: AssistantType;
    onboarding_complete: boolean;
    assistant_name: string | null;
    whatsapp_url: string | null;
    whatsapp_phone: string | null;
  };
  resumes: Array<{ id: string; name: string; kind: "original" | "tailored"; storage_path: string | null; created_at: string }>;
  jobProfiles: Array<{ id: string; name: string; assistant_type: AssistantType; target_roles: string[]; locations: string[]; salary_min: number | null; resume_behavior: "tailor" | "original"; active: boolean; resume_ids: string[] }>;
  jobs: Array<{ id: string; title: string; company: string; location: string; employment_type?: string; salary?: string; description: string; external_url: string | null; source?: string | null; status: JobStatus; is_saved: boolean; fit_score: number | null; fit_status: "pending" | "processing" | "complete" | "failed"; fit_analysis: Record<string, unknown>; assistant_type: AssistantType; job_profile_id: string | null; created_at: string }>;
  applications: Array<{ id: string; job_id: string; job_profile_id: string | null; resume_id: string | null; assistant_type: AssistantType; status: string; submitted_at: string | null; notes: string | null; answer_evidence: Array<{ label: string; path?: string }>; evidence?: Array<{ id: string; label: string; mime_type: string; created_at: string }> }>;
}

const now = new Date().toISOString();
const ids = {
  product: "00000000-0000-4000-8000-000000000101",
  operations: "00000000-0000-4000-8000-000000000102",
  program: "00000000-0000-4000-8000-000000000103",
  resume: "00000000-0000-4000-8000-000000000201",
  job1: "00000000-0000-4000-8000-000000000301",
  job2: "00000000-0000-4000-8000-000000000302",
  job3: "00000000-0000-4000-8000-000000000303",
  job4: "00000000-0000-4000-8000-000000000304",
};

function seed(userId: string, email = "alex@example.com"): DemoState {
  return {
    profile: { user_id: userId, full_name: "Alex Kim", email, assistant_type: "human", onboarding_complete: true, assistant_name: "Taylor", whatsapp_url: "https://wa.me/", whatsapp_phone: "+1 555 010 2040" },
    resumes: [{ id: ids.resume, name: "Alex_Kim_Master.pdf", kind: "original", storage_path: null, created_at: now }],
    jobProfiles: [
      { id: ids.product, name: "Product leadership", assistant_type: "human", target_roles: ["Senior Product Manager", "Product Lead"], locations: ["Remote", "United States"], salary_min: 120000, resume_behavior: "tailor", active: true, resume_ids: [ids.resume] },
      { id: ids.operations, name: "Product operations", assistant_type: "ai", target_roles: ["Product Operations Lead"], locations: ["New York", "Remote"], salary_min: 110000, resume_behavior: "tailor", active: true, resume_ids: [ids.resume] },
      { id: ids.program, name: "Program management", assistant_type: "ai", target_roles: ["Program Manager"], locations: ["Remote"], salary_min: 105000, resume_behavior: "original", active: true, resume_ids: [ids.resume] },
    ],
    jobs: [
      { id: ids.job1, title: "Senior Product Manager", company: "Northstar Health", location: "Remote · United States", description: "Lead product discovery, roadmap decisions, and cross-functional launches across clinical and operations teams.", external_url: "https://example.com/jobs/northstar", status: "applied", is_saved: true, fit_score: 92, fit_status: "complete", fit_analysis: {}, assistant_type: "human", job_profile_id: ids.product, created_at: now },
      { id: ids.job2, title: "Product Operations Lead", company: "Pilot Fiber", location: "New York, NY · Hybrid", description: "Build planning and launch systems for a growing product organization.", external_url: "https://example.com/jobs/pilot", status: "delegated", is_saved: false, fit_score: 88, fit_status: "complete", fit_analysis: {}, assistant_type: "human", job_profile_id: ids.operations, created_at: now },
      { id: ids.job3, title: "Program Manager, Platform", company: "Apricot", location: "Remote · Americas", description: "Coordinate complex platform programs and keep technical and business stakeholders aligned.", external_url: "https://example.com/jobs/apricot", status: "saved", is_saved: true, fit_score: 84, fit_status: "complete", fit_analysis: {}, assistant_type: "ai", job_profile_id: ids.program, created_at: now },
      { id: ids.job4, title: "Product Manager, Growth", company: "Arcade Labs", location: "San Francisco, CA · Hybrid", description: "Own experiments across activation and retention.", external_url: "https://example.com/jobs/arcade", status: "saved", is_saved: true, fit_score: 81, fit_status: "complete", fit_analysis: {}, assistant_type: "ai", job_profile_id: ids.product, created_at: now },
    ],
    applications: [
      { id: "00000000-0000-4000-8000-000000000401", job_id: ids.job1, job_profile_id: ids.product, resume_id: ids.resume, assistant_type: "human", status: "evidence_ready", submitted_at: now, notes: "I used your approved salary range and highlighted the eight-person team from your Atlas role.", answer_evidence: [{ label: "Work authorization" }, { label: "Salary expectation" }, { label: "Leadership experience" }] },
      { id: "00000000-0000-4000-8000-000000000402", job_id: ids.job2, job_profile_id: ids.operations, resume_id: ids.resume, assistant_type: "human", status: "submitted", submitted_at: now, notes: "Application submitted with the Product Operations profile.", answer_evidence: [] },
    ],
  };
}

const globalStore = globalThis as typeof globalThis & { __scoutDemoStore?: Map<string, DemoState> };
const store = globalStore.__scoutDemoStore ??= new Map<string, DemoState>();

export function getDemoState(userId: string, email?: string) {
  if (!store.has(userId)) store.set(userId, seed(userId, email));
  return store.get(userId)!;
}

export function resetDemoState(userId: string, email?: string) {
  const state = seed(userId, email);
  store.set(userId, state);
  return state;
}
