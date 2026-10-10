import { describe, expect, it } from "vitest";
import { SELF_ID_DECLINE_VALUE, SENSITIVE_SELF_ID_FIELDS } from "./privacy";
import { applySelfIdConsent, normalizeSensitiveConsent, reconcileSelfIdConsent } from "./self-id-consent";

const answers: Record<string, any> = { firstName: "Alex", gender: "Male", race: "Asian", veteranStatus: "No", religion: "Muslim" };
const now = () => "2026-10-10T00:00:00.000Z";

describe("normalizeSensitiveConsent", () => {
  it("accepts the two decisions and nothing else", () => {
    expect(normalizeSensitiveConsent("granted")).toBe("granted");
    expect(normalizeSensitiveConsent(" declined ")).toBe("declined");
    for (const junk of ["", "yes", "true", null, undefined, 1, {}]) expect(normalizeSensitiveConsent(junk)).toBeNull();
  });
});

describe("applySelfIdConsent", () => {
  it("granted: the answers go as typed, with the consent key", () => {
    expect(applySelfIdConsent(answers, "granted")).toEqual({ ...answers, sensitiveDataConsent: "granted" });
  });

  it("declined: every one of the eleven becomes Prefer not to say, even ones never asked", () => {
    const out = applySelfIdConsent(answers, "declined");
    expect(out.sensitiveDataConsent).toBe("declined");
    expect(out.firstName).toBe("Alex");
    for (const key of SENSITIVE_SELF_ID_FIELDS) expect(out[key]).toBe(SELF_ID_DECLINE_VALUE);
  });

  it("not answered: neither the consent key nor any of the eleven is present; the rest is untouched", () => {
    for (const consent of [undefined, null, "", "maybe"]) {
      const out = applySelfIdConsent({ ...answers, sensitiveDataConsent: consent }, consent);
      expect(out).toEqual({ firstName: "Alex" });
    }
  });

  it("reads the decision from the answers themselves by default", () => {
    const granted: Record<string, any> = { ...answers, sensitiveDataConsent: "granted" };
    const declined: Record<string, any> = { ...answers, sensitiveDataConsent: "declined" };
    expect(applySelfIdConsent(granted).gender).toBe("Male");
    expect(applySelfIdConsent(declined).gender).toBe(SELF_ID_DECLINE_VALUE);
  });

  it("does not mutate its input", () => {
    const input = { ...answers };
    applySelfIdConsent(input, "declined");
    expect(input).toEqual(answers);
  });
});

describe("reconcileSelfIdConsent", () => {
  it("stamps a new decision with the server's clock", () => {
    const out = reconcileSelfIdConsent({ ...answers, sensitiveDataConsent: "granted" }, null, now);
    expect(out).toMatchObject({ ...answers, sensitiveDataConsent: "granted", sensitiveDataConsentAt: now() });
  });

  it("keeps the stored stamp when the decision is unchanged", () => {
    const stored = { sensitiveDataConsent: "granted", sensitiveDataConsentAt: "2026-10-01T00:00:00.000Z", gender: "Male" };
    const out = reconcileSelfIdConsent({ gender: "Female", sensitiveDataConsent: "granted" }, stored, now);
    expect(out).toEqual({ gender: "Female", sensitiveDataConsent: "granted", sensitiveDataConsentAt: "2026-10-01T00:00:00.000Z" });
  });

  it("re-stamps a changed decision and clears the answers on a withdrawal", () => {
    const stored = { sensitiveDataConsent: "granted", sensitiveDataConsentAt: "2026-10-01T00:00:00.000Z", gender: "Male" };
    const out: Record<string, any> = reconcileSelfIdConsent({ gender: "Male", sensitiveDataConsent: "declined" }, stored, now);
    expect(out.sensitiveDataConsentAt).toBe(now());
    for (const key of SENSITIVE_SELF_ID_FIELDS) expect(out[key]).toBe(SELF_ID_DECLINE_VALUE);
  });

  it("a form without a decision leaves the stored decision, its stamp and its answers as they were", () => {
    const stored = { sensitiveDataConsent: "granted", sensitiveDataConsentAt: "2026-10-01T00:00:00.000Z", gender: "Male", race: "Asian" };
    // An older client re-saving the whole form: it sends what it knows and nothing about consent.
    const out = reconcileSelfIdConsent({ firstName: "Alex", gender: "Male" }, stored, now);
    expect(out).toEqual({ firstName: "Alex", gender: "Male", race: "Asian", sensitiveDataConsent: "granted", sensitiveDataConsentAt: "2026-10-01T00:00:00.000Z" });
  });

  it("with no decision anywhere, answers on file from before the question stay on file, nothing sent for them is taken, and no stamp is invented", () => {
    const stored = { gender: "Male", race: "Asian" };
    const out = reconcileSelfIdConsent({ firstName: "Alex", gender: "Female", religion: "Muslim" }, stored, now);
    expect(out).toEqual({ firstName: "Alex", gender: "Male", race: "Asian" });
    expect(reconcileSelfIdConsent({ firstName: "Alex", gender: "Female" }, null, now)).toEqual({ firstName: "Alex" });
  });

  it("never trusts a client-sent stamp", () => {
    const out = reconcileSelfIdConsent({ sensitiveDataConsent: "granted", sensitiveDataConsentAt: "1999-01-01T00:00:00.000Z" }, null, now);
    expect(out.sensitiveDataConsentAt).toBe(now());
    expect(reconcileSelfIdConsent({ sensitiveDataConsentAt: "1999-01-01T00:00:00.000Z" }, null, now)).toEqual({});
  });
});
