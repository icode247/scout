/**
 * Profile-completeness gate for Scout AI activation.
 *
 * FastApply refuses to run an automation whose applicant profile is missing
 * required answers (address, salary expectations, EEO answers, a resume…), so
 * activating Scout against an incomplete profile produces an agent that looks
 * "running" in Scout while never submitting anything. This mirrors FastApply's
 * own First Apply gate: an explicit per-section required-field checklist rather
 * than a partial-credit percentage.
 *
 * The check runs against the payload Scout actually sends
 * (`fastApplyProfilePayload`), not the raw form input — a value the resume
 * supplied counts as filled, exactly as FastApply sees it after the sync.
 *
 * Education, Experience, Links, References, and Certifications are
 * intentionally excluded — the automation runs without them.
 */

import type { User } from "@supabase/supabase-js";
import { fastApplyProfilePayload } from "./fastapply-applicant";

type ApplicantPayload = Record<string, any>;

interface FieldSpec {
  key: string;
  /** Matches the label used in the /profiles applicant editor so a member can find the field. */
  label: string;
  /** Skip this field's required check when true (e.g. salary fields the form itself disables). */
  skipIf?: (payload: ApplicantPayload) => boolean;
}

interface SectionSpec {
  id: string;
  label: string;
  fields: FieldSpec[];
}

export interface AgentProfileGateSection {
  id: string;
  label: string;
  missingFields: string[];
}

export interface AgentProfileGateResult {
  isComplete: boolean;
  incompleteSections: AgentProfileGateSection[];
}

const REQUIRED_SECTIONS: SectionSpec[] = [
  {
    id: "personal",
    label: "Personal and contact",
    fields: [
      { key: "firstName", label: "First name" },
      { key: "middleName", label: "Middle name" },
      { key: "lastName", label: "Last name" },
      { key: "email", label: "Email" },
      { key: "phoneCountryCode", label: "Phone country code" },
      { key: "phoneNumber", label: "Phone number" },
      { key: "streetAddress", label: "Street address" },
      { key: "currentCity", label: "City" },
      { key: "state", label: "State / province" },
      { key: "zipcode", label: "Postal code" },
      { key: "country", label: "Country" },
      { key: "timezone", label: "Timezone" },
      { key: "dateOfBirth", label: "Date of birth" },
      { key: "languages", label: "Languages" },
    ],
  },
  {
    id: "professional",
    label: "Professional profile",
    fields: [
      { key: "headline", label: "Professional headline" },
      { key: "summary", label: "Professional summary" },
      { key: "yearsOfExperience", label: "Years of experience" },
      { key: "skills", label: "Skills" },
    ],
  },
  {
    id: "preferences",
    label: "Work preferences and eligibility",
    fields: [
      {
        key: "desiredSalary",
        label: "Expected annual salary",
        // The editor disables this field once the member opts to negotiate, so a
        // filled value can never exist to require here.
        skipIf: (payload) => Boolean(payload.desiredSalaryNegotiable),
      },
      {
        key: "desiredSalaryCurrency",
        label: "Currency",
        skipIf: (payload) => Boolean(payload.desiredSalaryNegotiable),
      },
      { key: "currentSalary", label: "Current annual salary" },
      { key: "currentSalaryCurrency", label: "Current salary currency" },
      { key: "workAuthorization", label: "Work authorization" },
      { key: "requiresSponsorship", label: "Requires sponsorship" },
      { key: "noticePeriod", label: "Notice period" },
      { key: "remotePreference", label: "Work arrangement" },
      { key: "willingToRelocate", label: "Willing to relocate" },
      { key: "securityClearance", label: "Security clearance" },
    ],
  },
  {
    id: "demographics",
    label: "Demographics",
    fields: [
      { key: "gender", label: "Gender" },
      { key: "ethnicity", label: "Ethnicity" },
      { key: "race", label: "Race" },
      { key: "veteranStatus", label: "Veteran status" },
      { key: "disabilityStatus", label: "Disability status" },
    ],
  },
];

/** Every required field, section by section — what a brand new profile still owes. */
export const REQUIRED_FIELD_LABELS = REQUIRED_SECTIONS.map((section) => ({
  id: section.id,
  label: section.label,
  fields: section.fields.map((field) => field.label),
}));

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true; // numbers (incl. 0) and booleans are valid filled answers
}

export function checkAgentProfileGate(
  payload: ApplicantPayload | null | undefined,
  hasResume: boolean,
): AgentProfileGateResult {
  const applicant = payload || {};
  const incompleteSections: AgentProfileGateSection[] = [];

  for (const section of REQUIRED_SECTIONS) {
    const missingFields = section.fields
      .filter((field) => !field.skipIf?.(applicant) && !hasValue(applicant[field.key]))
      .map((field) => field.label);
    if (missingFields.length > 0) {
      incompleteSections.push({ id: section.id, label: section.label, missingFields });
    }
  }

  // Resumes are a separate per-profile sub-resource, never synced onto the
  // applicant payload — callers pass whether the profile has one attached.
  if (!hasResume) {
    incompleteSections.push({ id: "documents", label: "Resume", missingFields: ["Default resume"] });
  }

  return { isComplete: incompleteSections.length === 0, incompleteSections };
}

/**
 * Gate a job profile using the same payload `ensureFastApplyApplicant` would
 * upload, so the verdict here and FastApply's own check cannot drift.
 */
export function checkJobProfileGate(
  user: User,
  jobProfile: any,
  resume: any | null,
): AgentProfileGateResult {
  return checkAgentProfileGate(fastApplyProfilePayload(user, jobProfile || {}, resume), Boolean(resume));
}

export function agentProfileGateMessage(result: AgentProfileGateResult) {
  return `Complete this job profile before activating Scout AI — missing: ${result.incompleteSections.map((section) => section.label).join(", ")}.`;
}

/** Throws a 400 Response the API route handlers already know how to forward. */
export function assertAgentProfileComplete(result: AgentProfileGateResult, jobProfileId?: string) {
  if (result.isComplete) return;
  throw new Response(JSON.stringify({
    error: agentProfileGateMessage(result),
    code: "profile_incomplete",
    jobProfileId: jobProfileId ?? null,
    sections: result.incompleteSections,
  }), { status: 400, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
