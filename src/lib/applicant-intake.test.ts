import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INTAKE_KEYS, INTAKE_LABELS, cleanIntakeAnswers, formatIntakeAnswer, validWhatsappPhone } from "./applicant-intake";
import { isApplicantKey } from "./applicant-profile";
import { SELF_ID_DECLINE_VALUE, SENSITIVE_SELF_ID_FIELDS } from "./privacy";

describe("cleanIntakeAnswers", () => {
  it("keeps questionnaire answers and drops everything else", () => {
    const answers = cleanIntakeAnswers({
      workAuthorization: " Citizen ", noticePeriod: "2 weeks", email: "a@b.co", full_name: "Alex", website: "spam", firstName: "Alex",
    });
    expect(answers).toEqual({ workAuthorization: "Citizen", noticePeriod: "2 weeks" });
  });

  it("drops blanks and non-string values", () => {
    expect(cleanIntakeAnswers({ nationality: "   ", timezone: 42, race: { x: 1 } })).toEqual({});
  });

  it("stores negotiable salary only when chosen", () => {
    expect(cleanIntakeAnswers({ desiredSalaryNegotiable: true })).toEqual({ desiredSalaryNegotiable: true });
    expect(cleanIntakeAnswers({ desiredSalaryNegotiable: false })).toEqual({});
  });

  it("parses links and references into the applicant-profile shapes", () => {
    const answers = cleanIntakeAnswers({
      additionalLinks: "Behance | https://behance.net/alex\nhttps://www.dribbble.com/alex\n\n",
      references: "Jane Doe | jane@x.co | +1 555 | Manager\n | orphan@x.co",
    });
    expect(answers.additionalLinks).toEqual({ Behance: "https://behance.net/alex", "dribbble.com": "https://www.dribbble.com/alex" });
    expect(answers.references).toEqual([{ name: "Jane Doe", email: "jane@x.co", phone: "+1 555", type: "Manager" }]);
  });

  it("stores authorized countries as a de-duplicated list", () => {
    expect(cleanIntakeAnswers({ workAuthorizationCountries: "Nigeria\nCanada\n\nNigeria " }).workAuthorizationCountries).toEqual(["Nigeria", "Canada"]);
    expect(formatIntakeAnswer(["Nigeria", "Canada"])).toBe("Nigeria, Canada");
  });

  it("accepts WhatsApp numbers the way onboarding does", () => {
    expect(validWhatsappPhone("+44 7700 900123")).toBe(true);
    expect(validWhatsappPhone("(234) 803-555-0101")).toBe(true);
    expect(validWhatsappPhone("call me")).toBe(false);
    expect(validWhatsappPhone("123")).toBe(false);
  });

  it("keeps self-identification answers only under the client's explicit choice", () => {
    const given = { gender: "Male", race: "Asian", veteranStatus: "No", disabilityStatus: "No", ethnicity: "Not Hispanic or Latino" };
    const granted = cleanIntakeAnswers({ ...given, sensitiveDataConsent: "granted" });
    expect(granted).toMatchObject({ ...given, sensitiveDataConsent: "granted" });
    expect(granted.sensitiveDataConsentAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const declined = cleanIntakeAnswers({ ...given, sensitiveDataConsent: "declined" });
    expect(declined.sensitiveDataConsent).toBe("declined");
    for (const key of SENSITIVE_SELF_ID_FIELDS) expect(declined[key]).toBe(SELF_ID_DECLINE_VALUE);

    // No choice, or a value that is not one of the two: nothing sensitive is stored, no stamp either.
    expect(cleanIntakeAnswers({ ...given, noticePeriod: "2 weeks" })).toEqual({ noticePeriod: "2 weeks" });
    expect(cleanIntakeAnswers({ ...given, sensitiveDataConsent: "yes" })).toEqual({});
  });

  it("caps long answers", () => {
    expect(cleanIntakeAnswers({ nationality: "x".repeat(5_000) }).nationality).toHaveLength(2_000);
    expect(cleanIntakeAnswers({ coverLetter: "x".repeat(20_000) }).coverLetter).toHaveLength(10_000);
  });
});

describe("formatIntakeAnswer", () => {
  it("renders every stored shape as text", () => {
    expect(formatIntakeAnswer(true)).toBe("Yes");
    expect(formatIntakeAnswer("granted")).toBe("Use my answers");
    expect(formatIntakeAnswer("declined")).toBe("I'd rather not share");
    expect(formatIntakeAnswer({ Behance: "https://b.net" })).toBe("Behance: https://b.net");
    expect(formatIntakeAnswer([{ name: "Jane", type: "Manager", email: "j@x.co", phone: "" }])).toBe("Jane · Manager · j@x.co");
  });
});

describe("INTAKE_KEYS", () => {
  it("are applicant-profile keys, so answers copy straight into a job profile", () => {
    // workAuthorizationCountries, whatsappPhone and addressLine2 are for the assistant only
    // (the profile keeps one streetAddress line and the per-country list).
    const notInEditor = new Set(["workAuthorizationCountries", "whatsappPhone", "addressLine2"]);
    for (const key of INTAKE_KEYS) if (!notInEditor.has(key)) expect(isApplicantKey(key)).toBe(true);
  });

  it("each have a label and a field on the /intake page", () => {
    const markup = readFileSync(new URL("../pages/intake.astro", import.meta.url), "utf8");
    const names = new Set([...markup.matchAll(/name="([^"]+)"/g)].map((match) => match[1]));
    for (const key of INTAKE_KEYS) {
      expect(names.has(key)).toBe(true);
      expect(INTAKE_LABELS[key]).toBeTruthy();
    }
  });
});

describe("shared answer options", () => {
  it("store FastApply's canonical values, the same ones the /profiles editor stores", async () => {
    const options = await import("./applicant-options");
    const values = await import("./profile-values");
    const valuesOf = (list: { value: string }[]) => list.map((choice) => choice.value);
    expect(valuesOf(options.NOTICE_PERIODS)).toEqual([...values.NOTICE_PERIOD_VALUES]);
    expect(valuesOf(options.WORK_ARRANGEMENTS)).toEqual([...values.REMOTE_PREFERENCE_VALUES]);
    expect(valuesOf(options.GENDERS)).toEqual([...values.GENDER_VALUES]);
    expect(valuesOf(options.ETHNICITIES)).toEqual([...values.ETHNICITY_VALUES]);
    expect(valuesOf(options.RACES)).toEqual([...values.RACE_VALUES]);
    // The long forms FastApply validates, not a bare Yes/No.
    expect(valuesOf(options.VETERAN_STATUSES)).toEqual([...values.VETERAN_STATUS_VALUES]);
    expect(valuesOf(options.DISABILITY_STATUSES)).toEqual([...values.DISABILITY_STATUS_VALUES]);
    for (const value of valuesOf(options.WORK_AUTHORIZATIONS)) expect(values.workAuthStatusFromLegacy(value)).not.toBeNull();
    const intake = readFileSync(new URL("../pages/intake.astro", import.meta.url), "utf8");
    expect(intake).toContain("{SENSITIVE_CONSENT_CHOICES.map(");
  });

  it("every self-identification list offers Prefer not to say, the one answer that needs no consent", async () => {
    const options = await import("./applicant-options");
    for (const list of [options.GENDERS, options.ETHNICITIES, options.RACES, options.VETERAN_STATUSES, options.DISABILITY_STATUSES,
      options.MARITAL_STATUSES, options.PRONOUNS, options.CRIMINAL_RECORDS, options.SEXUAL_ORIENTATIONS, options.GENDER_SAME_AS_BIRTH_SEX, options.RELIGIONS]) {
      expect(list.some((choice) => choice.value === SELF_ID_DECLINE_VALUE)).toBe(true);
    }
  });
});
