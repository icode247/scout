import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resumeExtractionProvider } from "./resume";

export interface JobMatchAnalysis {
  score: number;
  summary: string;
  matched_targets: string[];
  matched_skills: string[];
  missing_requirements: string[];
  location_match: "match" | "partial" | "unknown" | "mismatch";
  confidence: "high" | "medium" | "low";
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["score", "summary", "matched_targets", "matched_skills", "missing_requirements", "location_match", "confidence"],
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    summary: { type: "string" },
    matched_targets: { type: "array", items: { type: "string" } },
    matched_skills: { type: "array", items: { type: "string" } },
    missing_requirements: { type: "array", items: { type: "string" } },
    location_match: { type: "string", enum: ["match", "partial", "unknown", "mismatch"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
} as const;

function prompt(job: any, profile: any, resume: any) {
  const extracted = resume?.extracted_data || {};
  const candidate = {
    target_roles: profile.target_roles || [],
    preferred_locations: profile.locations || [],
    salary_min: profile.salary_min,
    headline: extracted.headline || "",
    summary: extracted.summary || "",
    roles: extracted.roles || [],
    education: extracted.education || [],
    skills: extracted.skills || [],
    work_authorization: extracted.work_authorization || "",
    sponsorship_required: extracted.sponsorship_required ?? null,
  };
  const role = { title: job.title, company: job.company, location: job.location, description: job.description };
  return [
    "Assess how well this job matches the candidate profile using only the supplied facts.",
    "Score rubric: role and seniority alignment 30 points; demonstrated skills and experience 40; location/work arrangement 15; education or other explicit requirements 15.",
    "Do not infer unlisted skills. A missing or short job description must lower confidence, not automatically produce a low score. Keep the summary under 240 characters.",
    "CANDIDATE PROFILE:",
    JSON.stringify(candidate),
    "JOB:",
    JSON.stringify(role),
  ].join("\n");
}

async function withOpenAI(input: string): Promise<JobMatchAnalysis> {
  const key = import.meta.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY is required for job scoring");
  const client = new OpenAI({ apiKey: key });
  const response = await client.responses.create({
    model: import.meta.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini",
    input,
    text: { format: { type: "json_schema", name: "job_match", strict: true, schema } },
  });
  if (!response.output_text) throw new Error("OpenAI returned no job match");
  return JSON.parse(response.output_text);
}

async function withAnthropic(input: string): Promise<JobMatchAnalysis> {
  const key = import.meta.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY is required for job scoring");
  const client = new Anthropic({ apiKey: key });
  const response = await client.messages.create({
    model: import.meta.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5",
    max_tokens: 1600,
    messages: [{ role: "user", content: input }],
    output_config: { format: { type: "json_schema", schema } },
  });
  const block = response.content.find((item) => item.type === "text");
  if (!block || block.type !== "text") throw new Error("Anthropic returned no job match");
  return JSON.parse(block.text);
}

export async function calculateJobMatch(job: any, profile: any, resume: any): Promise<JobMatchAnalysis> {
  const result = resumeExtractionProvider() === "openai"
    ? await withOpenAI(prompt(job, profile, resume))
    : await withAnthropic(prompt(job, profile, resume));
  return { ...result, score: Math.max(0, Math.min(100, Math.round(Number(result.score) || 0))) };
}

export async function scoreAndPersistJob(supabase: SupabaseClient, userId: string, job: any) {
  if (!job.job_profile_id) throw new Error("Choose a job profile before scoring this role");
  await supabase.from("jobs").update({ fit_status: "processing", fit_error: null }).eq("id", job.id).eq("user_id", userId);
  try {
    const profileResult = await supabase.from("job_profiles").select("*").eq("id", job.job_profile_id).eq("user_id", userId).single();
    if (profileResult.error) throw profileResult.error;
    const link = await supabase.from("job_profile_resumes").select("resume_id").eq("job_profile_id", job.job_profile_id).eq("user_id", userId).order("is_primary", { ascending: false }).limit(1).maybeSingle();
    const resume = link.data?.resume_id
      ? await supabase.from("resumes").select("id,extracted_data,extraction_status").eq("id", link.data.resume_id).eq("user_id", userId).maybeSingle()
      : { data: null, error: null };
    if (resume.error) throw resume.error;
    const analysis = await calculateJobMatch(job, profileResult.data, resume.data);
    const updated = await supabase.from("jobs").update({
      fit_score: analysis.score, fit_analysis: analysis, fit_status: "complete",
      fit_error: null, fit_updated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", job.id).eq("user_id", userId).select("*").single();
    if (updated.error) throw updated.error;
    return updated.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job scoring failed";
    await supabase.from("jobs").update({ fit_score: null, fit_status: "failed", fit_error: message, fit_updated_at: new Date().toISOString() }).eq("id", job.id).eq("user_id", userId);
    throw error;
  }
}
