import { describe, expect, it } from "vitest";
import { APPLICANT_KEYS, applicantPrefill, cleanApplicantProfile, isApplicantKey } from "./applicant-profile";
import { draftFromProfile, profileFromDraft } from "../components/profile/draft";

const user = { id: "user-1", email: "alex@example.com" } as any;

const resume = {
  id: "r1",
  extracted_data: {
    version: 2, status: "complete",
    firstName: "Alex", middleName: "", lastName: "Kim", email: "alex@example.com",
    phoneCountryCode: "+1", phoneNumber: "5550102040",
    streetAddress: "12 Mill Lane", currentCity: "Austin", state: "Texas",
    zipcode: "73301", country: "United States",
    headline: "Senior Backend Engineer", summary: "Payments.", yearsOfExperience: 10,
    skills: ["Go"], languages: ["English"], certifications: ["AWS SAA"],
    linkedinURL: "https://linkedin.com/in/alex", githubURL: "", website: "",
    education: [{ school: "UT Austin", degree: "Bachelor's Degree", major: "CS", gpa: "", startDate: "", endDate: "2014", location: "" }],
    experience: [{ title: "Staff Engineer", company: "Northstar", location: "Remote", startDate: "2021", endDate: "", description: "Payments." }],
    workAuthorization: "Citizen", requiresSponsorship: "No", securityClearance: "",
    targetRoles: ["Backend Engineer"], preferredLocations: ["Remote"], desiredSalary: "180000",
  },
};

describe("applicantPrefill", () => {
  const prefill = applicantPrefill(user, {}, resume);

  it("returns the answers the resume covered, keyed as the editor's controls", () => {
    expect(prefill).toMatchObject({
      firstName: "Alex", lastName: "Kim", email: "alex@example.com",
      // FastApply's ISO id: "+1" alone cannot tell the United States from Canada.
      phoneCountryCode: "US", phoneNumber: "5550102040",
      streetAddress: "12 Mill Lane", currentCity: "Austin", state: "Texas",
      zipcode: "73301", country: "United States",
      headline: "Senior Backend Engineer", yearsOfExperience: 10,
      workAuthorization: "Citizen", requiresSponsorship: "No", desiredSalary: "180000",
    });
  });

  it("emits only keys the editor and the profiles API accept", () => {
    for (const key of Object.keys(prefill)) expect(isApplicantKey(key)).toBe(true);
    // `name` is built for the application service but is not one of the editor's fields.
    expect(prefill).not.toHaveProperty("name");
  });

  it("carries the structured sections through in the editor's own sub-field names", () => {
    expect(prefill.education[0]).toMatchObject({ school: "UT Austin", major: "CS" });
    expect(prefill.experience[0]).toMatchObject({ title: "Staff Engineer", company: "Northstar" });
  });

  it("omits answers no resume supplies, leaving them for the member", () => {
    for (const key of ["timezone", "dateOfBirth", "noticePeriod", "sensitiveDataConsent", "gender", "race", "veteranStatus"]) {
      expect(prefill).not.toHaveProperty(key);
    }
  });

  it("falls back to the account email when the resume has none", () => {
    const anonymous = { id: "r2", extracted_data: { version: 2, status: "complete", firstName: "Alex" } };
    expect(applicantPrefill(user, {}, anonymous).email).toBe("alex@example.com");
  });

  it("lets a job profile's own columns contribute", () => {
    const bare = { id: "r3", extracted_data: { version: 2, status: "complete" } };
    const withProfile = applicantPrefill(user, { target_roles: ["Product Lead"], salary_min: 140000 }, bare);
    expect(withProfile.headline).toBe("Product Lead");
    expect(withProfile.desiredSalary).toBe("140000");
  });

  it("returns nothing usable for a resume that failed extraction", () => {
    const failed = { id: "r4", extracted_data: { version: 1, status: "failed" } };
    const result = applicantPrefill(user, {}, failed);
    expect(result.firstName).toBeUndefined();
    expect(result.email).toBe("alex@example.com");
  });
});

describe("APPLICANT_KEYS", () => {
  it("has no duplicates", () => {
    expect(new Set(APPLICANT_KEYS).size).toBe(APPLICANT_KEYS.length);
  });

  it("rejects keys outside the editor", () => {
    expect(isApplicantKey("resume_id")).toBe(false);
    expect(isApplicantKey("applicant_profile")).toBe(false);
    // The consent stamp is the server's to set, never a form field.
    expect(isApplicantKey("sensitiveDataConsentAt")).toBe(false);
  });

  // A key the editor cannot hold is silently dropped on the next save, and one the profiles API
  // does not know is never stored. Both have shipped before.
  it("every stored answer survives a round trip through the editor and the profiles API", () => {
    const stored = cleanApplicantProfile(FULL_PROFILE);
    const roundTrip = cleanApplicantProfile(profileFromDraft(draftFromProfile(stored)));
    expect(roundTrip).toEqual(stored);
    // A negotiable expected salary is not stored as a number; every other key is.
    for (const key of APPLICANT_KEYS.filter((key) => key !== "desiredSalary")) expect(stored).toHaveProperty(key);
    expect(stored).not.toHaveProperty("desiredSalary");
    for (const key of Object.keys(profileFromDraft(draftFromProfile(stored)))) expect(isApplicantKey(key)).toBe(true);
  });
});

/** One answer for every key the profiles API stores, in the shapes the editor writes. */
const FULL_PROFILE = {
  firstName: "Alex", middleName: "R", lastName: "Kim", email: "alex@example.com", phoneCountryCode: "CA", phoneNumber: "4165550123",
  streetAddress: "1 King St W", currentCity: "Toronto", state: "Ontario", zipcode: "M5H 1A1", country: "Canada",
  timezone: "America/New_York (EST)", dateOfBirth: "1990-02-14", citizenships: ["Canada", "Ireland"], nationality: "Canada",
  languages: ["English", "French"], languageProficiencies: [{ language: "English", level: "Native or bilingual" }, { language: "French", level: "Limited working" }],
  headline: "Payments engineer", summary: "Builds ledgers.", yearsOfExperience: 9, skills: ["Go"], certifications: ["CKA"], coverLetter: "Hello.",
  experience: [{ title: "Staff Engineer", company: "Northstar", location: "Remote", startDate: "March 2021", endDate: "Present", description: "Ledgers." }],
  education: [{ school: "UofT", degree: "Bachelor's Degree", major: "CS", gpa: "3.7", startDate: "2008", endDate: "2012", location: "Toronto" }],
  projects: [{ name: "Ledger", description: "Double-entry engine.", url: "https://example.com" }],
  desiredSalary: "180000", desiredSalaryCurrency: "CAD", desiredSalaryNegotiable: true, currentSalary: "150000", currentSalaryCurrency: "CAD",
  workAuthorizations: [
    { country: "Canada", status: "citizen", visaType: null, expiresAt: null, needsSponsorship: false },
    { country: "United States", status: "work_visa", visaType: "TN", expiresAt: "2027-01-31", needsSponsorship: true },
  ],
  workAuthorization: "Citizen", requiresSponsorship: "No",
  securityClearance: "Secret", securityClearanceCountry: "Canada", noticePeriod: "1 month", remotePreference: "Hybrid", willingToRelocate: "Yes",
  willingToTravel: "Up to 50%", driversLicense: "Yes", backgroundCheckConsent: "Yes", drugTestConsent: "No",
  linkedinURL: "https://linkedin.com/in/alex", githubURL: "https://github.com/alex", website: "https://alex.dev", twitterURL: "https://x.com/alex",
  additionalLinks: { Dribbble: "https://dribbble.com/alex" }, references: [{ name: "Jane", email: "jane@x.co", phone: "+1 555", type: "Work" }],
  howDidYouHearAboutUs: "LinkedIn", sensitiveDataConsent: "granted",
  gender: "Male", ethnicity: "Not Hispanic or Latino", race: "Asian", veteranStatus: "No, I am not a protected veteran",
  disabilityStatus: "Prefer not to say", maritalStatus: "Married", pronouns: "He/Him", criminalRecord: "No",
  sexualOrientation: "Gay", genderSameAsBirthSex: "Yes", religion: "No religion",
};
