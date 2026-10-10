/**
 * Self-identification consent — Scout's mirror of FastApply's contract of
 * 2026-10-06 (FastApply backend `src/modules/job-profiles/privacy.ts`, also
 * mirrored in the FastApply web app and extension). Same field list, same
 * values. FastApply's applicant-profile API refuses to STORE an answer on any
 * of these fields unless `sensitiveDataConsent` is "granted" (400 "Consent to
 * use your self-identification answers is required…"), and "declined" resets
 * every one of them to "Prefer not to say". Change this file when that one
 * changes.
 */

/** Special-category (UK/EU) and sensitive (US state law) profile answers. */
export const SENSITIVE_SELF_ID_FIELDS = [
  "gender",
  "ethnicity",
  "race",
  "disabilityStatus",
  "veteranStatus",
  "maritalStatus",
  "pronouns",
  "criminalRecord",
  "sexualOrientation",
  "genderSameAsBirthSex",
  "religion",
] as const;
export type SensitiveSelfIdField = (typeof SENSITIVE_SELF_ID_FIELDS)[number];

/** Present in every one of those fields' option lists; what declining stores. */
export const SELF_ID_DECLINE_VALUE = "Prefer not to say";

/** Stored on `sensitiveDataConsent`; absent or "" means the member has not been asked. */
export const SENSITIVE_CONSENT_VALUES = ["granted", "declined"] as const;
export type SensitiveConsentValue = (typeof SENSITIVE_CONSENT_VALUES)[number];

/** The consent control's copy, identical on the /profiles editor and the /intake questionnaire. */
export const SELF_ID_CONSENT_HEADING = "Your self-identification answers";
export const SELF_ID_CONSENT_BODY =
  "Forms sometimes ask about gender, sexual orientation, race or ethnicity, religion, disability, veteran status, marital status, pronouns or criminal history. Scout uses your answers only to fill those questions on applications submitted for you, never to make decisions about you. “Prefer not to say” is always available, and you can change or withdraw your answers at any time.";
export const SELF_ID_CONSENT_GRANT_LABEL = "Use my answers";
export const SELF_ID_CONSENT_DECLINE_LABEL = "I'd rather not share";

/** The activation gate's name for the unanswered question, shown on /agent. */
export const SELF_ID_CONSENT_GATE_LABEL = "Self-identification answers";
