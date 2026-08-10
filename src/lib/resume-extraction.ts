/**
 * Shape of the data extracted from a resume, and the adapter that reads it.
 *
 * Kept free of the extraction SDKs so pages and the profile gate can consume
 * stored extractions without pulling the Anthropic/OpenAI clients into their
 * import graph.
 *
 * Field names match the applicant-profile keys `fastApplyProfilePayload` and
 * the /profiles applicant editor read, so an extracted answer reaches the
 * application service without a rename step. Version 1 used its own snake_case
 * names nested under `contact`; everything whose name did not line up
 * (work_authorization, sponsorship_required, the address inside
 * contact.location) was extracted and then silently dropped.
 * `normalizeResumeExtraction` maps those older rows onto this shape on read, so
 * no backfill is needed.
 */
export interface ResumeExtraction {
  version: 2;
  status: "complete";
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phoneCountryCode: string;
  phoneNumber: string;
  streetAddress: string;
  currentCity: string;
  state: string;
  zipcode: string;
  country: string;
  headline: string;
  summary: string;
  yearsOfExperience: number | null;
  skills: string[];
  languages: string[];
  certifications: string[];
  linkedinURL: string;
  githubURL: string;
  website: string;
  education: Array<{ school: string; degree: string; major: string; gpa: string; startDate: string; endDate: string; location: string }>;
  experience: Array<{ title: string; company: string; location: string; startDate: string; endDate: string; description: string }>;
  workAuthorization: string;
  requiresSponsorship: string;
  securityClearance: string;
  targetRoles: string[];
  preferredLocations: string[];
  desiredSalary: string;
  extracted_at: string;
}

import { normalizeMonthYear } from "./month-year";

export type NormalizedExtraction = Record<string, any>;

const present = (value: unknown) =>
  value !== undefined && value !== null && value !== "" && (!Array.isArray(value) || value.length > 0);

const first = (...candidates: unknown[]) => candidates.find(present);

const stringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : item?.name || item?.title || ""))
      .map((item) => String(item).trim())
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
};

/** v1 stored work history as `roles` with snake_case dates and an achievements list. */
function normalizeExperience(source: NormalizedExtraction) {
  const entries = Array.isArray(source.experience) ? source.experience : Array.isArray(source.roles) ? source.roles : [];
  return entries.map((entry: any) => ({
    title: String(first(entry?.title, entry?.role, entry?.position) || ""),
    company: String(entry?.company || ""),
    location: String(entry?.location || ""),
    // Older rows hold whatever the model wrote ("2021-03", "Mar 2021"); the editor and
    // the application service both expect the one canonical "Month Year" shape.
    startDate: normalizeMonthYear(first(entry?.startDate, entry?.start_date), false),
    endDate: normalizeMonthYear(first(entry?.endDate, entry?.end_date)),
    description: String(
      first(entry?.description, Array.isArray(entry?.achievements) ? entry.achievements.join("\n") : "") || "",
    ),
  }));
}

/** v1 stored education as institution/field/graduation_date. */
function normalizeEducation(source: NormalizedExtraction) {
  const entries = Array.isArray(source.education) ? source.education : [];
  return entries.map((entry: any) => ({
    school: String(first(entry?.school, entry?.institution) || ""),
    degree: String(entry?.degree || ""),
    major: String(first(entry?.major, entry?.field, entry?.fieldOfStudy) || ""),
    gpa: String(entry?.gpa || ""),
    startDate: normalizeMonthYear(first(entry?.startDate, entry?.start_date), false),
    endDate: normalizeMonthYear(first(entry?.endDate, entry?.end_date, entry?.graduation_date)),
    location: String(entry?.location || ""),
  }));
}

function normalizeSponsorship(source: NormalizedExtraction) {
  const explicit = source.requiresSponsorship;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const legacy = source.sponsorship_required;
  if (typeof legacy === "boolean") return legacy ? "Yes" : "No";
  if (typeof explicit === "boolean") return explicit ? "Yes" : "No";
  return "";
}

/**
 * Read a stored extraction — any version — as the current shape.
 *
 * Accepts the row's `extracted_data` directly, including the `{ data: {…} }`
 * wrapper some callers pass. Unknown fields are preserved so nothing that a
 * future schema adds is lost on the way through.
 */
export function normalizeResumeExtraction(raw: unknown): NormalizedExtraction {
  const outer = (raw && typeof raw === "object" ? raw : {}) as NormalizedExtraction;
  const source = (outer.data && typeof outer.data === "object" ? outer.data : outer) as NormalizedExtraction;
  const contact = (source.contact && typeof source.contact === "object" ? source.contact : {}) as NormalizedExtraction;
  const nameParts = String(first(source.name, contact.name) || "").trim().split(/\s+/).filter(Boolean);

  return {
    ...source,
    firstName: String(first(source.firstName, contact.firstName, nameParts[0]) || ""),
    middleName: String(first(source.middleName, contact.middleName) || ""),
    lastName: String(first(source.lastName, contact.lastName, nameParts.slice(1).join(" ")) || ""),
    email: String(first(source.email, contact.email) || ""),
    phoneCountryCode: String(first(source.phoneCountryCode, contact.phoneCountryCode) || ""),
    phoneNumber: String(first(source.phoneNumber, contact.phone, contact.phoneNumber) || ""),
    streetAddress: String(first(source.streetAddress, contact.streetAddress) || ""),
    currentCity: String(first(source.currentCity, contact.city, contact.currentCity) || ""),
    state: String(first(source.state, contact.state) || ""),
    zipcode: String(first(source.zipcode, contact.zipcode) || ""),
    country: String(first(source.country, contact.country) || ""),
    headline: String(source.headline || ""),
    summary: String(source.summary || ""),
    yearsOfExperience: typeof source.yearsOfExperience === "number" ? source.yearsOfExperience : null,
    skills: stringList(source.skills),
    languages: stringList(source.languages),
    certifications: stringList(source.certifications),
    linkedinURL: String(first(source.linkedinURL, contact.linkedin) || ""),
    githubURL: String(first(source.githubURL, contact.github) || ""),
    website: String(first(source.website, source.portfolioURL, contact.website) || ""),
    education: normalizeEducation(source),
    experience: normalizeExperience(source),
    workAuthorization: String(first(source.workAuthorization, source.work_authorization) || ""),
    requiresSponsorship: normalizeSponsorship(source),
    securityClearance: String(source.securityClearance || ""),
    targetRoles: stringList(first(source.targetRoles, source.target_roles)),
    // v1 only ever captured a single free-text `contact.location`, which cannot be
    // split into city/state/country reliably. It is surfaced as a location hint
    // rather than guessed apart, so the gate asks the member for the real address.
    preferredLocations: stringList(first(source.preferredLocations, source.preferred_locations, contact.location)),
    desiredSalary: String(first(source.desiredSalary, source.salary_min) || ""),
  };
}
