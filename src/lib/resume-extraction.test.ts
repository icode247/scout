import { describe, expect, it } from "vitest";
import { normalizeResumeExtraction } from "./resume-extraction";

/** The shape every resume stored before the v2 schema landed. */
const legacyRow = {
  version: 1,
  status: "complete",
  contact: { name: "Alex R Kim", email: "alex@example.com", phone: "5550102040", location: "Austin, TX" },
  headline: "Senior Backend Engineer",
  summary: "Ten years building payment systems.",
  roles: [{ title: "Staff Engineer", company: "Northstar", location: "Remote", start_date: "2021-03", end_date: "Present", achievements: ["Cut latency 40%", "Led migration"] }],
  education: [{ institution: "UT Austin", degree: "Bachelor's Degree", field: "Computer Science", graduation_date: "2014" }],
  skills: ["Go", "Postgres"],
  target_roles: ["Backend Engineer"],
  preferred_locations: ["Remote"],
  salary_min: 180000,
  work_authorization: "Citizen",
  sponsorship_required: false,
  extracted_at: "2026-01-01T00:00:00.000Z",
};

describe("normalizeResumeExtraction (v1 rows)", () => {
  const result = normalizeResumeExtraction(legacyRow);

  it("splits the contact name into first, middle, and last", () => {
    expect(result.firstName).toBe("Alex");
    expect(result.lastName).toBe("R Kim");
  });

  it("lifts contact details out of the nested object", () => {
    expect(result.email).toBe("alex@example.com");
    expect(result.phoneNumber).toBe("5550102040");
  });

  it("renames work authorization, which the payload builder previously dropped", () => {
    expect(result.workAuthorization).toBe("Citizen");
  });

  it("converts the sponsorship boolean into the answer the form stores", () => {
    expect(result.requiresSponsorship).toBe("No");
    expect(normalizeResumeExtraction({ sponsorship_required: true }).requiresSponsorship).toBe("Yes");
  });

  it("maps roles onto experience, joining achievements into the description", () => {
    expect(result.experience).toEqual([{
      title: "Staff Engineer", company: "Northstar", location: "Remote",
      // "2021-03" as stored; canonicalized to the one shape the editor and the
      // application service both read.
      startDate: "March 2021", endDate: "Present", description: "Cut latency 40%\nLed migration",
    }]);
  });

  it("maps institution/field/graduation_date onto the editor's education fields", () => {
    expect(result.education).toEqual([{
      school: "UT Austin", degree: "Bachelor's Degree", major: "Computer Science",
      gpa: "", startDate: "", endDate: "2014", location: "",
    }]);
  });

  it("canonicalizes dates however the model happened to write them", () => {
    const messy = normalizeResumeExtraction({
      version: 1,
      roles: [{ title: "Engineer", company: "Acme", start_date: "Sept 2019", end_date: "current" }],
      education: [{ institution: "UT", degree: "BSc", graduation_date: "06/2014" }],
    });
    expect(messy.experience[0]).toMatchObject({ startDate: "September 2019", endDate: "Present" });
    expect(messy.education[0]).toMatchObject({ endDate: "June 2014" });
  });

  it("drops a date no model could place on a timeline", () => {
    const vague = normalizeResumeExtraction({
      version: 1,
      roles: [{ title: "Engineer", company: "Acme", start_date: "a few summers ago", end_date: "" }],
    });
    expect(vague.experience[0]).toMatchObject({ startDate: "", endDate: "" });
  });

  it("never leaves Present on a start date", () => {
    const wrong = normalizeResumeExtraction({ version: 1, roles: [{ title: "Engineer", start_date: "Present" }] });
    expect(wrong.experience[0].startDate).toBe("");
  });

  it("renames the snake_case suggestion lists", () => {
    expect(result.targetRoles).toEqual(["Backend Engineer"]);
    expect(result.preferredLocations).toEqual(["Remote"]);
    expect(result.desiredSalary).toBe("180000");
  });

  it("leaves the address blank rather than guessing it apart from contact.location", () => {
    expect(result.currentCity).toBe("");
    expect(result.state).toBe("");
    expect(result.country).toBe("");
    expect(result.streetAddress).toBe("");
  });

  it("falls back to contact.location as a location suggestion when none was captured", () => {
    const { preferred_locations, ...withoutLocations } = legacyRow;
    expect(normalizeResumeExtraction(withoutLocations).preferredLocations).toEqual(["Austin", "TX"]);
  });
});

describe("normalizeResumeExtraction (v2 rows)", () => {
  it("passes the current shape through unchanged", () => {
    const row = {
      version: 2, status: "complete",
      firstName: "Alex", middleName: "R", lastName: "Kim", email: "alex@example.com",
      phoneCountryCode: "+1", phoneNumber: "5550102040",
      streetAddress: "12 Mill Lane", currentCity: "Austin", state: "Texas", zipcode: "73301", country: "United States",
      headline: "Senior Backend Engineer", summary: "Payments.", yearsOfExperience: 10,
      skills: ["Go"], languages: ["English"], certifications: ["AWS SAA"],
      linkedinURL: "https://linkedin.com/in/alex", githubURL: "", website: "",
      education: [], experience: [],
      workAuthorization: "Citizen", requiresSponsorship: "No", securityClearance: "",
      targetRoles: ["Backend Engineer"], preferredLocations: ["Remote"], desiredSalary: "180000",
    };
    const result = normalizeResumeExtraction(row);
    for (const [key, value] of Object.entries(row)) expect(result[key]).toEqual(value);
  });

  it("keeps zero years of experience and nulls an unusable value", () => {
    expect(normalizeResumeExtraction({ yearsOfExperience: 0 }).yearsOfExperience).toBe(0);
    expect(normalizeResumeExtraction({ yearsOfExperience: "many" }).yearsOfExperience).toBeNull();
  });

  it("preserves fields it does not know about", () => {
    expect(normalizeResumeExtraction({ projects: [{ name: "Atlas" }] }).projects).toEqual([{ name: "Atlas" }]);
  });
});

describe("normalizeResumeExtraction (edge cases)", () => {
  it("unwraps the { data: … } form some callers pass", () => {
    expect(normalizeResumeExtraction({ data: { firstName: "Alex" } }).firstName).toBe("Alex");
  });

  it("returns empty answers for null, a failed extraction, or a processing row", () => {
    for (const input of [null, undefined, {}, { version: 1, status: "failed" }, { version: 1, status: "processing" }]) {
      const result = normalizeResumeExtraction(input);
      expect(result.firstName).toBe("");
      expect(result.skills).toEqual([]);
      expect(result.experience).toEqual([]);
    }
  });

  it("coerces certifications given as objects into names", () => {
    expect(normalizeResumeExtraction({ certifications: [{ name: "AWS SAA" }, "CKA"] }).certifications)
      .toEqual(["AWS SAA", "CKA"]);
  });

  it("accepts a comma-separated string where a list is expected", () => {
    expect(normalizeResumeExtraction({ skills: "Go, Postgres" }).skills).toEqual(["Go", "Postgres"]);
  });
});
