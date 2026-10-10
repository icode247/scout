import { describe, expect, it } from "vitest";
import { draftFromProfile, emptyDraft, fillBlanks, profileFromDraft } from "./draft";

describe("draftFromProfile", () => {
  it("shows every older shape Scout stored as the canonical choice", () => {
    const draft = draftFromProfile({
      phoneCountryCode: "+1", country: "Canada", nationality: "Türkiye", veteranStatus: "Yes", disabilityStatus: "No",
      securityClearance: "N/A", noticePeriod: "two weeks", remotePreference: "onsite", willingToRelocate: true,
      languages: ["English", "French"], languageProficiencies: [{ language: "English", level: "Native or bilingual" }],
      certifications: [{ name: "CKA" }], yearsOfExperience: 7,
    });
    expect(draft.phoneCountryCode).toBe("CA");
    expect(draft.citizenships).toEqual(["Turkey"]);
    expect(draft.veteranStatus).toBe("Yes, I am a protected veteran");
    expect(draft.disabilityStatus).toBe("No, I don't have a disability");
    expect(draft.securityClearance).toBe("None");
    expect(draft.noticePeriod).toBe("2 weeks");
    expect(draft.remotePreference).toBe("On-site");
    expect(draft.willingToRelocate).toBe("Yes");
    expect(draft.languages).toEqual([{ language: "English", level: "Native or bilingual" }, { language: "French", level: "" }]);
    expect(draft.certifications).toEqual(["CKA"]);
    expect(draft.yearsOfExperience).toBe("7");
    // Never set up: null, so the editor shows the suggestion from the earlier answer.
    expect(draft.workAuthorizations).toBeNull();
  });

  it("keeps an explicit 'authorized nowhere' apart from 'never set up'", () => {
    expect(draftFromProfile({ workAuthorizations: [] }).workAuthorizations).toEqual([]);
  });

  it("starts empty for nothing at all", () => {
    expect(draftFromProfile(null)).toEqual(emptyDraft());
  });
});

describe("profileFromDraft", () => {
  it("leaves blanks out and keeps the paired fields together", () => {
    const draft = { ...emptyDraft(), firstName: " Alex ", citizenships: ["Canada", "Ireland"], languages: [{ language: "English", level: "" as const }] };
    expect(profileFromDraft(draft)).toEqual({
      firstName: "Alex", citizenships: ["Canada", "Ireland"], nationality: "Canada",
      languages: ["English"], languageProficiencies: [{ language: "English", level: null }],
    });
  });

  it("does not post a salary the member chose to negotiate", () => {
    const out = profileFromDraft({ ...emptyDraft(), desiredSalary: "90000", desiredSalaryCurrency: "EUR", desiredSalaryNegotiable: true });
    expect(out).toEqual({ desiredSalaryCurrency: "EUR", desiredSalaryNegotiable: true });
  });

  it("posts the consent decision only once it is made", () => {
    expect(profileFromDraft(emptyDraft())).not.toHaveProperty("sensitiveDataConsent");
    expect(profileFromDraft({ ...emptyDraft(), sensitiveDataConsent: "declined" }).sensitiveDataConsent).toBe("declined");
  });
});

describe("fillBlanks", () => {
  it("fills only what is blank and says how much", () => {
    const current = { ...emptyDraft(), firstName: "Typed", skills: ["Go"] };
    const fromResume = { ...emptyDraft(), firstName: "Resume", lastName: "Kim", skills: ["Rust"], email: "a@b.co" };
    const { draft, filled } = fillBlanks(current, fromResume);
    expect(draft.firstName).toBe("Typed");
    expect(draft.skills).toEqual(["Go"]);
    expect(draft.lastName).toBe("Kim");
    expect(filled).toBe(2);
  });

  it("never takes the consent decision from anywhere but the member", () => {
    const { draft } = fillBlanks(emptyDraft(), { ...emptyDraft(), sensitiveDataConsent: "granted" });
    expect(draft.sensitiveDataConsent).toBe("");
  });
});
