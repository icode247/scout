import { describe, expect, it } from "vitest";
import { fastApplyProfilePayload, hasCompleteEducation, hasCompleteExperience, withFastApplyBlanks } from "./applicant-payload";
import { SELF_ID_DECLINE_VALUE, SENSITIVE_SELF_ID_FIELDS } from "./privacy";

const user = { id: "u1", email: "ada@example.com" } as any;

describe("fastApplyProfilePayload", () => {
  it("never sends a salary the member said is negotiable, from any source", () => {
    const resume = { extracted_data: { version: 2, status: "complete", desiredSalary: "90000" } };
    const negotiable = fastApplyProfilePayload(user, { applicant_profile: { desiredSalaryNegotiable: true }, salary_min: 120000 }, resume);
    expect(negotiable.desiredSalary).toBeUndefined();
    expect(negotiable.desiredSalaryNegotiable).toBe(true);
    const stated = fastApplyProfilePayload(user, { applicant_profile: {}, salary_min: 120000 }, resume);
    expect(stated.desiredSalary).toBe("120000");
    expect(stated.desiredSalaryNegotiable).toBeUndefined();
  });

  it("sends a link only to the field of its own network, as https", () => {
    const payload = fastApplyProfilePayload(user, { applicant_profile: {
      linkedinURL: "linkedin.com/in/ada", githubURL: "https://www.linkedin.com/in/ada", website: "N/A", twitterURL: "x.com/ada",
    } }, null);
    expect(payload).toMatchObject({ linkedinURL: "https://linkedin.com/in/ada", twitterURL: "https://x.com/ada" });
    expect(payload.githubURL).toBeUndefined();
    expect(payload.website).toBeUndefined();
  });

  it("does not send Scout's own 'how did you hear about us' answer (FastApply's acquisition field)", () => {
    expect(fastApplyProfilePayload(user, { applicant_profile: { howDidYouHearAboutUs: "LinkedIn" } }, null).howDidYouHearAboutUs).toBeUndefined();
  });

  it("folds older spellings instead of dropping them", () => {
    const payload = fastApplyProfilePayload(user, { applicant_profile: { workAuthorization: "US Citizen", requiresSponsorship: "false", willingToTravel: "no" } }, null);
    expect(payload).toMatchObject({ workAuthorization: "Citizen", requiresSponsorship: "No", willingToTravel: "No" });
  });
});

describe("withFastApplyBlanks (FastApply merges what it is sent)", () => {
  it("sends a blank for every answer Scout owns and the member does not have", () => {
    const out = withFastApplyBlanks({ firstName: "Ada" });
    expect(out).toMatchObject({
      firstName: "Ada", middleName: "", phoneNumber: "", country: "", dateOfBirth: null, yearsOfExperience: null,
      citizenships: [], workAuthorizations: null, workAuthorization: "", requiresSponsorship: "", desiredSalary: "",
      desiredSalaryNegotiable: false, securityClearanceCountry: "", linkedinURL: "", willingToTravel: "",
    });
  });

  it("never blanks names, email, the consent decision, or a field FastApply derives from its partner", () => {
    const out = withFastApplyBlanks({});
    for (const key of ["firstName", "lastName", "email", "sensitiveDataConsent", "nationality", "languageProficiencies", "howDidYouHearAboutUs"]) {
      expect(out).not.toHaveProperty(key);
    }
  });

  it("keeps every answer that is there, and does not change the payload it was given", () => {
    const payload = { middleName: "R", skills: ["Go"], experience: [] };
    const out = withFastApplyBlanks(payload);
    expect(out).toMatchObject(payload);
    expect(payload).toEqual({ middleName: "R", skills: ["Go"], experience: [] });
  });

  it("leaves the summary pair to FastApply when the per-country list is sent", () => {
    const out = withFastApplyBlanks({ workAuthorizations: [] });
    expect(out).not.toHaveProperty("workAuthorization");
    expect(out).not.toHaveProperty("requiresSponsorship");
  });

  it("blanks self-identification answers only under 'granted'", () => {
    const granted = withFastApplyBlanks({ sensitiveDataConsent: "granted", gender: "Female" });
    expect(granted.gender).toBe("Female");
    for (const key of SENSITIVE_SELF_ID_FIELDS.filter((field) => field !== "gender")) expect(granted[key]).toBe("");
    const undecided = withFastApplyBlanks({});
    for (const key of SENSITIVE_SELF_ID_FIELDS) expect(undecided).not.toHaveProperty(key);
    const declined = withFastApplyBlanks(Object.fromEntries([["sensitiveDataConsent", "declined"], ...SENSITIVE_SELF_ID_FIELDS.map((key) => [key, SELF_ID_DECLINE_VALUE])]));
    for (const key of SENSITIVE_SELF_ID_FIELDS) expect(declined[key]).toBe(SELF_ID_DECLINE_VALUE);
  });
});

describe("work history FastApply's runner requires", () => {
  it("needs a job with title, company, start date and description", () => {
    expect(hasCompleteExperience([{ title: "Engineer", company: "A", startDate: "2020-01", description: "B" }])).toBe(true);
    expect(hasCompleteExperience([{ position: "Engineer", company: "A", startDate: "2020-01", description: "B" }])).toBe(true);
    expect(hasCompleteExperience([{ title: "Engineer", company: "A", startDate: "2020-01", description: " " }])).toBe(false);
    expect(hasCompleteExperience(undefined)).toBe(false);
    expect(hasCompleteExperience([null, "x"])).toBe(false);
  });

  it("needs an education entry with a degree and a school", () => {
    expect(hasCompleteEducation([{ degree: "BSc", school: "MIT" }])).toBe(true);
    expect(hasCompleteEducation([{ degree: "BSc", institution: "MIT" }])).toBe(true);
    expect(hasCompleteEducation([{ school: "MIT" }])).toBe(false);
  });
});
