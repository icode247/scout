import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INTAKE_KEYS, INTAKE_LABELS, cleanIntakeAnswers, formatIntakeAnswer } from "./applicant-intake";
import { isApplicantKey } from "./applicant-profile";

describe("cleanIntakeAnswers", () => {
  it("keeps questionnaire answers and drops everything else", () => {
    const answers = cleanIntakeAnswers({
      workAuthorization: " Citizen ", noticePeriod: "2 weeks", email: "a@b.co", full_name: "Alex", website: "spam", firstName: "Alex",
    });
    expect(answers).toEqual({ workAuthorization: "Citizen", noticePeriod: "2 weeks" });
  });

  it("drops blanks and non-string values", () => {
    expect(cleanIntakeAnswers({ nationality: "   ", timezone: 42, race: { x: 1 } })).toEqual({});
  });

  it("stores negotiable salary only when chosen", () => {
    expect(cleanIntakeAnswers({ desiredSalaryNegotiable: true })).toEqual({ desiredSalaryNegotiable: true });
    expect(cleanIntakeAnswers({ desiredSalaryNegotiable: false })).toEqual({});
  });

  it("parses links and references into the applicant-profile shapes", () => {
    const answers = cleanIntakeAnswers({
      additionalLinks: "Behance | https://behance.net/alex\nhttps://www.dribbble.com/alex\n\n",
      references: "Jane Doe | jane@x.co | +1 555 | Manager\n | orphan@x.co",
    });
    expect(answers.additionalLinks).toEqual({ Behance: "https://behance.net/alex", "dribbble.com": "https://www.dribbble.com/alex" });
    expect(answers.references).toEqual([{ name: "Jane Doe", email: "jane@x.co", phone: "+1 555", type: "Manager" }]);
  });

  it("stores authorized countries as a de-duplicated list", () => {
    expect(cleanIntakeAnswers({ workAuthorizationCountries: "Nigeria\nCanada\n\nNigeria " }).workAuthorizationCountries).toEqual(["Nigeria", "Canada"]);
    expect(formatIntakeAnswer(["Nigeria", "Canada"])).toBe("Nigeria, Canada");
  });

  it("caps long answers", () => {
    expect(cleanIntakeAnswers({ nationality: "x".repeat(5_000) }).nationality).toHaveLength(2_000);
    expect(cleanIntakeAnswers({ coverLetter: "x".repeat(20_000) }).coverLetter).toHaveLength(10_000);
  });
});

describe("formatIntakeAnswer", () => {
  it("renders every stored shape as text", () => {
    expect(formatIntakeAnswer(true)).toBe("Yes");
    expect(formatIntakeAnswer({ Behance: "https://b.net" })).toBe("Behance: https://b.net");
    expect(formatIntakeAnswer([{ name: "Jane", type: "Manager", email: "j@x.co", phone: "" }])).toBe("Jane · Manager · j@x.co");
  });
});

describe("INTAKE_KEYS", () => {
  it("are applicant-profile keys, so answers copy straight into a job profile", () => {
    // nationality and howDidYouHearAboutUs are FastApply fields the /profiles editor does not collect yet;
    // workAuthorizationCountries is for the assistant only.
    const notInEditor = new Set(["nationality", "howDidYouHearAboutUs", "workAuthorizationCountries"]);
    for (const key of INTAKE_KEYS) if (!notInEditor.has(key)) expect(isApplicantKey(key)).toBe(true);
  });

  it("each have a label and a field on the /intake page", () => {
    const markup = readFileSync(new URL("../pages/intake.astro", import.meta.url), "utf8");
    const names = new Set([...markup.matchAll(/name="([^"]+)"/g)].map((match) => match[1]));
    for (const key of INTAKE_KEYS) {
      expect(names.has(key)).toBe(true);
      expect(INTAKE_LABELS[key]).toBeTruthy();
    }
  });
});

describe("shared answer options", () => {
  it("match the /profiles editor, so both forms store identical values", async () => {
    const options = await import("./applicant-options");
    const editor = readFileSync(new URL("../components/ApplicantProfileFields.astro", import.meta.url), "utf8");
    const lists = [options.NOTICE_PERIODS, options.WORK_AUTHORIZATIONS, options.WORK_ARRANGEMENTS, options.GENDERS,
      options.ETHNICITIES, options.RACES, options.VETERAN_STATUSES, options.DISABILITY_STATUSES];
    for (const list of lists) for (const { value } of list) {
      expect(editor.includes(`<option>${value}</option>`) || editor.includes(`<option value="${value}">`)).toBe(true);
    }
    for (const code of options.CURRENCIES) expect(editor).toContain(`"${code}"`);
    for (const zone of options.TIMEZONES) expect(editor).toContain(`"${zone}"`);
  });
});
