import { describe, expect, it } from "vitest";
import {
  canonicalDisabilityStatus,
  canonicalVeteranStatus,
  dialCodeFor,
  isoDateOfBirth,
  legacyPairFrom,
  listedVisaTypesFor,
  normalizeCountryName,
  phoneCountryId,
  suggestWorkAuthorizations,
} from "./profile-values";

describe("normalizeCountryName", () => {
  it("folds FastApply's aliases and Scout's older spellings onto one name", () => {
    expect(normalizeCountryName(" usa ")).toBe("United States");
    expect(normalizeCountryName("UK")).toBe("United Kingdom");
    expect(normalizeCountryName("Türkiye")).toBe("Turkey");
    expect(normalizeCountryName("Czech Republic")).toBe("Czechia");
    expect(normalizeCountryName("Bosnia & Herzegovina")).toBe("Bosnia and Herzegovina");
    expect(normalizeCountryName("Hong Kong SAR China")).toBe("Hong Kong");
    expect(normalizeCountryName("nigeria")).toBe("Nigeria");
  });

  it("keeps an unknown spelling as typed and returns null for blank", () => {
    expect(normalizeCountryName("Atlantis")).toBe("Atlantis");
    expect(normalizeCountryName("  ")).toBeNull();
    expect(normalizeCountryName(42)).toBeNull();
  });
});

describe("phoneCountryId", () => {
  it("stores FastApply's ISO id whatever Scout held before", () => {
    expect(phoneCountryId("GB")).toBe("GB");
    expect(phoneCountryId("+44")).toBe("GB");
    expect(phoneCountryId("234")).toBe("NG");
    expect(phoneCountryId("Kenya")).toBe("KE");
  });

  it("resolves a shared calling code to the residence country when it uses that code", () => {
    expect(phoneCountryId("+1", "Canada")).toBe("CA");
    expect(phoneCountryId("+1", "United States")).toBe("US");
    expect(phoneCountryId("+1", "Nigeria")).toBe("US");
    expect(phoneCountryId("+999")).toBeUndefined();
    expect(phoneCountryId("")).toBeUndefined();
  });

  it("gives the dial code back for an id", () => {
    expect(dialCodeFor("NG")).toBe("+234");
    expect(dialCodeFor("ZZ")).toBeUndefined();
  });
});

describe("suggestWorkAuthorizations", () => {
  it("suggests the citizenship country for a citizen", () => {
    expect(suggestWorkAuthorizations({ workAuthorization: "Citizen", citizenships: ["Kenya"], country: "Kenya" }).rows).toEqual([
      { country: "Kenya", status: "citizen", visaType: null, expiresAt: null, needsSponsorship: false },
    ]);
  });

  it("asks rather than guesses sponsorship for a visa holder who never said", () => {
    const { rows } = suggestWorkAuthorizations({ workAuthorization: "Work Visa / Work Permit", country: "Sweden" });
    expect(rows).toEqual([{ country: "Sweden", status: "work_visa", visaType: null, expiresAt: null, needsSponsorship: null }]);
  });

  it("knows the earlier answer 'no work authorization yet', and has nothing to say without a status", () => {
    expect(suggestWorkAuthorizations({ workAuthorization: "No work authorization yet" })).toEqual({ rows: [], legacySaysNone: true });
    expect(suggestWorkAuthorizations({ country: "Kenya" })).toEqual({ rows: [], legacySaysNone: false });
  });
});

describe("legacyPairFrom", () => {
  it("summarises the residence country's entry, else the first", () => {
    const list = [
      { country: "Ireland", status: "citizen" as const, visaType: null, expiresAt: null, needsSponsorship: false },
      { country: "United States", status: "work_visa" as const, visaType: "H-1B", expiresAt: null, needsSponsorship: true },
    ];
    expect(legacyPairFrom(list, "United States")).toEqual({ workAuthorization: "Work Visa / Work Permit", requiresSponsorship: "Yes" });
    expect(legacyPairFrom(list, "Kenya")).toEqual({ workAuthorization: "Citizen", requiresSponsorship: "No" });
    expect(legacyPairFrom([], "Kenya")).toEqual({ workAuthorization: "No work authorization yet", requiresSponsorship: "Yes" });
  });
});

describe("listedVisaTypesFor", () => {
  it("offers a country's own visa names, the EU list for members, and a generic list otherwise", () => {
    expect(listedVisaTypesFor("USA")).toContain("H-1B");
    expect(listedVisaTypesFor("Sweden")).toContain("EU Blue Card");
    expect(listedVisaTypesFor("Kenya")).toContain("Work permit");
  });
});

describe("isoDateOfBirth and the self-identification folds", () => {
  it("accepts only a real ISO date for an age of 16 to 90", () => {
    const today = new Date("2026-10-10T12:00:00Z");
    expect(isoDateOfBirth("1990-01-31", today)).toBe("1990-01-31");
    expect(isoDateOfBirth("1990-02-30", today)).toBeUndefined();
    expect(isoDateOfBirth("2015-01-01", today)).toBeUndefined();
  });

  it("folds a bare Yes/No to the long forms FastApply validates", () => {
    expect(canonicalVeteranStatus("yes")).toBe("Yes, I am a protected veteran");
    expect(canonicalDisabilityStatus("No")).toBe("No, I don't have a disability");
    expect(canonicalVeteranStatus("Prefer not to say")).toBe("Prefer not to say");
    expect(canonicalVeteranStatus("maybe")).toBeUndefined();
  });
});
