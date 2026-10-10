import { describe, expect, it } from "vitest";
import {
  agentProfileGateMessage,
  assertAgentProfileComplete,
  checkAgentProfileGate,
  checkJobProfileGate,
  gateLabel,
  languageLevelsComplete,
} from "./agent-profile-gate";
import { fastApplyProfilePayload } from "./fastapply-applicant";

const HAS_RESUME = true;

/** A payload with every answer FastApply's First Apply gate asks for (consent granted). */
function completePayload(overrides: Record<string, any> = {}) {
  return {
    firstName: "Alex", middleName: "R", lastName: "Kim", email: "alex@example.com",
    phoneCountryCode: "US", phoneNumber: "5550102040", streetAddress: "12 Mill Lane",
    currentCity: "Austin", state: "Texas", zipcode: "73301", country: "United States",
    timezone: "America/Chicago (CST)", dateOfBirth: "1992-04-08",
    languages: ["English"], languageProficiencies: [{ language: "English", level: "Native or bilingual" }],
    headline: "Senior Backend Engineer", summary: "Ten years building payment systems.",
    yearsOfExperience: 10, skills: ["Go", "Postgres"],
    experience: [{ title: "Backend Engineer", company: "Paylane", location: "Austin", startDate: "2016-03", endDate: "Present", description: "Payment APIs." }],
    education: [{ school: "UT Austin", degree: "BSc Computer Science", major: "", startDate: "2010-09", endDate: "2014-05", location: "Austin" }],
    desiredSalary: "180000", desiredSalaryCurrency: "USD",
    currentSalary: "150000", currentSalaryCurrency: "USD",
    citizenships: ["United States"],
    workAuthorizations: [{ country: "United States", status: "citizen", visaType: null, expiresAt: null, needsSponsorship: false }],
    securityClearance: "None", noticePeriod: "1 month", remotePreference: "Remote", willingToRelocate: "No",
    willingToTravel: "Up to 25%", driversLicense: "Yes", backgroundCheckConsent: "Yes", drugTestConsent: "Yes",
    sensitiveDataConsent: "granted",
    gender: "Prefer not to say", genderSameAsBirthSex: "Yes", sexualOrientation: "Prefer not to say", pronouns: "He/Him",
    ethnicity: "Not Hispanic or Latino", race: "Asian", religion: "No religion",
    veteranStatus: "No, I am not a protected veteran", disabilityStatus: "Prefer not to say", criminalRecord: "No",
    ...overrides,
  };
}

const without = (payload: Record<string, any>, ...keys: string[]) => {
  const copy = { ...payload };
  for (const key of keys) delete copy[key];
  return copy;
};

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
      "personal", "professional", "history", "preferences", "demographics", "documents",
    ]);
  });

  it("names the specific missing field and its key", () => {
    const result = checkAgentProfileGate(without(completePayload(), "zipcode"), HAS_RESUME);
    expect(result.incompleteSections).toEqual([
      { id: "personal", label: "Personal and contact", missingFields: ["Postal code"], missingKeys: ["zipcode"] },
    ]);
  });

  it("treats a whitespace-only answer and an empty list as missing", () => {
    expect(checkAgentProfileGate(completePayload({ firstName: "   " }), HAS_RESUME).incompleteSections[0].missingKeys).toEqual(["firstName"]);
    expect(checkAgentProfileGate(completePayload({ skills: [] }), HAS_RESUME).incompleteSections[0]).toMatchObject({ id: "professional", missingKeys: ["skills"] });
  });

  it("accepts zero years of experience", () => {
    expect(checkAgentProfileGate(completePayload({ yearsOfExperience: 0 }), HAS_RESUME).isComplete).toBe(true);
  });

  it("requires the expected salary and its currency unless it is negotiable, and the current salary always", () => {
    const noSalary = without(completePayload(), "desiredSalary", "desiredSalaryCurrency");
    expect(checkAgentProfileGate(noSalary, HAS_RESUME).incompleteSections[0].missingFields).toEqual(["Expected annual salary", "Expected salary currency"]);
    expect(checkAgentProfileGate({ ...noSalary, desiredSalaryNegotiable: true }, HAS_RESUME).isComplete).toBe(true);
    const noCurrent = without(completePayload({ desiredSalaryNegotiable: true }), "currentSalary");
    expect(checkAgentProfileGate(noCurrent, HAS_RESUME).incompleteSections[0].missingFields).toEqual(["Current annual salary"]);
  });

  it("asks for work authorization by country, where an explicit 'nowhere' is an answer", () => {
    const unset = checkAgentProfileGate(without(completePayload(), "workAuthorizations"), HAS_RESUME);
    expect(unset.incompleteSections[0]).toMatchObject({ id: "preferences", missingFields: ["Work authorization by country"] });
    expect(checkAgentProfileGate(completePayload({ workAuthorizations: [] }), HAS_RESUME).isComplete).toBe(true);
  });

  it("asks where a held clearance was issued, and not when there is none", () => {
    const held = checkAgentProfileGate(completePayload({ securityClearance: "Secret" }), HAS_RESUME);
    expect(held.incompleteSections[0].missingKeys).toEqual(["securityClearanceCountry"]);
    expect(checkAgentProfileGate(completePayload({ securityClearance: "Secret", securityClearanceCountry: "United States" }), HAS_RESUME).isComplete).toBe(true);
  });

  it("needs a level for every language", () => {
    const result = checkAgentProfileGate(completePayload({ languages: ["English", "Spanish"] }), HAS_RESUME);
    expect(result.incompleteSections[0].missingFields).toEqual(["Language levels"]);
    expect(languageLevelsComplete({ languages: [], languageProficiencies: [] })).toBe(true);
    expect(languageLevelsComplete({ languageProficiencies: [{ language: "English", level: null }] })).toBe(false);
  });

  it("asks the screening questions FastApply's gate asks", () => {
    const result = checkAgentProfileGate(without(completePayload(), "willingToTravel", "driversLicense", "backgroundCheckConsent", "drugTestConsent"), HAS_RESUME);
    expect(result.incompleteSections[0].missingFields).toEqual(["Willing to travel", "Driver's licence", "Background check", "Drug test"]);
  });

  it("requires self-identification answers once consent is granted, which 'Prefer not to say' satisfies", () => {
    const blank = checkAgentProfileGate(completePayload({ gender: "" }), HAS_RESUME);
    expect(blank.incompleteSections).toEqual([
      { id: "demographics", label: "Self-identification", missingFields: ["Gender"], missingKeys: ["gender"] },
    ]);
  });

  it("asks for the self-identification choice first, and for no answers until it is made", () => {
    const payload = without(completePayload(), "sensitiveDataConsent", "gender", "genderSameAsBirthSex", "sexualOrientation", "pronouns", "ethnicity", "race", "religion", "veteranStatus", "disabilityStatus", "criminalRecord");
    expect(checkAgentProfileGate(payload, HAS_RESUME).incompleteSections).toEqual([
      { id: "demographics", label: "Self-identification", missingFields: ["Self-identification answers"], missingKeys: ["sensitiveDataConsent"] },
    ]);
    expect(checkAgentProfileGate({ ...payload, sensitiveDataConsent: "yes" }, HAS_RESUME).isComplete).toBe(false);
    expect(checkAgentProfileGate({ ...payload, sensitiveDataConsent: "declined" }, HAS_RESUME).isComplete).toBe(true);
  });

  it("does not require a middle name, and ignores fields the automation does not need", () => {
    const payload = without(completePayload(), "middleName", "projects", "certifications", "references", "coverLetter", "linkedinURL");
    expect(checkAgentProfileGate(payload, HAS_RESUME).isComplete).toBe(true);
  });

  // FastApply's runner skips every apply for an applicant without these (INCOMPLETE_PROFILE).
  it("needs one complete job and one complete education entry, as FastApply's runner does", () => {
    const history = (payload: Record<string, any>) => checkAgentProfileGate(payload, HAS_RESUME).incompleteSections.find((section) => section.id === "history");
    expect(history(without(completePayload(), "experience", "education"))).toEqual({
      id: "history", label: "Experience and education",
      missingFields: ["A job with title, company, start date and description", "An education entry with school and degree"],
      missingKeys: ["experience", "education"],
    });
    const job = completePayload().experience[0];
    expect(history(completePayload({ experience: [{ ...job, description: "" }] }))?.missingKeys).toEqual(["experience"]);
    expect(history(completePayload({ experience: [{ ...job, startDate: "" }] }))?.missingKeys).toEqual(["experience"]);
    // One complete entry is enough, beside incomplete ones.
    expect(history(completePayload({ experience: [{ title: "Intern" }, job] }))).toBeUndefined();
    // The older field names FastApply still reads.
    expect(history(completePayload({ experience: [{ position: "Engineer", company: "A", startDate: "2020-01", description: "B" }] }))).toBeUndefined();
    expect(history(completePayload({ education: [{ institution: "MIT", degree: "MSc" }] }))).toBeUndefined();
    expect(history(completePayload({ education: [{ school: "MIT" }] }))?.missingKeys).toEqual(["education"]);
  });

  it("blocks an otherwise complete profile that has no resume attached", () => {
    expect(checkAgentProfileGate(completePayload(), false).incompleteSections).toEqual([
      { id: "documents", label: "Resume", missingFields: ["Default resume"], missingKeys: ["resume"] },
    ]);
  });

  it("labels fields the way the editor does", () => {
    expect(gateLabel("workAuthorizations")).toBe("Work authorization by country");
    expect(gateLabel("not-a-field")).toBeUndefined();
  });
});

describe("checkJobProfileGate", () => {
  const user = { id: "user-1", email: "alex@example.com" } as any;
  const MEMBER_ONLY = ["sensitiveDataConsent", "gender", "genderSameAsBirthSex", "sexualOrientation", "pronouns", "ethnicity", "race", "religion",
    "veteranStatus", "disabilityStatus", "criminalRecord", "citizenships", "workAuthorizations", "languageProficiencies",
    "willingToTravel", "driversLicense", "backgroundCheckConsent", "drugTestConsent"];

  it("counts answers the resume supplied, not just ones typed into the form", () => {
    // Self-identification answers and the newer screening facts only ever come from the member;
    // the resume supplies the rest, and the profile's target role stands in for a headline.
    const typed = completePayload();
    const memberOnly = Object.fromEntries(MEMBER_ONLY.map((key) => [key, (typed as any)[key]]));
    const fromResume = without(typed, "headline", ...MEMBER_ONLY);
    const result = checkJobProfileGate(user, { applicant_profile: memberOnly, target_roles: ["Backend Engineer"] }, { id: "r1", extracted_data: { data: fromResume } });
    expect(result.isComplete).toBe(true);
  });

  it("ignores self-identification answers a resume claims to contain", () => {
    const resume = { id: "r1", extracted_data: { data: completePayload() } };
    const result = checkJobProfileGate(user, { applicant_profile: {} }, resume);
    expect(result.incompleteSections.find((section) => section.id === "demographics")?.missingFields).toEqual(["Self-identification answers"]);
  });

  it("blocks when the profile has no resume to sync", () => {
    const result = checkJobProfileGate(user, { applicant_profile: completePayload() }, null);
    expect(result.incompleteSections.map((section) => section.id)).toEqual(["documents"]);
  });
});

describe("what a resume can and cannot answer", () => {
  const user = { id: "user-1", email: "alex@example.com" } as any;

  it("leaves the questions only the member can answer", () => {
    const richResume = {
      id: "r1",
      extracted_data: {
        version: 2, status: "complete",
        firstName: "Alex", middleName: "R", lastName: "Kim", email: "alex@example.com",
        phoneCountryCode: "+1", phoneNumber: "5550102040",
        streetAddress: "12 Mill Lane", currentCity: "Austin", state: "Texas", zipcode: "73301", country: "United States",
        headline: "Senior Backend Engineer", summary: "Ten years on payments.", yearsOfExperience: 10,
        skills: ["Go", "Postgres"], languages: ["English"], certifications: ["AWS SAA"],
        experience: [{ title: "Backend Engineer", company: "Paylane", startDate: "2016-03", endDate: "Present", description: "Payment APIs." }],
        education: [{ school: "UT Austin", degree: "BSc Computer Science", startDate: "2010-09", endDate: "2014-05" }],
        workAuthorization: "Citizen", requiresSponsorship: "No", securityClearance: "None", desiredSalary: "180000",
      },
    };
    const result = checkJobProfileGate(user, { applicant_profile: {}, salary_min: 180000 }, richResume);
    expect(result.incompleteSections).toEqual([
      { id: "personal", label: "Personal and contact", missingFields: ["Timezone", "Language levels", "Date of birth"], missingKeys: ["timezone", "languageProficiencies", "dateOfBirth"] },
      {
        id: "preferences", label: "Work preferences and eligibility",
        missingFields: ["Expected salary currency", "Current annual salary", "Current salary currency", "Citizenship", "Work authorization by country",
          "Notice period", "Work arrangement", "Willing to relocate", "Willing to travel", "Driver's licence", "Background check", "Drug test"],
        missingKeys: ["desiredSalaryCurrency", "currentSalary", "currentSalaryCurrency", "citizenships", "workAuthorizations",
          "noticePeriod", "remotePreference", "willingToRelocate", "willingToTravel", "driversLicense", "backgroundCheckConsent", "drugTestConsent"],
      },
      { id: "demographics", label: "Self-identification", missingFields: ["Self-identification answers"], missingKeys: ["sensitiveDataConsent"] },
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
    expect(agentProfileGateMessage(checkAgentProfileGate(null, false))).toBe(
      "Complete this job profile before activating Scout AI — missing: Personal and contact, Professional profile, Experience and education, Work preferences and eligibility, Self-identification, Resume.",
    );
  });
});
