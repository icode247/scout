/**
 * The profile editor's working copy of a job profile's application answers, and the two
 * mappings around it: stored `applicant_profile` → draft (folding every older shape Scout has
 * stored, so the editor always shows a canonical choice), and draft → the object the form posts
 * (which the profiles API then runs through `cleanApplicantProfile`). Pure, so it is tested
 * without a browser.
 */
import {
  canonicalNoticePeriod,
  canonicalRemotePreference,
  canonicalSecurityClearance,
  cleanCitizenships,
  cleanLanguageProficiencies,
  cleanProjects,
  cleanWorkAuthorizations,
} from "../../lib/applicant-payload";
import {
  canonicalAnswer,
  canonicalDisabilityStatus,
  canonicalVeteranStatus,
  isLanguageLevel,
  normalizeCountryName,
  phoneCountryId,
  type LanguageLevel,
  type NormalizableField,
  type WorkAuthorizationDraft,
} from "../../lib/profile-values";
import { SENSITIVE_SELF_ID_FIELDS } from "../../lib/privacy";

export interface ExperienceEntry { title: string; company: string; location: string; startDate: string; endDate: string; description: string }
export interface EducationEntry { school: string; degree: string; major: string; gpa: string; startDate: string; endDate: string; location: string }
export interface ProjectEntry { name: string; description: string; url: string }
export interface ReferenceEntry { name: string; email: string; phone: string; type: string }
export interface LinkEntry { label: string; url: string }
export interface LanguageRow { language: string; level: LanguageLevel | "" }
export type ConsentChoice = "" | "granted" | "declined";

export interface ApplicantDraft {
  firstName: string; middleName: string; lastName: string; email: string;
  /** ISO id ("US"), as FastApply stores it. */
  phoneCountryCode: string; phoneNumber: string;
  streetAddress: string; currentCity: string; state: string; zipcode: string; country: string; timezone: string;
  /** ISO `YYYY-MM-DD`. */
  dateOfBirth: string;
  citizenships: string[];
  languages: LanguageRow[];
  headline: string; summary: string; yearsOfExperience: string;
  skills: string[]; certifications: string[]; coverLetter: string;
  experience: ExperienceEntry[]; education: EducationEntry[]; projects: ProjectEntry[];
  desiredSalary: string; desiredSalaryCurrency: string; desiredSalaryNegotiable: boolean;
  currentSalary: string; currentSalaryCurrency: string;
  /** null = never set up (the old single answer is then the suggestion); [] = authorized nowhere. */
  workAuthorizations: WorkAuthorizationDraft[] | null;
  /** The old single answers, kept so a profile not yet moved to the list loses nothing. */
  workAuthorization: string; requiresSponsorship: string;
  securityClearance: string; securityClearanceCountry: string;
  noticePeriod: string; remotePreference: string; willingToRelocate: string; willingToTravel: string;
  driversLicense: string; backgroundCheckConsent: string; drugTestConsent: string;
  linkedinURL: string; githubURL: string; website: string; twitterURL: string;
  additionalLinks: LinkEntry[]; references: ReferenceEntry[];
  howDidYouHearAboutUs: string;
  sensitiveDataConsent: ConsentChoice;
  gender: string; genderSameAsBirthSex: string; sexualOrientation: string; pronouns: string;
  ethnicity: string; race: string; religion: string; disabilityStatus: string; veteranStatus: string;
  maritalStatus: string; criminalRecord: string;
}

const STRING_KEYS = [
  "firstName", "middleName", "lastName", "email", "phoneNumber", "streetAddress", "currentCity", "state", "zipcode",
  "timezone", "dateOfBirth", "headline", "summary", "coverLetter", "desiredSalary", "desiredSalaryCurrency", "currentSalary",
  "currentSalaryCurrency", "workAuthorization", "requiresSponsorship", "linkedinURL", "githubURL", "website", "twitterURL",
  "howDidYouHearAboutUs", "gender", "genderSameAsBirthSex", "sexualOrientation", "pronouns", "ethnicity", "race", "religion",
  "maritalStatus", "criminalRecord",
] as const;

export function emptyDraft(): ApplicantDraft {
  return {
    firstName: "", middleName: "", lastName: "", email: "", phoneCountryCode: "", phoneNumber: "",
    streetAddress: "", currentCity: "", state: "", zipcode: "", country: "", timezone: "", dateOfBirth: "",
    citizenships: [], languages: [],
    headline: "", summary: "", yearsOfExperience: "", skills: [], certifications: [], coverLetter: "",
    experience: [], education: [], projects: [],
    desiredSalary: "", desiredSalaryCurrency: "", desiredSalaryNegotiable: false, currentSalary: "", currentSalaryCurrency: "",
    workAuthorizations: null, workAuthorization: "", requiresSponsorship: "",
    securityClearance: "", securityClearanceCountry: "",
    noticePeriod: "", remotePreference: "", willingToRelocate: "", willingToTravel: "",
    driversLicense: "", backgroundCheckConsent: "", drugTestConsent: "",
    linkedinURL: "", githubURL: "", website: "", twitterURL: "", additionalLinks: [], references: [],
    howDidYouHearAboutUs: "",
    sensitiveDataConsent: "",
    gender: "", genderSameAsBirthSex: "", sexualOrientation: "", pronouns: "", ethnicity: "", race: "", religion: "",
    disabilityStatus: "", veteranStatus: "", maritalStatus: "", criminalRecord: "",
  };
}

const str = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");
/** An older spelling shown as the choice it means ("US Citizen" → "Citizen"); an unknown one as typed. */
const FOLDED_STRING_KEYS: readonly NormalizableField[] = [
  "workAuthorization", "requiresSponsorship", "gender", "genderSameAsBirthSex", "sexualOrientation", "ethnicity", "race",
  "religion", "maritalStatus", "criminalRecord",
];
const answer = (field: NormalizableField, value: unknown) => canonicalAnswer(field, value) ?? "";
const strings = (value: unknown) => (Array.isArray(value)
  ? value.map((item) => (typeof item === "string" ? item : (item as any)?.name)).map((item) => String(item || "").trim()).filter(Boolean)
  : []);

/** A stored `applicant_profile` (any shape Scout has stored) as the editor's draft. */
export function draftFromProfile(raw: Record<string, any> | null | undefined): ApplicantDraft {
  const source = raw || {};
  const draft = emptyDraft();
  for (const key of STRING_KEYS) draft[key] = str(source[key]).trim() === "" ? "" : str(source[key]);
  for (const key of FOLDED_STRING_KEYS) if (draft[key]) draft[key] = canonicalAnswer(key, draft[key]) ?? draft[key];
  draft.country = normalizeCountryName(source.country) ?? "";
  draft.phoneCountryCode = phoneCountryId(source.phoneCountryCode, draft.country) ?? "";
  draft.citizenships = cleanCitizenships(source.citizenships)?.length
    ? cleanCitizenships(source.citizenships)!
    : normalizeCountryName(source.nationality) ? [normalizeCountryName(source.nationality)!] : [];
  // Levels from the proficiency rows; names that only exist on the plain list have none yet.
  const rows = cleanLanguageProficiencies(source.languageProficiencies) ?? [];
  const languages: LanguageRow[] = rows.map((row) => ({ language: row.language, level: row.level ?? "" }));
  for (const name of strings(source.languages)) {
    if (!languages.some((row) => row.language.toLowerCase() === name.toLowerCase())) languages.push({ language: name, level: "" });
  }
  draft.languages = languages;
  draft.yearsOfExperience = source.yearsOfExperience === undefined || source.yearsOfExperience === null ? "" : str(source.yearsOfExperience);
  draft.skills = strings(source.skills);
  draft.certifications = strings(source.certifications);
  draft.experience = (Array.isArray(source.experience) ? source.experience : []).map((item: any) => ({
    title: str(item?.title || item?.role || item?.position), company: str(item?.company), location: str(item?.location),
    startDate: str(item?.startDate), endDate: str(item?.endDate), description: str(item?.description),
  }));
  draft.education = (Array.isArray(source.education) ? source.education : []).map((item: any) => ({
    school: str(item?.school), degree: str(item?.degree), major: str(item?.major || item?.field || item?.fieldOfStudy),
    gpa: str(item?.gpa), startDate: str(item?.startDate), endDate: str(item?.endDate), location: str(item?.location),
  }));
  draft.projects = (cleanProjects(source.projects) ?? []).map((item) => ({ ...item }));
  draft.desiredSalaryNegotiable = source.desiredSalaryNegotiable === true || source.desiredSalaryNegotiable === "true";
  draft.workAuthorizations = cleanWorkAuthorizations(source.workAuthorizations) ?? null;
  draft.securityClearance = canonicalSecurityClearance(source.securityClearance) ?? "";
  draft.securityClearanceCountry = normalizeCountryName(source.securityClearanceCountry) ?? "";
  draft.noticePeriod = canonicalNoticePeriod(source.noticePeriod) ?? "";
  draft.remotePreference = canonicalRemotePreference(source.remotePreference) ?? "";
  draft.willingToRelocate = answer("willingToRelocate", source.willingToRelocate);
  draft.willingToTravel = answer("willingToTravel", source.willingToTravel);
  draft.driversLicense = answer("driversLicense", source.driversLicense);
  draft.backgroundCheckConsent = answer("backgroundCheckConsent", source.backgroundCheckConsent);
  draft.drugTestConsent = answer("drugTestConsent", source.drugTestConsent);
  draft.additionalLinks = source.additionalLinks && typeof source.additionalLinks === "object" && !Array.isArray(source.additionalLinks)
    ? Object.entries(source.additionalLinks).map(([label, url]) => ({ label, url: str(url) }))
    : [];
  draft.references = (Array.isArray(source.references) ? source.references : []).map((item: any) => ({
    name: str(item?.name), email: str(item?.email), phone: str(item?.phone), type: str(item?.type),
  }));
  draft.sensitiveDataConsent = source.sensitiveDataConsent === "granted" || source.sensitiveDataConsent === "declined" ? source.sensitiveDataConsent : "";
  draft.veteranStatus = canonicalVeteranStatus(source.veteranStatus) ?? "";
  draft.disabilityStatus = canonicalDisabilityStatus(source.disabilityStatus) ?? "";
  return draft;
}

const trimmed = (value: string) => value.trim();

/** The draft as the form posts it (`applicant_profile`); blanks are left out. */
export function profileFromDraft(draft: ApplicantDraft): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of STRING_KEYS) if (trimmed(draft[key])) out[key] = trimmed(draft[key]);
  if (draft.country) out.country = draft.country;
  if (draft.phoneCountryCode) out.phoneCountryCode = draft.phoneCountryCode;
  if (draft.citizenships.length) { out.citizenships = draft.citizenships; out.nationality = draft.citizenships[0]; }
  const languages = draft.languages.filter((row) => trimmed(row.language));
  if (languages.length) {
    out.languages = languages.map((row) => trimmed(row.language));
    out.languageProficiencies = languages.map((row) => ({ language: trimmed(row.language), level: isLanguageLevel(row.level) ? row.level : null }));
  }
  const years = Number(draft.yearsOfExperience);
  if (trimmed(draft.yearsOfExperience) && Number.isFinite(years)) out.yearsOfExperience = years;
  if (draft.skills.length) out.skills = draft.skills;
  if (draft.certifications.length) out.certifications = draft.certifications;
  const experience = draft.experience.filter((item) => trimmed(item.title) || trimmed(item.company));
  if (experience.length) out.experience = experience;
  const education = draft.education.filter((item) => trimmed(item.school) || trimmed(item.degree) || trimmed(item.major));
  if (education.length) out.education = education;
  const projects = draft.projects.filter((item) => trimmed(item.name) || trimmed(item.description));
  if (projects.length) out.projects = projects;
  // An expected salary the member chose to negotiate is not a number to send.
  if (draft.desiredSalaryNegotiable) { out.desiredSalaryNegotiable = true; delete out.desiredSalary; }
  // A row without a country is still being filled in and is not saved. A list of only such rows
  // is not an answer at all: [] means "authorized nowhere", and comes from its own button.
  if (draft.workAuthorizations) {
    const placed = draft.workAuthorizations.filter((row) => trimmed(row.country));
    if (placed.length || draft.workAuthorizations.length === 0) out.workAuthorizations = placed;
  }
  for (const key of ["securityClearance", "securityClearanceCountry", "noticePeriod", "remotePreference", "willingToRelocate",
    "willingToTravel", "driversLicense", "backgroundCheckConsent", "drugTestConsent", "veteranStatus", "disabilityStatus"] as const) {
    if (draft[key]) out[key] = draft[key];
  }
  const links = draft.additionalLinks.filter((item) => trimmed(item.label) && trimmed(item.url));
  if (links.length) out.additionalLinks = Object.fromEntries(links.map((item) => [trimmed(item.label), trimmed(item.url)]));
  const references = draft.references.filter((item) => trimmed(item.name));
  if (references.length) out.references = references;
  if (draft.sensitiveDataConsent) out.sensitiveDataConsent = draft.sensitiveDataConsent;
  return out;
}

const isBlank = (value: unknown) =>
  value === "" || value === null || value === undefined || value === false || (Array.isArray(value) && value.length === 0);

/**
 * Fill the draft's blanks from a resume's answers, never overwriting what is there. Returns how
 * many answers were filled, so the editor can say what the resume covered.
 */
export function fillBlanks(draft: ApplicantDraft, from: ApplicantDraft): { draft: ApplicantDraft; filled: number } {
  const next: ApplicantDraft = { ...draft };
  let filled = 0;
  for (const key of Object.keys(next) as (keyof ApplicantDraft)[]) {
    // Self-identification answers never come from a resume, and consent is the member's own.
    if (key === "sensitiveDataConsent" || (SENSITIVE_SELF_ID_FIELDS as readonly string[]).includes(key)) continue;
    if (isBlank(next[key]) && !isBlank(from[key])) {
      (next as any)[key] = from[key];
      filled++;
    }
  }
  return { draft: next, filled };
}
