import { describe, expect, it } from "vitest";
import {
  agentProfileGateMessage,
  assertAgentProfileComplete,
  checkAgentProfileGate,
  checkJobProfileGate,
} from "./agent-profile-gate";
import { fastApplyProfilePayload } from "./fastapply-applicant";

const HAS_RESUME = true;

function completePayload(overrides: Record<string, any> = {}) {
  return {
    firstName: "Alex", middleName: "R", lastName: "Kim", email: "alex@example.com",
    phoneCountryCode: "+1", phoneNumber: "5550102040", streetAddress: "12 Mill Lane",
    currentCity: "Austin", state: "Texas", zipcode: "73301", country: "United States",
    timezone: "America/Chicago (CST)", dateOfBirth: "1992-04-08", languages: ["English"],
    headline: "Senior Backend Engineer", summary: "Ten years building payment systems.",
    yearsOfExperience: 10, skills: ["Go", "Postgres"],
    desiredSalary: "180000", desiredSalaryCurrency: "USD",
    currentSalary: "150000", currentSalaryCurrency: "USD",
    workAuthorization: "Citizen", requiresSponsorship: "No", noticePeriod: "1 month",
    remotePreference: "Remote", willingToRelocate: "No", securityClearance: "None",
    gender: "Prefer not to say", ethnicity: "Not Hispanic or Latino", race: "Asian",
    veteranStatus: "No", disabilityStatus: "Prefer not to say",
    ...overrides,
  };
}

describe("checkAgentProfileGate", () => {
  it("passes a fully answered profile with a resume", () => {
    const result = checkAgentProfileGate(completePayload(), HAS_RESUME);
    expect(result.isComplete).toBe(true);
    expect(result.incompleteSections).toEqual([]);
  });

  it("reports every section for a profile with no answers at all", () => {
    const result = checkAgentProfileGate(null, false);
    expect(result.isComplete).toBe(false);
    expect(result.incompleteSections.map((section) => section.id)).toEqual([
      "personal", "professional", "preferences", "demographics", "documents",
    ]);
  });

  it("names the specific missing field rather than the whole section", () => {
    const payload = completePayload();
    delete (payload as any).zipcode;
    const result = checkAgentProfileGate(payload, HAS_RESUME);
    expect(result.isComplete).toBe(false);
    expect(result.incompleteSections).toEqual([
      { id: "personal", label: "Personal and contact", missingFields: ["Postal code"] },
    ]);
  });

  it("treats a whitespace-only answer as missing", () => {
    const result = checkAgentProfileGate(completePayload({ firstName: "   " }), HAS_RESUME);
    expect(result.incompleteSections[0].missingFields).toEqual(["First name"]);
  });

  it("treats an empty array as missing", () => {
    const result = checkAgentProfileGate(completePayload({ skills: [] }), HAS_RESUME);
    expect(result.incompleteSections[0]).toMatchObject({ id: "professional", missingFields: ["Skills"] });
  });

  it("accepts zero years of experience", () => {
    const result = checkAgentProfileGate(completePayload({ yearsOfExperience: 0 }), HAS_RESUME);
    expect(result.isComplete).toBe(true);
  });

  it("requires the expected salary and its currency by default", () => {
    const payload = completePayload();
    delete (payload as any).desiredSalary;
    delete (payload as any).desiredSalaryCurrency;
    const result = checkAgentProfileGate(payload, HAS_RESUME);
    expect(result.incompleteSections[0].missingFields).toEqual(["Expected annual salary", "Currency"]);
  });

  it("skips the expected salary fields the form disables when salary is negotiable", () => {
    const payload = completePayload({ desiredSalaryNegotiable: true });
    delete (payload as any).desiredSalary;
    delete (payload as any).desiredSalaryCurrency;
    expect(checkAgentProfileGate(payload, HAS_RESUME).isComplete).toBe(true);
  });

  it("still requires the current salary when the expected salary is negotiable", () => {
    const payload = completePayload({ desiredSalaryNegotiable: true });
    delete (payload as any).currentSalary;
    const result = checkAgentProfileGate(payload, HAS_RESUME);
    expect(result.incompleteSections[0].missingFields).toEqual(["Current annual salary"]);
  });

  it("requires demographic answers, which 'Prefer not to say' satisfies", () => {
    const blank = checkAgentProfileGate(completePayload({ gender: "" }), HAS_RESUME);
    expect(blank.incompleteSections).toEqual([
      { id: "demographics", label: "Demographics", missingFields: ["Gender"] },
    ]);
    expect(checkAgentProfileGate(completePayload({ gender: "Prefer not to say" }), HAS_RESUME).isComplete).toBe(true);
  });

  it("blocks an otherwise complete profile that has no resume attached", () => {
    const result = checkAgentProfileGate(completePayload(), false);
    expect(result.isComplete).toBe(false);
    expect(result.incompleteSections).toEqual([
      { id: "documents", label: "Resume", missingFields: ["Default resume"] },
    ]);
  });

  it("ignores fields the automation does not need", () => {
    const payload = completePayload();
    for (const key of ["education", "experience", "certifications", "references", "coverLetter", "linkedinURL"]) {
      delete (payload as any)[key];
    }
    expect(checkAgentProfileGate(payload, HAS_RESUME).isComplete).toBe(true);
  });
});

describe("checkJobProfileGate", () => {
  const user = { id: "user-1", email: "alex@example.com" } as any;

  it("counts answers the resume supplied, not just ones typed into the form", () => {
    const jobProfile = { applicant_profile: {}, target_roles: ["Backend Engineer"] };
    const resume = { id: "r1", extracted_data: { data: completePayload({ headline: undefined }) } };
    expect(checkJobProfileGate(user, jobProfile, resume).isComplete).toBe(true);
  });

  it("lets saved profile answers fill what the resume left out", () => {
    const resume = { id: "r1", extracted_data: { data: { firstName: "Alex" } } };
    const partial = checkJobProfileGate(user, { applicant_profile: {} }, resume);
    expect(partial.isComplete).toBe(false);
    const filled = checkJobProfileGate(user, { applicant_profile: completePayload() }, resume);
    expect(filled.isComplete).toBe(true);
  });

  it("blocks when the profile has no resume to sync", () => {
    const result = checkJobProfileGate(user, { applicant_profile: completePayload() }, null);
    expect(result.incompleteSections.map((section) => section.id)).toEqual(["documents"]);
  });
});

describe("what a resume can and cannot answer", () => {
  const user = { id: "user-1", email: "alex@example.com" } as any;

  // Everything the v2 extraction schema asks the model for, all of it present.
  const richResume = {
    id: "r1",
    extracted_data: {
      version: 2, status: "complete",
      firstName: "Alex", middleName: "R", lastName: "Kim", email: "alex@example.com",
      phoneCountryCode: "+1", phoneNumber: "5550102040",
      streetAddress: "12 Mill Lane", currentCity: "Austin", state: "Texas",
      zipcode: "73301", country: "United States",
      headline: "Senior Backend Engineer", summary: "Ten years on payments.", yearsOfExperience: 10,
      skills: ["Go", "Postgres"], languages: ["English"], certifications: ["AWS SAA"],
      linkedinURL: "https://linkedin.com/in/alex", githubURL: "", website: "",
      education: [], experience: [],
      workAuthorization: "Citizen", requiresSponsorship: "No", securityClearance: "None",
      targetRoles: ["Backend Engineer"], preferredLocations: ["Remote"], desiredSalary: "180000",
    },
  };

  it("leaves only the answers no resume contains", () => {
    // job_profiles has salary_min but no salary_currency or work_mode column, so the
    // currency and work-arrangement fallbacks in fastApplyProfilePayload never fire.
    const jobProfile = { applicant_profile: {}, salary_min: 180000 };
    const result = checkJobProfileGate(user, jobProfile, richResume);
    expect(result.incompleteSections).toEqual([
      { id: "personal", label: "Personal and contact", missingFields: ["Timezone", "Date of birth"] },
      {
        id: "preferences", label: "Work preferences and eligibility",
        missingFields: ["Currency", "Current annual salary", "Current salary currency", "Notice period", "Work arrangement", "Willing to relocate"],
      },
      {
        id: "demographics", label: "Demographics",
        missingFields: ["Gender", "Ethnicity", "Race", "Veteran status", "Disability status"],
      },
    ]);
  });

  it("recovers the fields the v1 shape used to drop on the floor", () => {
    const legacyResume = {
      id: "r1",
      extracted_data: {
        version: 1, status: "complete",
        contact: { name: "Alex Kim", email: "alex@example.com", phone: "5550102040", location: "Austin, TX" },
        headline: "Senior Backend Engineer", summary: "Payments.", skills: ["Go"],
        work_authorization: "Citizen", sponsorship_required: false,
      },
    };
    const payload = fastApplyProfilePayload(user, { applicant_profile: {} }, legacyResume);
    // Both were extracted under v1 but never reached the application service.
    expect(payload.workAuthorization).toBe("Citizen");
    expect(payload.requiresSponsorship).toBe("No");
  });
});

describe("assertAgentProfileComplete", () => {
  it("does nothing for a complete profile", () => {
    expect(() => assertAgentProfileComplete(checkAgentProfileGate(completePayload(), HAS_RESUME))).not.toThrow();
  });

  it("throws a 400 Response naming the incomplete sections", async () => {
    const result = checkAgentProfileGate(completePayload({ zipcode: "", gender: "" }), false);
    let thrown: unknown;
    try {
      assertAgentProfileComplete(result, "profile-1");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Response);
    const response = thrown as Response;
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("profile_incomplete");
    expect(body.jobProfileId).toBe("profile-1");
    expect(body.error).toContain("Personal and contact");
    expect(body.error).toContain("Resume");
    expect(body.sections).toEqual(result.incompleteSections);
  });

  it("summarises sections, not every field, in the message", () => {
    const message = agentProfileGateMessage(checkAgentProfileGate(null, false));
    expect(message).toBe(
      "Complete this job profile before activating Scout AI — missing: Personal and contact, Professional profile, Work preferences and eligibility, Demographics, Resume.",
    );
  });
});
