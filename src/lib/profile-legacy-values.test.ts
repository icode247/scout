import { describe, expect, it } from "vitest";
import { normalizeProfileValue } from "./profile-values";
import { answersForSave, cleanApplicantProfile } from "./applicant-profile";
import { draftFromProfile } from "../components/profile/draft";

// Every case here is one FastApply's normalizeProfileValue folds the same way (its
// profile-screening-values.ts): a spelling it accepts that Scout dropped was an answer lost on save.
describe("normalizeProfileValue (FastApply's older spellings)", () => {
  it.each([
    ["workAuthorization", "US Citizen", "Citizen"],
    ["workAuthorization", "green card", "Permanent Resident"],
    ["requiresSponsorship", "false", "No"],
    ["willingToRelocate", "true", "Yes"],
    ["willingToRelocate", true, "Yes"],
    ["driversLicense", "y", "Yes"],
    ["noticePeriod", "2months", "2 months"],
    ["noticePeriod", "90 days", "3 months"],
    ["remotePreference", "onsite", "On-site"],
    ["securityClearance", "TS/SCI", "Top Secret / SCI"],
    ["securityClearance", "no clearance", "None"],
    ["veteranStatus", "yes", "Yes, I am a protected veteran"],
    ["disabilityStatus", "none", "No, I don't have a disability"],
    ["gender", "m", "Male"],
    ["gender", "Decline to self-identify", "Prefer not to say"],
    ["race", "caucasian", "White"],
    ["race", "Asian - Chinese", "Asian - Chinese"],
    ["religion", "atheist", "No religion"],
    ["religion", "Quaker", "Quaker"],
    ["sexualOrientation", "straight", "Heterosexual or straight"],
    ["genderSameAsBirthSex", "true", "Yes"],
    ["willingToTravel", "no", "No"],
  ] as const)("%s: %j becomes %j", (field, value, expected) => {
    expect(normalizeProfileValue(field, value)).toBe(expected);
  });

  it("returns null for a blank and undefined for what FastApply would refuse", () => {
    expect(normalizeProfileValue("gender", "   ")).toBeNull();
    expect(normalizeProfileValue("gender", null)).toBeNull();
    expect(normalizeProfileValue("gender", "Woman (cis)")).toBeUndefined();
    expect(normalizeProfileValue("gender", 5)).toBeUndefined();
    // "Yes" says nothing about how much travel; FastApply refuses it too.
    expect(normalizeProfileValue("willingToTravel", "yes")).toBeUndefined();
    // Not in FastApply's table either.
    expect(normalizeProfileValue("securityClearance", "Secret clearance")).toBeUndefined();
    expect(normalizeProfileValue("religion", "x".repeat(61))).toBeUndefined();
  });
});

describe("cleanApplicantProfile keeps older answers", () => {
  it("folds the spellings FastApply folds, and drops an unknown list answer", () => {
    const clean = cleanApplicantProfile({
      workAuthorization: "US Citizen", requiresSponsorship: "false", noticePeriod: "2months", willingToRelocate: "true",
      securityClearance: "ts", veteranStatus: "yes", gender: "f", remotePreference: "whenever",
    });
    expect(clean).toMatchObject({
      workAuthorization: "Citizen", requiresSponsorship: "No", noticePeriod: "2 months", willingToRelocate: "Yes",
      securityClearance: "Top Secret", veteranStatus: "Yes, I am a protected veteran", gender: "Female",
    });
    expect(clean.remotePreference).toBeUndefined();
  });

  it("keeps a self-identification answer in the member's own words when FastApply has no spelling for it", () => {
    expect(cleanApplicantProfile({ gender: "Woman (cis)", religion: "Quaker" })).toMatchObject({ gender: "Woman (cis)", religion: "Quaker" });
  });

  it("shows older spellings in the editor as the choice they mean", () => {
    const draft = draftFromProfile({ workAuthorization: "US Citizen", requiresSponsorship: "true", gender: "m", willingToTravel: "no", driversLicense: "false" });
    expect(draft).toMatchObject({ workAuthorization: "Citizen", requiresSponsorship: "Yes", gender: "Male", willingToTravel: "No", driversLicense: "No" });
  });
});

describe("answersForSave", () => {
  it("leaves the stored answers alone when the form carried none (an editor that never loaded)", () => {
    const stored = { firstName: "Ada", gender: "Female", sensitiveDataConsent: "granted" };
    expect(answersForSave(false, {}, stored)).toBe(stored);
    expect(answersForSave(false, {}, null)).toEqual({});
  });

  it("reconciles sent answers with the stored consent decision", () => {
    const stored = { sensitiveDataConsent: "granted", sensitiveDataConsentAt: "2026-10-01T00:00:00.000Z", gender: "Female" };
    expect(answersForSave(true, { firstName: "Ada" }, stored)).toEqual({
      firstName: "Ada", gender: "Female", sensitiveDataConsent: "granted", sensitiveDataConsentAt: "2026-10-01T00:00:00.000Z",
    });
  });
});
