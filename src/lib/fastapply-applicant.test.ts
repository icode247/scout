import { describe, expect, it } from "vitest";
import { canonicalSecurityClearance, fastApplyProfilePayload, isoDateOfBirth, wholeYearsOfExperience } from "./fastapply-applicant";
import { SELF_ID_DECLINE_VALUE, SENSITIVE_SELF_ID_FIELDS } from "./privacy";

const user = { id: "user-1", email: "alex@example.com" } as any;

/**
 * Every key FastApply's applicant-profile API accepts (its CreateJobProfileDto on 2026-10-10,
 * which `PUT /api/v1/applicants/:id/profile` validates with unknown keys rejected). A key that
 * is not in this set is a 400 for the whole save, so the payload may only ever emit these.
 */
const FASTAPPLY_PROFILE_KEYS = new Set([
  "name", "firstName", "middleName", "lastName", "email", "phoneCountryCode", "phoneNumber", "streetAddress",
  "currentCity", "state", "zipcode", "country", "timezone", "coverLetter", "linkedinURL", "githubURL", "website",
  "twitterURL", "headline", "summary", "yearsOfExperience", "desiredSalary", "desiredSalaryCurrency",
  "desiredSalaryNegotiable", "currentSalary", "currentSalaryCurrency", "noticePeriod", "remotePreference",
  "willingToRelocate", "sensitiveDataConsent", "gender", "genderSameAsBirthSex", "sexualOrientation", "maritalStatus",
  "dateOfBirth", "workAuthorization", "workAuthorizations", "nationality", "citizenships", "requiresSponsorship",
  "disabilityStatus", "veteranStatus", "race", "ethnicity", "religion", "securityClearance", "securityClearanceCountry",
  "languageProficiencies", "pronouns", "criminalRecord", "backgroundCheckConsent", "drugTestConsent", "willingToTravel",
  "driversLicense", "howDidYouHearAboutUs", "skills", "education", "experience", "projects", "references",
  "certifications", "languages", "isDefault", "additionalLinks",
]);

const selfId = {
  gender: "Male", ethnicity: "Not Hispanic or Latino", race: "Asian", veteranStatus: "No", disabilityStatus: "Yes",
  maritalStatus: "Married", pronouns: "He/Him", criminalRecord: "No", sexualOrientation: "Gay",
  genderSameAsBirthSex: "Yes", religion: "Muslim",
};

/** Everything the /profiles editor can save, consent decided as given. */
function savedProfile(sensitiveDataConsent: unknown, extra: Record<string, any> = {}) {
  return {
    target_roles: ["Backend Engineer"], salary_min: 180000,
    applicant_profile: {
      firstName: "Alex", lastName: "Kim", email: "alex@example.com", phoneCountryCode: "+1", phoneNumber: "5550102040",
      streetAddress: "12 Mill Lane", currentCity: "Austin", state: "Texas", zipcode: "73301", country: "United States",
      nationality: "United States", timezone: "America/Chicago (CST)", dateOfBirth: "1992-04-08",
      headline: "Senior Backend Engineer", summary: "Payments.", yearsOfExperience: 10, skills: ["Go"], languages: ["English"],
      desiredSalaryCurrency: "USD", currentSalary: "150000", currentSalaryCurrency: "USD", noticePeriod: "1 month",
      remotePreference: "Remote", willingToRelocate: "No", securityClearance: "None", workAuthorization: "Citizen",
      requiresSponsorship: "No", howDidYouHearAboutUs: "LinkedIn",
      ...selfId,
      sensitiveDataConsent, sensitiveDataConsentAt: "2026-10-10T00:00:00.000Z",
      ...extra,
    },
  };
}
const resume = { id: "r1", extracted_data: { version: 2, status: "complete", firstName: "Alex" } };

describe("fastApplyProfilePayload — self-identification consent", () => {
  it("granted: sends the answers, with the consent, in FastApply's spellings", () => {
    const payload = fastApplyProfilePayload(user, savedProfile("granted"), resume);
    expect(payload).toMatchObject({
      ...selfId, sensitiveDataConsent: "granted",
      // Stored as a bare Yes/No by the old editor; FastApply validates the long forms.
      veteranStatus: "No, I am not a protected veteran", disabilityStatus: "Yes, I have a disability",
    });
  });

  it("declined: sends the consent and Prefer not to say for all eleven, including ones the member never saw", () => {
    const payload = fastApplyProfilePayload(user, savedProfile("declined", { religion: undefined }), resume);
    expect(payload.sensitiveDataConsent).toBe("declined");
    for (const key of SENSITIVE_SELF_ID_FIELDS) expect(payload[key]).toBe(SELF_ID_DECLINE_VALUE);
  });

  it("not asked yet: sends neither the consent nor any answer, so FastApply keeps what it already holds instead of refusing the save", () => {
    for (const consent of [undefined, "", null, "yes"]) {
      const payload = fastApplyProfilePayload(user, savedProfile(consent), resume);
      expect(payload).not.toHaveProperty("sensitiveDataConsent");
      for (const key of SENSITIVE_SELF_ID_FIELDS) expect(payload).not.toHaveProperty(key);
      expect(payload.firstName).toBe("Alex");
    }
  });

  it("never forwards Scout's own consent stamp (FastApply refuses it)", () => {
    for (const consent of ["granted", "declined", undefined]) {
      expect(fastApplyProfilePayload(user, savedProfile(consent), resume)).not.toHaveProperty("sensitiveDataConsentAt");
    }
  });

  it("takes self-identification answers only from the member, never from a resume", () => {
    const leaky = { id: "r2", extracted_data: { version: 2, status: "complete", firstName: "Alex", gender: "Male", race: "Asian", veteranStatus: "Yes" } };
    const payload = fastApplyProfilePayload(user, { applicant_profile: { sensitiveDataConsent: "granted" } }, leaky);
    expect(payload.sensitiveDataConsent).toBe("granted");
    for (const key of ["gender", "race", "veteranStatus"]) expect(payload).not.toHaveProperty(key);
  });

  it("emits only keys the FastApply applicant-profile API accepts, whatever the decision", () => {
    for (const consent of ["granted", "declined", undefined]) {
      const payload = fastApplyProfilePayload(user, savedProfile(consent, { whatsappPhone: "+1555", addressLine2: "Flat 2" }), resume);
      const unknown = Object.keys(payload).filter((key) => !FASTAPPLY_PROFILE_KEYS.has(key));
      expect(unknown).toEqual([]);
    }
  });

  it("forwards the nationality the member gave", () => {
    expect(fastApplyProfilePayload(user, savedProfile("granted"), resume).nationality).toBe("United States");
  });
});

describe("fastApplyProfilePayload — values FastApply validates strictly", () => {
  it("rounds years of experience to whole years and drops nonsense", () => {
    expect(wholeYearsOfExperience(2.6)).toBe(3);
    expect(wholeYearsOfExperience("7")).toBe(7);
    expect(wholeYearsOfExperience(0)).toBe(0);
    expect(wholeYearsOfExperience(120)).toBe(80);
    for (const bad of [-1, "lots", "", null, undefined]) expect(wholeYearsOfExperience(bad)).toBeUndefined();
    expect(fastApplyProfilePayload(user, savedProfile("granted", { yearsOfExperience: 2.5 }), resume).yearsOfExperience).toBe(3);
  });

  it("sends a date of birth only as a real ISO date for an age between 16 and 90", () => {
    const today = new Date("2026-10-10T12:00:00Z");
    expect(isoDateOfBirth("1992-04-08", today)).toBe("1992-04-08");
    expect(isoDateOfBirth("2010-10-10", today)).toBe("2010-10-10"); // sixteenth birthday today
    expect(isoDateOfBirth("2010-10-11", today)).toBeUndefined(); // sixteen tomorrow
    expect(isoDateOfBirth("1936-10-10", today)).toBe("1936-10-10"); // ninety today, still inside the bound
    expect(isoDateOfBirth("1935-10-10", today)).toBeUndefined(); // ninety-one
    for (const bad of ["04/08/1992", "1992-02-30", "+275000-01-01", "1992-4-8", "", null]) expect(isoDateOfBirth(bad, today)).toBeUndefined();
    expect(fastApplyProfilePayload(user, savedProfile("granted", { dateOfBirth: "04/08/1992" }), resume)).not.toHaveProperty("dateOfBirth");
  });

  it("sends a security clearance only as one of FastApply's levels, folding the spellings it knows", () => {
    expect(canonicalSecurityClearance("None")).toBe("None");
    expect(canonicalSecurityClearance("secret")).toBe("Secret");
    expect(canonicalSecurityClearance("TS/SCI")).toBe("Top Secret / SCI");
    expect(canonicalSecurityClearance("N/A")).toBe("None");
    expect(canonicalSecurityClearance("no")).toBe("None");
    expect(canonicalSecurityClearance("yes")).toBe("Active clearance (level not specified)");
    for (const bad of ["Level 4 (DV)", "", null, 3]) expect(canonicalSecurityClearance(bad)).toBeUndefined();
    const payload = fastApplyProfilePayload(user, savedProfile("granted", { securityClearance: "Level 4 (DV)" }), resume);
    expect(payload).not.toHaveProperty("securityClearance");
  });
});

describe("fastApplyProfilePayload — the screening facts FastApply asks for", () => {
  const base = { firstName: "Alex", lastName: "Kim", country: "United States" };
  const payloadFor = (saved: Record<string, any>) => fastApplyProfilePayload(user, { applicant_profile: { ...base, ...saved } }, null);

  it("sends a complete per-country list and lets FastApply derive the old single answer", () => {
    const list = [{ country: "United States", status: "work_visa", visaType: "H-1B", expiresAt: "2027-05-01", needsSponsorship: true }];
    const payload = payloadFor({ workAuthorizations: list, workAuthorization: "Citizen", requiresSponsorship: "No" });
    expect(payload.workAuthorizations).toEqual(list);
    expect(payload).not.toHaveProperty("workAuthorization");
    expect(payload).not.toHaveProperty("requiresSponsorship");
    expect(payloadFor({ workAuthorizations: [] }).workAuthorizations).toEqual([]);
  });

  it("holds back a list with an unanswered sponsorship question and keeps the old answer meanwhile", () => {
    const payload = payloadFor({
      workAuthorizations: [{ country: "Canada", status: "work_visa", visaType: null, expiresAt: null, needsSponsorship: null }],
      workAuthorization: "Work Visa / Work Permit", requiresSponsorship: "Yes",
    });
    expect(payload).not.toHaveProperty("workAuthorizations");
    expect(payload).toMatchObject({ workAuthorization: "Work Visa / Work Permit", requiresSponsorship: "Yes" });
  });

  it("sends citizenships with the first as nationality, and language levels with the names", () => {
    const payload = payloadFor({ citizenships: ["Kenya", "UK"], languageProficiencies: [{ language: "Swahili", level: "Native or bilingual" }, { language: "English", level: null }] });
    expect(payload.citizenships).toEqual(["Kenya", "United Kingdom"]);
    expect(payload.nationality).toBe("Kenya");
    expect(payload.languages).toEqual(["Swahili", "English"]);
    expect(payload.languageProficiencies).toEqual([{ language: "Swahili", level: "Native or bilingual" }, { language: "English", level: null }]);
  });

  it("sends where a clearance was issued only when one is held", () => {
    expect(payloadFor({ securityClearance: "Secret", securityClearanceCountry: "USA" }).securityClearanceCountry).toBe("United States");
    expect(payloadFor({ securityClearance: "None", securityClearanceCountry: "USA" })).not.toHaveProperty("securityClearanceCountry");
  });

  it("sends the yes/no and travel answers only in FastApply's spellings", () => {
    const payload = payloadFor({ driversLicense: "yes", backgroundCheckConsent: true, drugTestConsent: "No", willingToTravel: "Up to 50%", noticePeriod: "two weeks", remotePreference: "onsite" });
    expect(payload).toMatchObject({ driversLicense: "Yes", backgroundCheckConsent: "Yes", drugTestConsent: "No", willingToTravel: "Up to 50%", noticePeriod: "2 weeks", remotePreference: "On-site" });
    expect(payloadFor({ willingToTravel: "sometimes", driversLicense: "maybe" })).not.toHaveProperty("willingToTravel");
  });

  it("sends the phone country as FastApply's ISO id", () => {
    expect(payloadFor({ phoneCountryCode: "+1", country: "Canada" }).phoneCountryCode).toBe("CA");
    expect(payloadFor({ phoneCountryCode: "NG" }).phoneCountryCode).toBe("NG");
  });
});
