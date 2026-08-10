import type { User } from "@supabase/supabase-js";
import { fastApplyProfilePayload } from "./fastapply-applicant";

/**
 * Every answer the /profiles applicant editor collects, keyed exactly as its
 * `data-applicant-key` controls. Shared so the write path (profiles API),
 * the read path (server-rendered prefills) and the resume upload response
 * cannot drift apart.
 */
export const APPLICANT_KEYS = [
  "firstName", "middleName", "lastName", "email", "phoneCountryCode", "phoneNumber",
  "streetAddress", "currentCity", "state", "zipcode", "country", "timezone", "dateOfBirth",
  "headline", "summary", "yearsOfExperience", "noticePeriod", "skills", "languages",
  "certifications", "education", "experience", "coverLetter",
  "desiredSalary", "desiredSalaryCurrency", "desiredSalaryNegotiable",
  "currentSalary", "currentSalaryCurrency", "workAuthorization", "requiresSponsorship",
  "remotePreference", "willingToRelocate", "securityClearance",
  "linkedinURL", "githubURL", "website", "twitterURL", "additionalLinks", "references",
  "gender", "ethnicity", "race", "veteranStatus", "disabilityStatus",
] as const;

const KEYS = new Set<string>(APPLICANT_KEYS);

export function isApplicantKey(key: string) {
  return KEYS.has(key);
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
