/**
 * Answer options for the forms that write an applicant profile: the /profiles editor and the
 * /intake questionnaire. Values are FastApply's canonical spellings (profile-values.ts) — it
 * matches them against employers' questions and refuses anything else — so every list here is
 * built from those, with only the on-screen labels allowed to differ.
 */
import {
  CRIMINAL_RECORD_VALUES,
  DISABILITY_STATUS_VALUES,
  ETHNICITY_VALUES,
  GENDER_SAME_AS_BIRTH_SEX_VALUES,
  GENDER_VALUES,
  LEGACY_WORK_AUTHORIZATION_VALUES,
  MARITAL_STATUS_VALUES,
  NOTICE_PERIOD_VALUES,
  PRONOUN_SUGGESTIONS,
  RACE_VALUES,
  RELIGION_VALUES,
  REMOTE_PREFERENCE_VALUES,
  SECURITY_CLEARANCE_VALUES,
  SEXUAL_ORIENTATION_VALUES,
  VETERAN_STATUS_VALUES,
  YES_NO_VALUES,
} from "./profile-values";
import { SELF_ID_CONSENT_DECLINE_LABEL, SELF_ID_CONSENT_GRANT_LABEL } from "./privacy";

export interface Choice { value: string; label: string }

const plain = (values: readonly string[]): Choice[] => values.map((value) => ({ value, label: value }));

export const NOTICE_PERIODS = plain(NOTICE_PERIOD_VALUES);
/** The old single status; "Other" is FastApply's and not offered on a form. */
export const WORK_AUTHORIZATIONS = plain(LEGACY_WORK_AUTHORIZATION_VALUES.filter((value) => value !== "Other"));
export const YES_NO = plain(YES_NO_VALUES);
export const WORK_ARRANGEMENTS = plain(REMOTE_PREFERENCE_VALUES);
export const GENDERS = plain(GENDER_VALUES);
export const ETHNICITIES = plain(ETHNICITY_VALUES);
export const RACES = plain(RACE_VALUES);
export const VETERAN_STATUSES = plain(VETERAN_STATUS_VALUES);
export const DISABILITY_STATUSES = plain(DISABILITY_STATUS_VALUES);

export const CURRENCIES = [
  "USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CNY", "INR", "CHF", "SGD", "HKD", "NZD", "SEK", "NOK", "DKK", "ZAR", "BRL", "MXN", "AED", "SAR",
  "NGN", "KES", "PLN", "CZK", "ILS", "KRW", "TWD", "THB", "MYR", "PHP", "IDR", "VND", "PKR", "BDT", "EGP", "ARS", "CLP", "COP", "PEN",
];
export const TIMEZONES = [
  "America/New_York (EST)", "America/Chicago (CST)", "America/Denver (MST)", "America/Los_Angeles (PST)", "America/Anchorage (AKST)",
  "Pacific/Honolulu (HST)", "Europe/London (GMT)", "Europe/Paris (CET)", "Europe/Helsinki (EET)", "Asia/Dubai (GST)", "Asia/Kolkata (IST)",
  "Asia/Singapore (SGT)", "Asia/Tokyo (JST)", "Australia/Sydney (AEST)", "Pacific/Auckland (NZST)", "Pacific/Midway (SST)",
  "America/Sao_Paulo (BRT)", "America/Argentina/Buenos_Aires (ART)", "Africa/Lagos (WAT)", "Africa/Johannesburg (SAST)",
  "Africa/Nairobi (EAT)", "Europe/Moscow (MSK)", "Asia/Riyadh (AST)", "Asia/Tehran (IRST)", "Asia/Karachi (PKT)", "Asia/Kathmandu (NPT)",
  "Asia/Dhaka (BST)", "Asia/Yangon (MMT)", "Asia/Bangkok (ICT)", "Asia/Jakarta (WIB)", "Asia/Manila (PHT)", "Asia/Hong_Kong (HKT)",
  "Asia/Seoul (KST)", "Australia/Adelaide (ACST)",
];

/** Clearance LEVELS, as FastApply validates them (a free-text "N/A" or "No" would fail the save). */
export const SECURITY_CLEARANCES = plain(SECURITY_CLEARANCE_VALUES);

// Self-identification answers (privacy.ts). Every list carries "Prefer not to say": it is what
// declining stores, and the one answer that never needs consent.
export const MARITAL_STATUSES = plain(MARITAL_STATUS_VALUES);
export const PRONOUNS = plain(PRONOUN_SUGGESTIONS);
export const CRIMINAL_RECORDS = plain(CRIMINAL_RECORD_VALUES);
export const SEXUAL_ORIENTATIONS = plain(SEXUAL_ORIENTATION_VALUES);
export const GENDER_SAME_AS_BIRTH_SEX = plain(GENDER_SAME_AS_BIRTH_SEX_VALUES);
export const RELIGIONS = plain(RELIGION_VALUES);

/** The consent decision itself; nothing is pre-selected on either form. */
export const SENSITIVE_CONSENT_CHOICES: Choice[] = [
  { value: "granted", label: SELF_ID_CONSENT_GRANT_LABEL },
  { value: "declined", label: SELF_ID_CONSENT_DECLINE_LABEL },
];
