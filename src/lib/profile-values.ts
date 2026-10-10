/**
 * The answer lists and value rules of a FastApply profile, mirrored for Scout.
 *
 * FastApply validates every one of these lists on `PUT /api/v1/applicants/:id/profile`
 * (its backend `profile-screening-values.ts`, mirrored in its web app's
 * `profileScreeningValues.ts`); a value outside a list is a 400 for the whole save. Scout
 * stores exactly these values so a profile always syncs. Copied on 2026-10-10; when
 * FastApply changes a list, change it here too (and privacy.ts for the consent contract).
 *
 * Pure and dependency-free: the profile editor (a browser island), the profiles API and
 * the payload builder all import it.
 */
import { COUNTRY_ROWS, SCOUT_COUNTRY_ALIASES, type CountryRow } from "./country-table";

export const YES_NO_VALUES = ["Yes", "No"] as const;
export const GENDER_VALUES = ["Male", "Female", "Non-binary", "Prefer not to say"] as const;
export const ETHNICITY_VALUES = ["Hispanic or Latino", "Not Hispanic or Latino", "Prefer not to say"] as const;
/** Race is validated by length upstream; this is the list the editor offers. */
export const RACE_VALUES = [
  "White", "Black or African American", "Asian", "Middle Eastern or North African",
  "Native American or Alaska Native", "Native Hawaiian or Pacific Islander", "Two or More Races", "Prefer not to say",
] as const;
export const VETERAN_STATUS_VALUES = [
  "Yes, I am a protected veteran", "No, I am not a protected veteran", "Prefer not to say",
] as const;
export const DISABILITY_STATUS_VALUES = [
  "Yes, I have a disability", "No, I don't have a disability", "Prefer not to say",
] as const;
export const MARITAL_STATUS_VALUES = [
  "Single", "Married", "Civil partnership", "Separated", "Divorced", "Widowed", "Prefer not to say",
] as const;
export const NOTICE_PERIOD_VALUES = ["Immediate", "2 weeks", "1 month", "2 months", "3 months", "More than 3 months"] as const;
export const REMOTE_PREFERENCE_VALUES = ["Remote", "Hybrid", "On-site", "Flexible"] as const;
export const SECURITY_CLEARANCE_VALUES = [
  "None", "Public Trust", "Confidential", "Secret", "Top Secret", "Top Secret / SCI",
  "Active clearance (level not specified)", "Expired or inactive clearance",
] as const;
export const PRONOUN_SUGGESTIONS = ["He/Him", "She/Her", "They/Them", "He/They", "She/They", "Prefer not to say"] as const;
export const PRONOUNS_MAX_LENGTH = 40;
export const SEXUAL_ORIENTATION_VALUES = ["Heterosexual or straight", "Gay", "Lesbian", "Bisexual", "Queer", "Prefer not to say"] as const;
export const GENDER_SAME_AS_BIRTH_SEX_VALUES = ["Yes", "No", "Prefer not to say"] as const;
export const RELIGION_VALUES = [
  "No religion", "Christian", "Buddhist", "Hindu", "Jewish", "Muslim", "Sikh", "Any other religion", "Prefer not to say",
] as const;
/** Sexual orientation and religion also take the person's own words, up to this long. */
export const SELF_DESCRIBE_MAX_LENGTH = 60;
export const CRIMINAL_RECORD_VALUES = ["No", "Yes", "Prefer not to say"] as const;
export const WILLING_TO_TRAVEL_VALUES = ["No", "Up to 25%", "Up to 50%", "Up to 75%", "Up to 100%"] as const;
export const LANGUAGE_LEVEL_VALUES = [
  "Native or bilingual", "Full professional", "Professional working", "Limited working", "Elementary",
] as const;
export type LanguageLevel = (typeof LANGUAGE_LEVEL_VALUES)[number];

export const WORK_AUTH_STATUS_VALUES = [
  "citizen", "permanent_resident", "work_visa", "student_visa", "dependent_visa",
  "post_study_visa", "refugee_asylee", "tps", "other_authorized",
] as const;
export type WorkAuthStatus = (typeof WORK_AUTH_STATUS_VALUES)[number];
export const WORK_AUTH_STATUS_LABELS: Record<WorkAuthStatus, string> = {
  citizen: "Citizen",
  permanent_resident: "Permanent Resident",
  work_visa: "Work Visa / Work Permit",
  student_visa: "Student Visa",
  dependent_visa: "Dependent Visa",
  post_study_visa: "Post-Study Work Visa",
  refugee_asylee: "Refugee/Asylee",
  tps: "Temporary Protected Status (TPS)",
  other_authorized: "Other work authorization",
};
/** No expiry, no visa type and never sponsorship. */
export const PERMANENT_WORK_AUTH_STATUSES: readonly WorkAuthStatus[] = ["citizen", "permanent_resident"];
export const WORK_AUTHORIZATION_VISA_TYPE_MAX_LENGTH = 60;
export const MAX_WORK_AUTHORIZATIONS = 20;
export const MAX_CITIZENSHIPS = 10;
export const MAX_LANGUAGES = 30;

export interface WorkAuthorizationEntry {
  country: string;
  status: WorkAuthStatus;
  visaType: string | null;
  /** ISO date. */
  expiresAt: string | null;
  needsSponsorship: boolean;
}
/** A row as the editor holds it: sponsorship stays null until a suggested visa row is answered. */
export type WorkAuthorizationDraft = Omit<WorkAuthorizationEntry, "needsSponsorship"> & { needsSponsorship: boolean | null };

export interface LanguageProficiency {
  language: string;
  /** null = the language is on file, its level was never stated. */
  level: LanguageLevel | null;
}

export const isPermanentStatus = (status: unknown): boolean =>
  typeof status === "string" && (PERMANENT_WORK_AUTH_STATUSES as readonly string[]).includes(status);
export const isWorkAuthStatus = (status: unknown): status is WorkAuthStatus =>
  typeof status === "string" && (WORK_AUTH_STATUS_VALUES as readonly string[]).includes(status);
export const isLanguageLevel = (level: unknown): level is LanguageLevel =>
  typeof level === "string" && (LANGUAGE_LEVEL_VALUES as readonly string[]).includes(level);

/** `value` when it is one of `list`, matched case-insensitively and returned in the list's spelling. */
export function oneOf<T extends string>(list: readonly T[], value: unknown): T | undefined {
  if (typeof value !== "string") return undefined;
  const lower = value.trim().toLowerCase();
  return list.find((item) => item.toLowerCase() === lower);
}

/**
 * Veteran and disability status were stored as a bare "Yes"/"No" before Scout used the long
 * forms FastApply validates; FastApply folds them (and its other older spellings) the same way.
 */
export function canonicalVeteranStatus(value: unknown): string | undefined {
  return canonicalAnswer("veteranStatus", value);
}
export function canonicalDisabilityStatus(value: unknown): string | undefined {
  return canonicalAnswer("disabilityStatus", value);
}

// ---------------------------------------------------------------------------
// Countries
// ---------------------------------------------------------------------------

/** FastApply's own alias folds (backend COUNTRY_ALIASES), keyed lower-case. */
const FASTAPPLY_COUNTRY_ALIASES: Record<string, string> = {
  us: "United States", "u.s.": "United States", "u.s": "United States", usa: "United States",
  "u.s.a.": "United States", "u.s.a": "United States", "united states of america": "United States", america: "United States",
  uk: "United Kingdom", "u.k.": "United Kingdom", "u.k": "United Kingdom", england: "United Kingdom",
  "great britain": "United Kingdom", britain: "United Kingdom", scotland: "United Kingdom", wales: "United Kingdom",
  "northern ireland": "United Kingdom",
  uae: "United Arab Emirates", "u.a.e.": "United Arab Emirates", "u.a.e": "United Arab Emirates",
  ksa: "Saudi Arabia", "kingdom of saudi arabia": "Saudi Arabia", "republic of ireland": "Ireland",
  holland: "Netherlands", "the netherlands": "Netherlands", deutschland: "Germany",
  "south korea": "South Korea", "republic of korea": "South Korea", korea: "South Korea",
  "czech republic": "Czechia", "hong kong sar": "Hong Kong", "viet nam": "Vietnam",
  "türkiye": "Turkey", turkiye: "Turkey", "russian federation": "Russia",
  "people's republic of china": "China", prc: "China", "new zeland": "New Zealand", nz: "New Zealand",
  aus: "Australia", "uae - dubai": "United Arab Emirates", dubai: "United Arab Emirates", "abu dhabi": "United Arab Emirates",
};
const SCOUT_ALIASES_LOWER = Object.fromEntries(Object.entries(SCOUT_COUNTRY_ALIASES).map(([from, to]) => [from.toLowerCase(), to]));
const ROW_BY_NAME = new Map(COUNTRY_ROWS.map((row) => [row.name.toLowerCase(), row]));
const ROW_BY_ID = new Map(COUNTRY_ROWS.map((row) => [row.id, row]));

/** Every country the pickers offer, alphabetically. */
export const COUNTRY_NAMES: readonly string[] = COUNTRY_ROWS.map((row) => row.name).sort((a, b) => a.localeCompare(b, "en"));

/**
 * Trim, fold a known alias (FastApply's, then Scout's earlier spellings), match the table's
 * spelling case-insensitively, otherwise keep what was typed. Null for blank. Never invents.
 */
export function normalizeCountryName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const folded = FASTAPPLY_COUNTRY_ALIASES[lower] ?? SCOUT_ALIASES_LOWER[lower];
  if (folded) return folded;
  return ROW_BY_NAME.get(lower)?.name ?? trimmed;
}

export function countryRowByName(name: unknown): CountryRow | undefined {
  const normalized = normalizeCountryName(name);
  return normalized ? ROW_BY_NAME.get(normalized.toLowerCase()) : undefined;
}

export function countryRowById(id: unknown): CountryRow | undefined {
  return typeof id === "string" ? ROW_BY_ID.get(id.trim().toUpperCase()) : undefined;
}

/**
 * The ISO id FastApply stores in `phoneCountryCode`. Accepts the id itself, a country name, or
 * a calling code as Scout stored it before ("+44", "44"). A code shared by several countries
 * ("+1") resolves to the residence country when that country uses it, else to the code's main
 * country (the table lists it first: US for +1, GB for +44); undefined when nothing matches.
 */
export function phoneCountryId(value: unknown, residenceCountry?: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const trimmed = value.trim();
  const byId = countryRowById(trimmed);
  if (byId && /^[A-Za-z]{2}$/.test(trimmed)) return byId.id;
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (/^\+?[0-9][0-9 -]*$/.test(trimmed) && digits) {
    const matches = COUNTRY_ROWS.filter((row) => row.dial.replace(/[^0-9]/g, "") === digits);
    if (!matches.length) return undefined;
    const residence = countryRowByName(residenceCountry);
    return (residence && matches.find((row) => row.id === residence.id) ? residence : matches[0]).id;
  }
  return countryRowByName(trimmed)?.id;
}

export function dialCodeFor(id: unknown): string | undefined {
  return countryRowById(id)?.dial;
}

// ---------------------------------------------------------------------------
// Work authorization
// ---------------------------------------------------------------------------

/** The legacy single status Scout and FastApply stored before the per-country list. */
export const LEGACY_WORK_AUTHORIZATION_VALUES = [
  "Citizen", "Permanent Resident", "Work Visa / Work Permit", "Student Visa", "Dependent Visa",
  "Post-Study Work Visa", "Refugee/Asylee", "Temporary Protected Status (TPS)", "No work authorization yet", "Other",
] as const;

export function workAuthStatusFromLegacy(value: unknown): WorkAuthStatus | "none" | null {
  switch (oneOf(LEGACY_WORK_AUTHORIZATION_VALUES, value)) {
    case "Citizen": return "citizen";
    case "Permanent Resident": return "permanent_resident";
    case "Work Visa / Work Permit": return "work_visa";
    case "Student Visa": return "student_visa";
    case "Dependent Visa": return "dependent_visa";
    case "Post-Study Work Visa": return "post_study_visa";
    case "Refugee/Asylee": return "refugee_asylee";
    case "Temporary Protected Status (TPS)": return "tps";
    case "No work authorization yet": return "none";
    default: return null;
  }
}

export interface LegacyWorkAuthFields {
  workAuthorization?: unknown;
  requiresSponsorship?: unknown;
  citizenships?: readonly string[] | null;
  nationality?: unknown;
  /** Residence. */
  country?: unknown;
}

export interface WorkAuthSuggestion {
  rows: WorkAuthorizationDraft[];
  /** The earlier answer said "no work authorization yet": the right list is []. */
  legacySaysNone: boolean;
}

/**
 * Rows suggested for a profile that never set the per-country list up, from its earlier single
 * answer. The same rule FastApply's answer routes apply while the list is unset, so the
 * suggestion is what the automation already assumes. Home country: the first citizenship, else
 * the residence country when the earlier answers make that the place they are authorized.
 */
export function suggestWorkAuthorizations(legacy: LegacyWorkAuthFields): WorkAuthSuggestion {
  const status = workAuthStatusFromLegacy(legacy.workAuthorization);
  if (status === "none") return { rows: [], legacySaysNone: true };
  if (status === null) return { rows: [], legacySaysNone: false };
  const sponsorship = oneOf(YES_NO_VALUES, legacy.requiresSponsorship);
  const permanent = isPermanentStatus(status);
  const citizenship = normalizeCountryName(legacy.citizenships?.find((c) => !!normalizeCountryName(c))) ?? normalizeCountryName(legacy.nationality);
  const residence = normalizeCountryName(legacy.country);
  let home = citizenship;
  if (!home && (!permanent || sponsorship !== "Yes")) home = residence;
  if (!home) return { rows: [], legacySaysNone: false };
  return {
    rows: [{
      country: home, status, visaType: null, expiresAt: null,
      needsSponsorship: permanent ? false : sponsorship === "Yes" ? true : sponsorship === "No" ? false : null,
    }],
    legacySaysNone: false,
  };
}

/**
 * The single summary pair kept for readers that predate the list (FastApply derives the same
 * one): the entry for the residence country, else the first; none anywhere reads as "No work
 * authorization yet" + needs sponsorship. A summary only — never an answer about one country.
 */
export function legacyPairFrom(list: readonly WorkAuthorizationEntry[], residence: unknown) {
  if (!list.length) return { workAuthorization: "No work authorization yet", requiresSponsorship: "Yes" };
  const home = normalizeCountryName(residence)?.toLowerCase();
  const entry = list.find((item) => item.country.toLowerCase() === home) ?? list[0];
  return {
    workAuthorization: entry.status === "other_authorized" ? "Other" : WORK_AUTH_STATUS_LABELS[entry.status],
    requiresSponsorship: entry.needsSponsorship ? "Yes" : "No",
  };
}

/** The 27 EU member states, as the pickers name them. */
export const EU_MEMBERS: readonly string[] = [
  "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czechia", "Denmark", "Estonia",
  "Finland", "France", "Germany", "Greece", "Hungary", "Ireland", "Italy", "Latvia",
  "Lithuania", "Luxembourg", "Malta", "Netherlands", "Poland", "Portugal", "Romania",
  "Slovakia", "Slovenia", "Spain", "Sweden",
];

/** The last choice of every visa list: reveals a text box. Never stored itself. */
export const VISA_TYPE_OTHER = "Other";
const EU_VISA_TYPES = ["EU Blue Card", "National work permit", "Student visa", "Dependant / family visa"];
export const DEFAULT_VISA_TYPES: readonly string[] = ["Work permit", "Employment / residence visa", "Student visa", "Dependant / family visa"];
/** FastApply's per-country visa names (taken from real application forms). Stored as free text upstream. */
const VISA_TYPES_BY_COUNTRY: Record<string, readonly string[]> = {
  "United States": ["H-1B", "F-1 OPT", "F-1 STEM OPT", "F-1 CPT", "TN", "E-3", "O-1", "L-1", "J-1", "H-4 EAD", "L-2 EAD", "H-1B1", "EAD (other)", "DACA"],
  "United Kingdom": ["Skilled Worker", "Graduate visa", "Health and Care Worker", "Global Talent", "Youth Mobility Scheme", "Student visa", "Dependant visa"],
  Canada: ["Open work permit", "Post-Graduation Work Permit (PGWP)", "Employer-specific work permit", "Study permit"],
  Australia: ["Temporary Skill Shortage (482)", "Temporary Graduate (485)", "Working Holiday (417/462)", "Partner visa", "Student visa (500)"],
  Singapore: ["Employment Pass", "S Pass"],
  ...Object.fromEntries(EU_MEMBERS.map((country) => [country, EU_VISA_TYPES])),
};
const VISA_BY_LOWER = new Map(Object.entries(VISA_TYPES_BY_COUNTRY).map(([country, list]) => [country.toLowerCase(), list]));

export function listedVisaTypesFor(country: unknown): readonly string[] {
  const name = normalizeCountryName(country);
  return (name && VISA_BY_LOWER.get(name.toLowerCase())) || DEFAULT_VISA_TYPES;
}

// ---------------------------------------------------------------------------
// Date of birth
// ---------------------------------------------------------------------------

export const DATE_OF_BIRTH_MIN_AGE = 16;
export const DATE_OF_BIRTH_MAX_AGE = 90;

/** True for a real `YYYY-MM-DD` calendar date. */
export function isIsoCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * The date when it is a real ISO date for an age FastApply accepts (16 to 90, its DTO bounds),
 * else undefined: a slash date or an implausible year is left out rather than failing the save.
 */
export function isoDateOfBirth(value: unknown, today: Date = new Date()): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!isIsoCalendarDate(trimmed)) return undefined;
  const [year, month, day] = trimmed.split("-").map(Number);
  let age = today.getUTCFullYear() - year;
  const months = today.getUTCMonth() - (month - 1);
  if (months < 0 || (months === 0 && today.getUTCDate() < day)) age--;
  return age >= DATE_OF_BIRTH_MIN_AGE && age <= DATE_OF_BIRTH_MAX_AGE ? trimmed : undefined;
}

// ---------------------------------------------------------------------------
// Older spellings (FastApply's normalizeProfileValue, ported 2026-10-10)
// ---------------------------------------------------------------------------

/** The answers FastApply folds older spellings of before validating them against its lists. */
export type NormalizableField =
  | "workAuthorization" | "requiresSponsorship" | "gender" | "ethnicity" | "race" | "veteranStatus"
  | "disabilityStatus" | "maritalStatus" | "noticePeriod" | "remotePreference" | "willingToRelocate"
  | "securityClearance" | "criminalRecord" | "backgroundCheckConsent" | "drugTestConsent" | "driversLicense"
  | "willingToTravel" | "sexualOrientation" | "genderSameAsBirthSex" | "religion";

const DECLINE_SPELLINGS = [
  "prefer not to say", "prefer-not-to-say", "prefernottosay", "prefer_not_to_say", "decline to self-identify",
  "i do not wish to answer", "prefer not to answer", "decline",
];
const YES_SPELLINGS = ["yes", "true", "y", "1"];
const NO_SPELLINGS = ["no", "false", "n", "0"];

/**
 * Every older spelling FastApply folds (its table, from a 2026-10-05 dump of its profiles), keyed by
 * the lower-cased trimmed value. Keep in step with FastApply's profile-screening-values.ts: a
 * spelling folded there but not here is an answer Scout silently drops on the next save.
 */
const LEGACY_SPELLINGS: Partial<Record<NormalizableField, Record<string, string>>> = {
  workAuthorization: {
    citizen: "Citizen", "us citizen": "Citizen", "u.s. citizen": "Citizen",
    "permanent-resident": "Permanent Resident", permanent_resident: "Permanent Resident",
    "green card": "Permanent Resident", "green card holder": "Permanent Resident",
    "visa-holder": "Work Visa / Work Permit", "work visa": "Work Visa / Work Permit", "work permit": "Work Visa / Work Permit",
    "employment visa": "Work Visa / Work Permit",
    "no authorization": "No work authorization yet", "need-sponsorship": "No work authorization yet",
    "needs sponsorship": "No work authorization yet",
    "requires h1b sponsorship": "Other", "has ead": "Other", other: "Other",
  },
  gender: { m: "Male", man: "Male", f: "Female", woman: "Female", nonbinary: "Non-binary", "non binary": "Non-binary" },
  ethnicity: {
    hispanic: "Hispanic or Latino", latino: "Hispanic or Latino", "hispanic/latino": "Hispanic or Latino",
    "not hispanic": "Not Hispanic or Latino", "non-hispanic": "Not Hispanic or Latino",
  },
  race: {
    black: "Black or African American", "african american": "Black or African American", asian: "Asian", white: "White",
    caucasian: "White", "native american": "Native American or Alaska Native",
    "american indian or alaska native": "Native American or Alaska Native",
    "two or more": "Two or More Races", "two or more races": "Two or More Races",
  },
  veteranStatus: {
    "not a veteran": "No, I am not a protected veteran", "not a protected veteran": "No, I am not a protected veteran",
    "i am not a protected veteran": "No, I am not a protected veteran", "protected veteran": "Yes, I am a protected veteran",
    "i am a protected veteran": "Yes, I am a protected veteran", veteran: "Yes, I am a protected veteran",
  },
  disabilityStatus: {
    "i have a disability": "Yes, I have a disability", "i do not have a disability": "No, I don't have a disability",
    "i don't have a disability": "No, I don't have a disability", "no disability": "No, I don't have a disability",
    none: "No, I don't have a disability",
  },
  noticePeriod: {
    immediate: "Immediate", immediately: "Immediate", "2weeks": "2 weeks", "2 week": "2 weeks", "two weeks": "2 weeks",
    "1month": "1 month", "one month": "1 month", "30 days": "1 month", "2months": "2 months", "2_months": "2 months",
    "two months": "2 months", "60 days": "2 months", "3months": "3 months", "three months": "3 months",
    "90 days": "3 months", "more than 3 months": "More than 3 months", "3+ months": "More than 3 months",
  },
  remotePreference: {
    onsite: "On-site", "on site": "On-site", "in-office": "On-site", "in office": "On-site", any: "Flexible", "no preference": "Flexible",
  },
  sexualOrientation: { straight: "Heterosexual or straight", heterosexual: "Heterosexual or straight" },
  religion: { none: "No religion", "no religion": "No religion", atheist: "No religion" },
  securityClearance: {
    none: "None", "no security clearance": "None", "no clearance": "None", no: "None",
    "yes, i have security clearance": "Active clearance (level not specified)", yes: "Active clearance (level not specified)",
    active: "Active clearance (level not specified)", "public trust": "Public Trust", confidential: "Confidential",
    secret: "Secret", "top secret": "Top Secret", ts: "Top Secret", "ts/sci": "Top Secret / SCI",
    "top secret/sci": "Top Secret / SCI", "top secret / sci": "Top Secret / SCI", "top secret sci": "Top Secret / SCI",
    expired: "Expired or inactive clearance", inactive: "Expired or inactive clearance",
  },
};

/** Each field's canonical list, for the case-insensitive match after the table. */
function canonicalListFor(field: NormalizableField): readonly string[] {
  switch (field) {
    case "workAuthorization": return LEGACY_WORK_AUTHORIZATION_VALUES;
    case "gender": return GENDER_VALUES;
    case "ethnicity": return ETHNICITY_VALUES;
    case "race": return RACE_VALUES;
    case "veteranStatus": return VETERAN_STATUS_VALUES;
    case "disabilityStatus": return DISABILITY_STATUS_VALUES;
    case "maritalStatus": return MARITAL_STATUS_VALUES;
    case "noticePeriod": return NOTICE_PERIOD_VALUES;
    case "remotePreference": return REMOTE_PREFERENCE_VALUES;
    case "securityClearance": return SECURITY_CLEARANCE_VALUES;
    case "criminalRecord": return CRIMINAL_RECORD_VALUES;
    case "willingToTravel": return WILLING_TO_TRAVEL_VALUES;
    case "sexualOrientation": return SEXUAL_ORIENTATION_VALUES;
    case "genderSameAsBirthSex": return GENDER_SAME_AS_BIRTH_SEX_VALUES;
    case "religion": return RELIGION_VALUES;
    default: return YES_NO_VALUES; // requiresSponsorship, willingToRelocate, backgroundCheckConsent, drugTestConsent, driversLicense
  }
}

const YES_NO_FIELDS: ReadonlySet<NormalizableField> = new Set<NormalizableField>([
  "requiresSponsorship", "willingToRelocate", "backgroundCheckConsent", "drugTestConsent", "driversLicense",
]);
const SELF_DESCRIBABLE: ReadonlySet<NormalizableField> = new Set<NormalizableField>(["sexualOrientation", "religion"]);
const HAS_DECLINE: ReadonlySet<NormalizableField> = new Set<NormalizableField>([
  "gender", "ethnicity", "race", "veteranStatus", "disabilityStatus", "maritalStatus", "criminalRecord",
  "sexualOrientation", "genderSameAsBirthSex", "religion",
]);
const YES_NO_LONG_FORM: Partial<Record<NormalizableField, { yes: string; no: string }>> = {
  veteranStatus: { yes: "Yes, I am a protected veteran", no: "No, I am not a protected veteran" },
  disabilityStatus: { yes: "Yes, I have a disability", no: "No, I don't have a disability" },
};

/**
 * A stored or typed answer in its canonical spelling, exactly as FastApply folds it:
 *  - the canonical string when the value is canonical or a known older spelling;
 *  - `null` when it is blank;
 *  - `undefined` when it is not recognised at all (FastApply would refuse it).
 */
export function normalizeProfileValue(field: NormalizableField, value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return normalizeProfileValue(field, value ? "Yes" : "No");
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const legacy = LEGACY_SPELLINGS[field]?.[lower];
  if (legacy) return legacy;
  const canonical = canonicalListFor(field).find((item) => item.toLowerCase() === lower);
  if (canonical) return canonical;
  if (HAS_DECLINE.has(field) && DECLINE_SPELLINGS.includes(lower)) return "Prefer not to say";
  const longForm = YES_NO_LONG_FORM[field];
  if (longForm) {
    if (YES_SPELLINGS.includes(lower)) return longForm.yes;
    if (NO_SPELLINGS.includes(lower)) return longForm.no;
  }
  if (YES_NO_FIELDS.has(field) || field === "genderSameAsBirthSex") {
    if (YES_SPELLINGS.includes(lower)) return "Yes";
    if (NO_SPELLINGS.includes(lower)) return "No";
  }
  // A bare "yes" for travel says nothing about how much; only "no" folds.
  if (field === "willingToTravel" && NO_SPELLINGS.includes(lower)) return "No";
  // Orientation and religion: anything else short enough is the person's own description.
  if (SELF_DESCRIBABLE.has(field) && trimmed.length <= SELF_DESCRIBE_MAX_LENGTH) return trimmed;
  // Race: a "Group - Subgroup" value is canonical too.
  if (field === "race" && / - /.test(trimmed)) return trimmed;
  return undefined;
}

/** The canonical spelling, or undefined when blank or unrecognised. */
export function canonicalAnswer(field: NormalizableField, value: unknown): string | undefined {
  return normalizeProfileValue(field, value) ?? undefined;
}
