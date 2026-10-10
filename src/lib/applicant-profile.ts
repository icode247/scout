import type { User } from "@supabase/supabase-js";
import {
  canonicalSecurityClearance,
  cleanCitizenships,
  cleanLanguageProficiencies,
  cleanProjects,
  cleanWorkAuthorizations,
  completeWorkAuthorizations,
  fastApplyProfilePayload,
} from "./applicant-payload";
import { normalizeMonthYear } from "./month-year";
import { reconcileSelfIdConsent } from "./self-id-consent";
import {
  canonicalAnswer,
  isIsoCalendarDate,
  legacyPairFrom,
  normalizeCountryName,
  phoneCountryId,
  type NormalizableField,
} from "./profile-values";

/**
 * Every answer a Scout job profile stores in `applicant_profile`, in FastApply's field names.
 * Shared so the write path (profiles API), the editor, the read path (server-rendered
 * prefills) and the resume upload response cannot drift apart.
 */
export const APPLICANT_KEYS = [
  // Personal and contact
  "firstName", "middleName", "lastName", "email", "phoneCountryCode", "phoneNumber",
  "streetAddress", "currentCity", "state", "zipcode", "country", "timezone", "dateOfBirth",
  "citizenships", "nationality", "languages", "languageProficiencies",
  // Professional profile
  "headline", "summary", "yearsOfExperience", "skills", "certifications", "coverLetter",
  "experience", "education", "projects",
  // Work preferences and eligibility
  "desiredSalary", "desiredSalaryCurrency", "desiredSalaryNegotiable", "currentSalary", "currentSalaryCurrency",
  "workAuthorizations", "workAuthorization", "requiresSponsorship",
  "securityClearance", "securityClearanceCountry", "noticePeriod", "remotePreference", "willingToRelocate",
  "willingToTravel", "driversLicense", "backgroundCheckConsent", "drugTestConsent",
  // Links and references
  "linkedinURL", "githubURL", "website", "twitterURL", "additionalLinks", "references", "howDidYouHearAboutUs",
  // Self-identification (privacy.ts): the consent decision, then the eleven answers it gates.
  // The server's own stamp, sensitiveDataConsentAt, is deliberately not a key a client can send.
  "sensitiveDataConsent",
  "gender", "ethnicity", "race", "veteranStatus", "disabilityStatus",
  "maritalStatus", "pronouns", "criminalRecord", "sexualOrientation", "genderSameAsBirthSex", "religion",
] as const;

export type ApplicantKey = (typeof APPLICANT_KEYS)[number];

const KEYS = new Set<string>(APPLICANT_KEYS);

export function isApplicantKey(key: string) {
  return KEYS.has(key);
}

const LONG_TEXT = new Set(["summary", "coverLetter"]);
const STRING_LISTS = new Set(["skills", "languages", "certifications"]);
const COUNTRY_KEYS = new Set(["country", "nationality", "securityClearanceCountry"]);
/** List answers stored only in FastApply's canonical spelling: older spellings fold, unknown ones drop. */
const LIST_KEYS = new Set<string>([
  "workAuthorization", "requiresSponsorship", "noticePeriod", "remotePreference", "willingToRelocate", "willingToTravel",
  "driversLicense", "backgroundCheckConsent", "drugTestConsent", "veteranStatus", "disabilityStatus",
]);
/**
 * Self-identification answers: the canonical spelling when FastApply knows the one stored, else
 * the member's own words as they were (the payload sends only what FastApply accepts, and the
 * editor then asks for that answer again), so a save never silently erases what they said.
 */
const SELF_ID_LIST_KEYS = new Set<string>([
  "gender", "genderSameAsBirthSex", "sexualOrientation", "ethnicity", "race", "religion", "maritalStatus", "criminalRecord",
]);

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/**
 * The answers as Scout stores them: known keys only, trimmed and capped, list answers in the
 * canonical spelling FastApply validates (an unknown spelling is dropped, not stored), country
 * names folded, the phone country as an ISO id, and the paired fields kept in step
 * (citizenships → nationality, language levels → languages, a complete per-country work
 * authorization list → the old single summary pair). Blank answers are left out.
 */
export function cleanApplicantProfile(input: Record<string, unknown>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [key, item] of Object.entries(input)) {
    if (!isApplicantKey(key) || item === undefined || item === null || item === "") continue;
    if (key === "citizenships") { const list = cleanCitizenships(item); if (list?.length) clean[key] = list; continue; }
    if (key === "languageProficiencies") { const rows = cleanLanguageProficiencies(item); if (rows?.length) clean[key] = rows; continue; }
    if (key === "workAuthorizations") { const rows = cleanWorkAuthorizations(item); if (rows) clean[key] = rows; continue; }
    if (key === "projects") { const rows = cleanProjects(item); if (rows?.length) clean[key] = rows; continue; }
    if (key === "desiredSalaryNegotiable") { if (item === true || item === "true") clean[key] = true; continue; }
    if (key === "yearsOfExperience") {
      const years = typeof item === "number" ? item : typeof item === "string" && item.trim() ? Number(item) : NaN;
      if (Number.isFinite(years) && years >= 0 && years <= 80) clean[key] = years;
      continue;
    }
    if (STRING_LISTS.has(key)) {
      if (!Array.isArray(item)) continue;
      const list = item.map((entry) => (typeof entry === "string" ? entry : (entry as any)?.name)).map((entry) => String(entry || "").trim().slice(0, 200)).filter(Boolean).slice(0, 100);
      if (list.length) clean[key] = list;
      continue;
    }
    // Dates are canonicalized rather than merely trimmed: a date the model cannot place on a
    // timeline is worse than none.
    if (key === "education" && Array.isArray(item)) {
      const rows = item.slice(0, 30).map((entry: any) => ({
        school: String(entry?.school || "").trim().slice(0, 1_000), degree: String(entry?.degree || "").trim().slice(0, 1_000),
        major: String(entry?.major || entry?.field || entry?.fieldOfStudy || "").trim().slice(0, 1_000),
        gpa: String(entry?.gpa || "").trim().slice(0, 100), startDate: normalizeMonthYear(entry?.startDate, false),
        endDate: normalizeMonthYear(entry?.endDate), location: String(entry?.location || "").trim().slice(0, 1_000),
      })).filter((entry) => entry.school || entry.degree || entry.major);
      if (rows.length) clean[key] = rows;
      continue;
    }
    if (key === "experience" && Array.isArray(item)) {
      const rows = item.slice(0, 50).map((entry: any) => ({
        title: String(entry?.title || entry?.role || entry?.position || "").trim().slice(0, 1_000),
        company: String(entry?.company || "").trim().slice(0, 1_000), location: String(entry?.location || "").trim().slice(0, 1_000),
        startDate: normalizeMonthYear(entry?.startDate, false), endDate: normalizeMonthYear(entry?.endDate),
        description: String(entry?.description || "").trim().slice(0, 10_000),
      })).filter((entry) => entry.title || entry.company);
      if (rows.length) clean[key] = rows;
      continue;
    }
    if (key === "references" && Array.isArray(item)) {
      const rows = item.slice(0, 20).map((reference: any) => ({
        name: String(reference?.name || "").trim().slice(0, 200), email: String(reference?.email || "").trim().slice(0, 320),
        phone: String(reference?.phone || "").trim().slice(0, 80), type: String(reference?.type || "").trim().slice(0, 80),
      })).filter((reference) => reference.name);
      if (rows.length) clean[key] = rows;
      continue;
    }
    if (key === "additionalLinks" && typeof item === "object" && !Array.isArray(item)) {
      const links = Object.fromEntries(Object.entries(item as Record<string, unknown>).slice(0, 20)
        .map(([label, url]) => [label.trim().slice(0, 100), String(url ?? "").trim().slice(0, 2_000)]).filter(([label, url]) => label && url));
      if (Object.keys(links).length) clean[key] = links;
      continue;
    }
    if (typeof item !== "string" && typeof item !== "boolean") continue;
    const value = typeof item === "boolean" ? (item ? "Yes" : "No") : text(item, LONG_TEXT.has(key) ? 10_000 : 1_000);
    if (!value) continue;
    let stored: string | undefined = value;
    if (COUNTRY_KEYS.has(key)) stored = normalizeCountryName(value) ?? undefined;
    else if (key === "securityClearance") stored = canonicalSecurityClearance(value);
    else if (LIST_KEYS.has(key)) stored = canonicalAnswer(key as NormalizableField, value);
    else if (SELF_ID_LIST_KEYS.has(key)) stored = canonicalAnswer(key as NormalizableField, value) ?? value;
    else if (key === "dateOfBirth") stored = isIsoCalendarDate(value) ? value : undefined;
    if (stored) clean[key] = stored;
  }
  if (clean.phoneCountryCode) {
    const id = phoneCountryId(clean.phoneCountryCode, clean.country);
    if (id) clean.phoneCountryCode = id; else delete clean.phoneCountryCode;
  }
  // A salary the member chose to negotiate is not a number to send (the editor's rule too).
  if (clean.desiredSalaryNegotiable) delete clean.desiredSalary;
  // Paired fields, kept in step the way FastApply keeps them.
  if (clean.citizenships) clean.nationality = clean.citizenships[0];
  else if (clean.nationality) clean.citizenships = [clean.nationality];
  if (clean.languageProficiencies) clean.languages = clean.languageProficiencies.map((row: { language: string }) => row.language);
  const complete = completeWorkAuthorizations(clean.workAuthorizations);
  if (complete) Object.assign(clean, legacyPairFrom(complete, clean.country));
  return clean;
}

/**
 * The answers a profile save writes. A form that carried no `applicant_profile` at all (posted
 * before the answers editor was listening, or with an editor that failed to load) leaves the
 * stored answers exactly as they are: "unchanged", never "empty". Otherwise the cleaned answers,
 * reconciled with the stored consent decision (self-id-consent.ts).
 */
export function answersForSave(
  sent: boolean,
  incoming: Record<string, any>,
  stored: Record<string, any> | null | undefined,
): Record<string, any> {
  if (!sent) return stored && typeof stored === "object" ? stored : {};
  return reconcileSelfIdConsent(incoming, stored);
}

/**
 * The applicant answers a resume can fill in on its own, ready to hand to the
 * editor. A job profile may be passed so its own columns (salary, target roles)
 * contribute; pass `{}` when prefilling from a resume alone.
 */
export function applicantPrefill(user: User, jobProfile: any, resume: any) {
  const payload = fastApplyProfilePayload(user, jobProfile || {}, resume);
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => KEYS.has(key) && value !== undefined),
  );
}
