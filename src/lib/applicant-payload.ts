/**
 * The applicant profile Scout sends to FastApply, and the cleaning rules both the profiles
 * API (what Scout stores) and the payload (what FastApply receives) share.
 *
 * Pure and browser-safe on purpose: the profile editor runs the activation gate on this same
 * payload while the member types, so what the editor calls complete is exactly what Scout AI
 * checks before it starts. Server-only work (the FastApply calls) lives in fastapply-applicant.ts.
 */
import type { User } from "@supabase/supabase-js";
import { normalizeResumeExtraction } from "./resume-extraction";
import { applySelfIdConsent } from "./self-id-consent";
import { SENSITIVE_SELF_ID_FIELDS } from "./privacy";
import { sendableProfileLink } from "./profile-links";
import {
  MAX_CITIZENSHIPS,
  MAX_LANGUAGES,
  MAX_WORK_AUTHORIZATIONS,
  PRONOUNS_MAX_LENGTH,
  SELF_DESCRIBE_MAX_LENGTH,
  WORK_AUTHORIZATION_VISA_TYPE_MAX_LENGTH,
  canonicalAnswer,
  canonicalDisabilityStatus,
  canonicalVeteranStatus,
  isIsoCalendarDate,
  isLanguageLevel,
  isPermanentStatus,
  isWorkAuthStatus,
  isoDateOfBirth,
  legacyPairFrom,
  normalizeCountryName,
  phoneCountryId,
  type LanguageProficiency,
  type WorkAuthorizationDraft,
  type WorkAuthorizationEntry,
} from "./profile-values";

export { isoDateOfBirth } from "./profile-values";

export const compact = (value: Record<string, any>) =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""));

const SECURITY_CLEARANCE_ALIASES: Record<string, string> = {
  "no security clearance": "None", "no clearance": "None", no: "None", "n/a": "None", na: "None", "not applicable": "None", nil: "None",
  "yes, i have security clearance": "Active clearance (level not specified)", yes: "Active clearance (level not specified)", active: "Active clearance (level not specified)",
  ts: "Top Secret", "ts/sci": "Top Secret / SCI", "top secret/sci": "Top Secret / SCI", "top secret sci": "Top Secret / SCI",
  expired: "Expired or inactive clearance", inactive: "Expired or inactive clearance",
};

/**
 * FastApply validates `securityClearance` against its list of levels and refuses the whole save
 * otherwise. A level or a spelling FastApply folds becomes the canonical value (plus a few more
 * Scout's resumes produce); anything else is left out of the payload, and the activation gate then
 * asks for it from the editor's select.
 */
export function canonicalSecurityClearance(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const lower = value.trim().toLowerCase();
  if (!lower) return undefined;
  return canonicalAnswer("securityClearance", lower) ?? SECURITY_CLEARANCE_ALIASES[lower];
}

/** A clearance level that has an issuing country: anything but blank or "None". */
export const holdsClearance = (level: unknown) => {
  const canonical = canonicalSecurityClearance(level);
  return !!canonical && canonical !== "None";
};

/** FastApply stores whole years (`@IsInt`); a resume's "2.5" would fail the save. */
export function wholeYearsOfExperience(value: unknown): number | undefined {
  const years = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(years) || years < 0) return undefined;
  return Math.min(80, Math.round(years));
}

/** A notice period in FastApply's spelling, folding the ones resumes and older rows use ("2months"). */
export const canonicalNoticePeriod = (value: unknown) => canonicalAnswer("noticePeriod", value);
/** A work arrangement in FastApply's spelling ("onsite" → "On-site"). */
export const canonicalRemotePreference = (value: unknown) => canonicalAnswer("remotePreference", value);
const clip = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined);

const filled = (value: unknown) => typeof value === "string" && value.trim() !== "";
const entries = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : []);

/**
 * FastApply's runner skips every apply (INCOMPLETE_PROFILE) for an applicant without at least one
 * job that has a title, company, start date and description, and one education entry with a
 * degree and a school (its profile-completeness.util.ts, including the older field names).
 */
export const hasCompleteExperience = (value: unknown) =>
  entries(value).some((e) => (filled(e.title) || filled(e.position)) && filled(e.company) && filled(e.startDate) && filled(e.description));
export const hasCompleteEducation = (value: unknown) =>
  entries(value).some((e) => filled(e.degree) && (filled(e.school) || filled(e.institution)));

/** Canonical country names, deduplicated, at most ten. */
export function cleanCitizenships(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const item of value) {
    const country = normalizeCountryName(item);
    if (!country || country.length > 100 || out.some((c) => c.toLowerCase() === country.toLowerCase())) continue;
    out.push(country);
    if (out.length >= MAX_CITIZENSHIPS) break;
  }
  return out;
}

/** `{language, level}` rows; a level outside the list is "never stated" (null). */
export function cleanLanguageProficiencies(value: unknown): LanguageProficiency[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: LanguageProficiency[] = [];
  for (const item of value) {
    const language = clip((item as any)?.language, 50);
    if (!language || out.some((row) => row.language.toLowerCase() === language.toLowerCase())) continue;
    const level = (item as any)?.level;
    out.push({ language, level: isLanguageLevel(level) ? level : null });
    if (out.length >= MAX_LANGUAGES) break;
  }
  return out;
}

/**
 * The per-country list as Scout stores it: rows still being filled in are kept (sponsorship may
 * be unanswered), rows without a country are dropped, one row per country, at most twenty.
 * `null` = never set up; `[]` = authorized nowhere, a real answer.
 */
export function cleanWorkAuthorizations(value: unknown): WorkAuthorizationDraft[] | null | undefined {
  if (value === null) return null;
  if (!Array.isArray(value)) return undefined;
  const out: WorkAuthorizationDraft[] = [];
  for (const item of value) {
    const country = normalizeCountryName((item as any)?.country);
    const status = (item as any)?.status;
    if (!country || country.length > 100 || !isWorkAuthStatus(status)) continue;
    if (out.some((row) => row.country.toLowerCase() === country.toLowerCase())) continue;
    const permanent = isPermanentStatus(status);
    const expiresAt = (item as any)?.expiresAt;
    const sponsorship = (item as any)?.needsSponsorship;
    out.push({
      country,
      status,
      visaType: permanent ? null : clip((item as any)?.visaType, WORK_AUTHORIZATION_VISA_TYPE_MAX_LENGTH) ?? null,
      expiresAt: permanent || !isIsoCalendarDate(expiresAt) ? null : expiresAt,
      needsSponsorship: permanent ? false : typeof sponsorship === "boolean" ? sponsorship : null,
    });
    if (out.length >= MAX_WORK_AUTHORIZATIONS) break;
  }
  return out;
}

/** The list FastApply may receive: only when every row is complete, never a half-answered one. */
export function completeWorkAuthorizations(value: unknown): WorkAuthorizationEntry[] | undefined {
  const rows = cleanWorkAuthorizations(value);
  if (!rows) return undefined;
  if (rows.some((row) => row.needsSponsorship === null)) return undefined;
  return rows as WorkAuthorizationEntry[];
}

/** Projects as FastApply's editor keeps them. */
export function cleanProjects(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 30).map((item: any) => ({
    name: String(item?.name || item?.title || "").trim().slice(0, 300),
    description: String(item?.description || "").trim().slice(0, 5_000),
    url: String(item?.url || item?.link || "").trim().slice(0, 2_000),
  })).filter((item) => item.name || item.description);
}

export function fastApplyProfilePayload(user: User, profile: any, resume: any) {
  // The extraction is normalized first, so v1 rows (snake_case, nested `contact`) and v2 rows
  // are read through one set of names. Answers the member typed always win over the resume.
  const data = normalizeResumeExtraction(resume?.extracted_data), saved = profile?.applicant_profile || {};
  const present = (item: any) => item !== undefined && item !== null && item !== "" && (!Array.isArray(item) || item.length > 0);
  const value = (key: string, ...fallbacks: any[]) => (present(saved[key]) ? saved[key] : fallbacks.find(present));

  const firstName = value("firstName", data.firstName), lastName = value("lastName", data.lastName);
  const country = normalizeCountryName(value("country", data.country)) ?? undefined;
  const citizenships = cleanCitizenships(saved.citizenships)?.length
    ? cleanCitizenships(saved.citizenships)
    : normalizeCountryName(saved.nationality) ? [normalizeCountryName(saved.nationality)!] : undefined;
  const proficiencies = cleanLanguageProficiencies(saved.languageProficiencies);
  const workAuthorizations = completeWorkAuthorizations(saved.workAuthorizations);
  const clearance = canonicalSecurityClearance(value("securityClearance", data.securityClearance));
  // FastApply's own form disables the expected salary once the candidate says it is negotiable, so
  // a negotiable profile never carries a number, from the member, the profile or the resume.
  const negotiable = saved.desiredSalaryNegotiable === true || saved.desiredSalaryNegotiable === "true"
    || (saved.desiredSalaryNegotiable === undefined && data.desiredSalaryNegotiable === true);

  const payload = compact({
    name: [firstName, value("middleName", data.middleName), lastName].filter(Boolean).join(" "),
    firstName, middleName: value("middleName", data.middleName), lastName,
    email: value("email", data.email, user.email),
    // FastApply stores the phone country as an ISO id ("US"); "+1" cannot tell the US from Canada.
    phoneCountryCode: phoneCountryId(value("phoneCountryCode", data.phoneCountryCode), country),
    phoneNumber: value("phoneNumber", data.phoneNumber),
    streetAddress: value("streetAddress", data.streetAddress), currentCity: value("currentCity", data.currentCity),
    state: value("state", data.state), zipcode: value("zipcode", data.zipcode), country,
    citizenships, nationality: citizenships?.[0],
    timezone: value("timezone", data.timezone),
    headline: value("headline", data.headline, profile?.target_roles?.[0]), summary: value("summary", data.summary),
    // FastApply validates these strictly (whole years; an ISO date of birth aged 16–90; a
    // clearance LEVEL from its list). A value it would refuse is left out instead of failing the save.
    yearsOfExperience: wholeYearsOfExperience(value("yearsOfExperience", data.yearsOfExperience)),
    dateOfBirth: isoDateOfBirth(value("dateOfBirth", data.dateOfBirth)),
    securityClearance: clearance,
    securityClearanceCountry: holdsClearance(clearance) ? normalizeCountryName(saved.securityClearanceCountry) ?? undefined : undefined,
    desiredSalary: negotiable ? undefined : value("desiredSalary", profile?.salary_min ? String(profile.salary_min) : undefined, data.desiredSalary),
    desiredSalaryCurrency: value("desiredSalaryCurrency", profile?.salary_currency, data.desiredSalaryCurrency),
    desiredSalaryNegotiable: negotiable || undefined,
    currentSalary: value("currentSalary", data.currentSalary), currentSalaryCurrency: value("currentSalaryCurrency", data.currentSalaryCurrency),
    noticePeriod: canonicalNoticePeriod(value("noticePeriod", data.noticePeriod)),
    remotePreference: canonicalRemotePreference(value("remotePreference", profile?.work_mode, data.remotePreference)),
    willingToRelocate: canonicalAnswer("willingToRelocate", value("willingToRelocate", data.willingToRelocate)),
    willingToTravel: canonicalAnswer("willingToTravel", saved.willingToTravel),
    driversLicense: canonicalAnswer("driversLicense", saved.driversLicense),
    backgroundCheckConsent: canonicalAnswer("backgroundCheckConsent", saved.backgroundCheckConsent),
    drugTestConsent: canonicalAnswer("drugTestConsent", saved.drugTestConsent),
    coverLetter: value("coverLetter", data.coverLetter),
    // One network per field, as FastApply checks (profile-links.ts): a link it would refuse, which
    // fails the whole save, is left out instead; the editor tells the member what is wrong.
    linkedinURL: sendableProfileLink("linkedin", value("linkedinURL", data.linkedinURL)),
    githubURL: sendableProfileLink("github", value("githubURL", data.githubURL)),
    website: sendableProfileLink("website", value("website", data.website)),
    twitterURL: sendableProfileLink("twitter", value("twitterURL", data.twitterURL)),
    additionalLinks: value("additionalLinks", data.additionalLinks),
    skills: value("skills", data.skills, []), experience: value("experience", data.experience, []),
    education: value("education", data.education, []),
    projects: cleanProjects(present(saved.projects) ? saved.projects : data.projects) ?? [],
    references: value("references", data.references, []), certifications: value("certifications", data.certifications, []),
    // With levels the member stated, FastApply gets the rows and derives `languages` from them;
    // without, the names alone, and FastApply keeps any level it already holds.
    languageProficiencies: proficiencies?.length ? proficiencies : undefined,
    languages: proficiencies?.length ? proficiencies.map((row) => row.language) : value("languages", data.languages, []),
    // The per-country list when it is complete; FastApply derives the old single pair from it.
    // Otherwise the old pair as before, so a profile still being set up keeps applying.
    workAuthorizations,
    workAuthorization: workAuthorizations ? undefined : canonicalAnswer("workAuthorization", value("workAuthorization", data.workAuthorization)),
    requiresSponsorship: workAuthorizations ? undefined : canonicalAnswer("requiresSponsorship", value("requiresSponsorship", data.requiresSponsorship)),
    // `howDidYouHearAboutUs` is not sent: on FastApply it records how a user found FastApply, and
    // nothing there reads it to answer an employer's form. Human Assistants read Scout's copy.
    // Self-identification answers (lib/privacy.ts) come only from what the member chose to type,
    // never from a resume, and leave here only under their consent decision, applied below.
    sensitiveDataConsent: saved.sensitiveDataConsent,
    gender: canonicalAnswer("gender", saved.gender), ethnicity: canonicalAnswer("ethnicity", saved.ethnicity),
    // FastApply folds race but accepts any value up to 100 characters (its subgroups change in the UI).
    race: canonicalAnswer("race", saved.race) ?? clip(saved.race, 100),
    veteranStatus: canonicalVeteranStatus(saved.veteranStatus), disabilityStatus: canonicalDisabilityStatus(saved.disabilityStatus),
    maritalStatus: canonicalAnswer("maritalStatus", saved.maritalStatus), pronouns: clip(saved.pronouns, PRONOUNS_MAX_LENGTH),
    criminalRecord: canonicalAnswer("criminalRecord", saved.criminalRecord),
    sexualOrientation: canonicalAnswer("sexualOrientation", clip(saved.sexualOrientation, SELF_DESCRIBE_MAX_LENGTH)),
    genderSameAsBirthSex: canonicalAnswer("genderSameAsBirthSex", saved.genderSameAsBirthSex),
    religion: canonicalAnswer("religion", clip(saved.religion, SELF_DESCRIBE_MAX_LENGTH)),
  });

  // "granted" sends the answers as typed, "declined" sends "Prefer not to say" for all eleven, and
  // until the member has chosen none of them is sent at all. FastApply refuses an answer stored
  // without consent (400 "Consent to use your self-identification answers is required…"). Scout's
  // own `sensitiveDataConsentAt` stamp is not in the payload: FastApply keeps its own and refuses one.
  return applySelfIdConsent(payload, saved.sensitiveDataConsent);
}

/**
 * The blank FastApply reads as "no answer" for each answer Scout owns. FastApply's applicant save
 * MERGES (a key left out keeps what it already holds), so an answer the member removed in Scout
 * has to be sent as an explicit blank or FastApply goes on applying with the old one. "" for text
 * and list answers (FastApply folds "" to null), null for the number, the date and the per-country
 * list, false for the negotiable flag (a column that cannot be null). Names, email and the consent
 * decision are never cleared this way. Lists Scout always sends ([] when empty) are not here, and
 * neither are `nationality` and `languageProficiencies`: FastApply derives them from
 * `citizenships` and `languages`, and a blank partner would override the answer sent with it.
 */
const FASTAPPLY_BLANKS: Record<string, "" | null | false | never[]> = {
  middleName: "", phoneCountryCode: "", phoneNumber: "", streetAddress: "", currentCity: "", state: "", zipcode: "",
  country: "", timezone: "", dateOfBirth: null, citizenships: [],
  headline: "", summary: "", yearsOfExperience: null, coverLetter: "",
  desiredSalary: "", desiredSalaryCurrency: "", desiredSalaryNegotiable: false, currentSalary: "", currentSalaryCurrency: "",
  workAuthorizations: null, workAuthorization: "", requiresSponsorship: "",
  securityClearance: "", securityClearanceCountry: "", noticePeriod: "", remotePreference: "", willingToRelocate: "",
  willingToTravel: "", driversLicense: "", backgroundCheckConsent: "", drugTestConsent: "",
  linkedinURL: "", githubURL: "", website: "", twitterURL: "",
};

/**
 * The payload as it is SENT to FastApply: every answer Scout owns is present, blank when the
 * member has none. Only for the upsert itself; the activation gate reads `fastApplyProfilePayload`.
 */
export function withFastApplyBlanks(payload: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { ...payload };
  for (const [key, blank] of Object.entries(FASTAPPLY_BLANKS)) {
    if (!(key in out)) out[key] = Array.isArray(blank) ? [] : blank;
  }
  // A per-country list sets the summary pair upstream; the pair's blanks would only be overridden.
  if (Array.isArray(out.workAuthorizations)) { delete out.workAuthorization; delete out.requiresSponsorship; }
  // Self-identification answers are blanked only under "granted". "declined" already sends "Prefer
  // not to say" for all eleven, and until the member chooses none is touched (privacy page).
  if (out.sensitiveDataConsent === "granted") {
    for (const key of SENSITIVE_SELF_ID_FIELDS) if (!(key in out)) out[key] = "";
  }
  return out;
}

/** Exposed for the profiles API: the summary pair a stored list implies (see legacyPairFrom). */
export { legacyPairFrom };
