/**
 * Profile-completeness gate for Scout AI activation.
 *
 * FastApply fills employers' forms from this profile, and every blank is a question it cannot
 * answer, so activating Scout against an incomplete profile produces an agent that looks
 * "running" while its applications are refused. This mirrors FastApply's own First Apply gate
 * (its web app's `firstApplyProfileGate.ts` REQUIRED_SECTIONS, 2026-10-10): an explicit
 * per-section checklist rather than a partial-credit percentage.
 *
 * The check runs against the payload Scout actually sends (`fastApplyProfilePayload`), not the
 * raw form input — a value the resume supplied counts as filled, exactly as FastApply sees it
 * after the sync. Pure and browser-safe: the profile editor runs it while the member types.
 *
 * Experience and education are required the way FastApply's RUNNER requires them (one job with a
 * title, company, start date and description; one education entry with a degree and a school):
 * without them every apply is skipped as INCOMPLETE_PROFILE, which on Scout looked like an agent
 * "running" and never applying. Projects, links, references and certifications stay optional.
 *
 * Self-identification answers (lib/privacy.ts) are gated by the member's consent decision, as in
 * FastApply's gate: the DECISION is required; the answers are asked for only once it is
 * "granted" ("declined" parks them all at "Prefer not to say", and FastApply refuses to store an
 * answer without consent), so either choice lets Scout AI apply.
 */

import type { User } from "@supabase/supabase-js";
import { fastApplyProfilePayload, hasCompleteEducation, hasCompleteExperience, holdsClearance } from "./applicant-payload";
import { SELF_ID_CONSENT_GATE_LABEL } from "./privacy";
import { isLanguageLevel, isoDateOfBirth } from "./profile-values";
import { normalizeSensitiveConsent } from "./self-id-consent";

type ApplicantPayload = Record<string, any>;

interface FieldSpec {
  key: string;
  /** Matches the label in the /profiles editor so a member can find the field. */
  label: string;
  /** Skip this field's required check when true (e.g. salary fields the form itself disables). */
  skipIf?: (payload: ApplicantPayload) => boolean;
  /** When "non-blank" is not the rule; absent, the field is satisfied by hasValue(payload[key]). */
  isSatisfied?: (payload: ApplicantPayload) => boolean;
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
  /** The payload keys behind `missingFields`, same order, so an editor can point at them. */
  missingKeys: string[];
}

export interface AgentProfileGateResult {
  isComplete: boolean;
  incompleteSections: AgentProfileGateSection[];
}

/**
 * The self-identification answers are asked for only while consent is "granted": "declined"
 * sets them all to "Prefer not to say" (so they are filled), and unanswered means the QUESTION
 * is the gap, not ten answers the member is not allowed to type yet.
 */
const untilSelfIdConsentGranted = (payload: ApplicantPayload) => payload.sensitiveDataConsent !== "granted";

/** Every language has a stated level. With no language at all this is satisfied: that gap is "Languages". */
export function languageLevelsComplete(payload: ApplicantPayload): boolean {
  const rows: any[] = Array.isArray(payload.languageProficiencies) ? payload.languageProficiencies : [];
  const levelled = new Set(rows.filter((row) => isLanguageLevel(row?.level)).map((row) => String(row.language).toLowerCase()));
  const names = [
    ...rows.map((row) => String(row?.language || "").trim()),
    ...(Array.isArray(payload.languages) ? payload.languages : []).map((name: unknown) => String(name || "").trim()),
  ].filter(Boolean);
  return names.every((name) => levelled.has(name.toLowerCase()));
}

export const REQUIRED_SECTIONS: SectionSpec[] = [
  {
    id: "personal",
    label: "Personal and contact",
    fields: [
      { key: "firstName", label: "First name" },
      // middleName is deliberately absent: most people have none, and requiring it made members
      // type a hyphen that then shipped as a literal "-" middle name. FastApply dropped it too.
      { key: "lastName", label: "Last name" },
      { key: "email", label: "Email" },
      { key: "phoneCountryCode", label: "Phone country code" },
      { key: "phoneNumber", label: "Phone number" },
      { key: "country", label: "Country of residence" },
      { key: "currentCity", label: "City" },
      { key: "state", label: "State / region" },
      { key: "streetAddress", label: "Street address" },
      { key: "zipcode", label: "Postal code" },
      { key: "timezone", label: "Timezone" },
      { key: "languages", label: "Languages" },
      { key: "languageProficiencies", label: "Language levels", isSatisfied: languageLevelsComplete },
      // ISO, age 16–90: the only date FastApply stores. The payload already drops anything else.
      { key: "dateOfBirth", label: "Date of birth", isSatisfied: (p) => !!isoDateOfBirth(p.dateOfBirth) },
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
    id: "history",
    label: "Experience and education",
    fields: [
      { key: "experience", label: "A job with title, company, start date and description", isSatisfied: (p) => hasCompleteExperience(p.experience) },
      { key: "education", label: "An education entry with school and degree", isSatisfied: (p) => hasCompleteEducation(p.education) },
    ],
  },
  {
    id: "preferences",
    label: "Work preferences and eligibility",
    fields: [
      // The editor disables the expected salary once the member opts to negotiate.
      { key: "desiredSalary", label: "Expected annual salary", skipIf: (p) => Boolean(p.desiredSalaryNegotiable) },
      { key: "desiredSalaryCurrency", label: "Expected salary currency", skipIf: (p) => Boolean(p.desiredSalaryNegotiable) },
      { key: "currentSalary", label: "Current annual salary" },
      { key: "currentSalaryCurrency", label: "Current salary currency" },
      { key: "citizenships", label: "Citizenship" },
      // The ONLY work-authorization question, as in FastApply: the old single status and
      // sponsorship answers are derived from this list. [] ("nowhere") is a real answer; the
      // payload carries the list only once every row is complete.
      { key: "workAuthorizations", label: "Work authorization by country", isSatisfied: (p) => Array.isArray(p.workAuthorizations) },
      { key: "securityClearance", label: "Security clearance" },
      { key: "securityClearanceCountry", label: "Clearance issued by", skipIf: (p) => !holdsClearance(p.securityClearance) },
      { key: "noticePeriod", label: "Notice period" },
      { key: "remotePreference", label: "Work arrangement" },
      { key: "willingToRelocate", label: "Willing to relocate" },
      { key: "willingToTravel", label: "Willing to travel" },
      { key: "driversLicense", label: "Driver's licence" },
      { key: "backgroundCheckConsent", label: "Background check" },
      { key: "drugTestConsent", label: "Drug test" },
    ],
  },
  {
    id: "demographics",
    label: "Self-identification",
    fields: [
      // FIRST, before any answer: the consent decision, satisfied either way.
      {
        key: "sensitiveDataConsent",
        label: SELF_ID_CONSENT_GATE_LABEL,
        isSatisfied: (payload) => normalizeSensitiveConsent(payload.sensitiveDataConsent) !== null,
      },
      { key: "gender", label: "Gender", skipIf: untilSelfIdConsentGranted },
      { key: "genderSameAsBirthSex", label: "Gender identity", skipIf: untilSelfIdConsentGranted },
      { key: "sexualOrientation", label: "Sexual orientation", skipIf: untilSelfIdConsentGranted },
      { key: "pronouns", label: "Pronouns", skipIf: untilSelfIdConsentGranted },
      { key: "ethnicity", label: "Hispanic or Latino", skipIf: untilSelfIdConsentGranted },
      { key: "race", label: "Race", skipIf: untilSelfIdConsentGranted },
      { key: "religion", label: "Religion or belief", skipIf: untilSelfIdConsentGranted },
      { key: "disabilityStatus", label: "Disability status", skipIf: untilSelfIdConsentGranted },
      { key: "veteranStatus", label: "Veteran status", skipIf: untilSelfIdConsentGranted },
      { key: "criminalRecord", label: "Criminal record", skipIf: untilSelfIdConsentGranted },
    ],
  },
];

/** Every required field, section by section — what a brand new profile still owes. */
export const REQUIRED_FIELD_LABELS = REQUIRED_SECTIONS.map((section) => ({
  id: section.id,
  label: section.label,
  fields: section.fields.map((field) => field.label),
}));

/** The gate's label for a payload key, for editors that mark required fields. */
export function gateLabel(key: string): string | undefined {
  for (const section of REQUIRED_SECTIONS) {
    const field = section.fields.find((item) => item.key === key);
    if (field) return field.label;
  }
  return undefined;
}

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
    const missing = section.fields
      .filter((field) => !field.skipIf?.(applicant))
      .filter((field) => !(field.isSatisfied ? field.isSatisfied(applicant) : hasValue(applicant[field.key])));
    if (missing.length > 0) {
      incompleteSections.push({
        id: section.id,
        label: section.label,
        missingFields: missing.map((field) => field.label),
        missingKeys: missing.map((field) => field.key),
      });
    }
  }

  // Resumes are a separate per-profile sub-resource, never synced onto the
  // applicant payload — callers pass whether the profile has one attached.
  if (!hasResume) {
    incompleteSections.push({ id: "documents", label: "Resume", missingFields: ["Default resume"], missingKeys: ["resume"] });
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
