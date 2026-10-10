import { describe, expect, it } from "vitest";
import { emptyDraft, fillBlanks, profileFromDraft, type ApplicantDraft } from "./draft";
import { cleanApplicantProfile } from "../../lib/applicant-profile";

const row = (country: string, overrides: Record<string, any> = {}) =>
  ({ country, status: "citizen", visaType: null, expiresAt: null, needsSponsorship: false, ...overrides }) as any;
const draftWith = (patch: Partial<ApplicantDraft>) => ({ ...emptyDraft(), ...patch });

describe("work authorization rows without a country", () => {
  it("never saves a list of unplaced rows as 'authorized nowhere'", () => {
    expect(profileFromDraft(draftWith({ workAuthorizations: [row("")] }))).not.toHaveProperty("workAuthorizations");
  });

  it("keeps the earlier answer when the only row is still being filled in", () => {
    const saved = cleanApplicantProfile(profileFromDraft(draftWith({ workAuthorization: "Citizen", requiresSponsorship: "No", workAuthorizations: [row("")] })));
    expect(saved).toMatchObject({ workAuthorization: "Citizen", requiresSponsorship: "No" });
    expect(saved).not.toHaveProperty("workAuthorizations");
  });

  it("saves the placed rows, and an explicit 'nowhere'", () => {
    expect(profileFromDraft(draftWith({ workAuthorizations: [row("United Kingdom"), row("")] })).workAuthorizations).toEqual([row("United Kingdom")]);
    expect(profileFromDraft(draftWith({ workAuthorizations: [] })).workAuthorizations).toEqual([]);
    expect(profileFromDraft(draftWith({ workAuthorizations: null }))).not.toHaveProperty("workAuthorizations");
  });
});

describe("fillBlanks", () => {
  it("never takes self-identification answers or consent from a resume", () => {
    const result = fillBlanks(emptyDraft(), draftWith({ gender: "Male", race: "White", sensitiveDataConsent: "granted", firstName: "Ada" }));
    expect(result.draft).toMatchObject({ gender: "", race: "", sensitiveDataConsent: "", firstName: "Ada" });
    expect(result.filled).toBe(1);
  });
});
