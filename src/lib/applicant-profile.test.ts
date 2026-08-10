import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APPLICANT_KEYS, applicantPrefill, isApplicantKey } from "./applicant-profile";

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
      phoneCountryCode: "+1", phoneNumber: "5550102040",
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
    for (const key of ["timezone", "dateOfBirth", "noticePeriod", "gender", "race", "veteranStatus"]) {
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
  });

  // A control the key list does not know about is silently dropped by the profiles API,
  // and a key with no control can never be answered. Both have shipped before.
  it("covers every control the applicant editor renders", () => {
    const markup = readFileSync(new URL("../components/ApplicantProfileFields.astro", import.meta.url), "utf8");
    const rendered = [...markup.matchAll(/data-applicant-key="([^"]+)"/g)].map((match) => match[1]);
    // Hidden inputs that serialize the dynamic sections into the keys below them.
    const serializers: Record<string, string> = {
      educationJson: "education", experienceJson: "experience",
      referencesText: "references", additionalLinksText: "additionalLinks",
    };
    const answered = new Set(rendered.map((key) => serializers[key] ?? key));
    expect(rendered.length).toBeGreaterThan(0);
    for (const key of answered) expect(isApplicantKey(key)).toBe(true);
    for (const key of APPLICANT_KEYS) expect(answered.has(key)).toBe(true);
  });
});
