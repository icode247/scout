import { describe, expect, it } from "vitest";
import { MONTHS, formatMonthYear, normalizeMonthYear, parseMonthYear, yearOptions } from "./month-year";

const REF = 2026;

describe("parseMonthYear", () => {
  it("reads the ISO-ish shape the extractor produces", () => {
    expect(parseMonthYear("2021-03", REF)).toEqual({ month: "March", year: "2021", present: false });
    expect(parseMonthYear("2021/3", REF)).toEqual({ month: "March", year: "2021", present: false });
    expect(parseMonthYear("2021-03-15", REF)).toEqual({ month: "March", year: "2021", present: false });
  });

  it("reads month-first numeric dates", () => {
    expect(parseMonthYear("03/2021", REF)).toEqual({ month: "March", year: "2021", present: false });
    expect(parseMonthYear("3-2021", REF)).toEqual({ month: "March", year: "2021", present: false });
    expect(parseMonthYear("03/15/2021", REF)).toEqual({ month: "March", year: "2021", present: false });
  });

  it("reads named months in the forms resumes use", () => {
    for (const input of ["March 2021", "march 2021", "MARCH 2021", "Mar 2021", "Mar. 2021", "March, 2021", "2021 March"]) {
      expect(parseMonthYear(input, REF)).toEqual({ month: "March", year: "2021", present: false });
    }
  });

  it("accepts Sept as well as Sep", () => {
    expect(parseMonthYear("Sept 2019", REF).month).toBe("September");
    expect(parseMonthYear("Sep 2019", REF).month).toBe("September");
  });

  it("keeps a year that has no month", () => {
    expect(parseMonthYear("2014", REF)).toEqual({ month: "", year: "2014", present: false });
  });

  it("recognises an ongoing role however it was written", () => {
    for (const input of ["Present", "present", "Current", "now", "Ongoing", "to date"]) {
      expect(parseMonthYear(input, REF)).toEqual({ month: "", year: "", present: true });
    }
  });

  it("returns blanks for text no model could place on a timeline", () => {
    for (const input of ["Summer of 19", "a while back", "?", "N/A", "12345"]) {
      expect(parseMonthYear(input, REF)).toEqual({ month: "", year: "", present: false });
    }
  });

  it("rejects impossible months and out-of-range years", () => {
    expect(parseMonthYear("2021-13", REF).month).toBe("");
    expect(parseMonthYear("1834", REF).year).toBe("");
    expect(parseMonthYear("2999", REF).year).toBe("");
  });

  it("allows a near-future year for an expected graduation", () => {
    expect(parseMonthYear("June 2029", REF)).toEqual({ month: "June", year: "2029", present: false });
  });

  it("handles empty and non-string input", () => {
    for (const input of ["", "   ", null, undefined, 0, {}]) {
      expect(parseMonthYear(input, REF)).toEqual({ month: "", year: "", present: false });
    }
  });
});

describe("formatMonthYear", () => {
  it("composes the stored form", () => {
    expect(formatMonthYear({ month: "March", year: "2021" })).toBe("March 2021");
  });

  it("keeps a year-only date", () => {
    expect(formatMonthYear({ month: "", year: "2014" })).toBe("2014");
  });

  it("drops a month with no year, which cannot be placed on a timeline", () => {
    expect(formatMonthYear({ month: "March", year: "" })).toBe("");
  });

  it("writes Present regardless of the other parts", () => {
    expect(formatMonthYear({ month: "March", year: "2021", present: true })).toBe("Present");
  });

  it("returns empty for no parts at all", () => {
    expect(formatMonthYear({})).toBe("");
  });
});

describe("normalizeMonthYear", () => {
  it("canonicalizes every accepted spelling to one stored form", () => {
    for (const input of ["2021-03", "03/2021", "Mar 2021", "March, 2021"]) {
      expect(normalizeMonthYear(input, true, REF)).toBe("March 2021");
    }
  });

  it("keeps a clean year found inside free text", () => {
    expect(normalizeMonthYear("sometime in 2021", true, REF)).toBe("2021");
    expect(normalizeMonthYear("started March 2021 I think", true, REF)).toBe("March 2021");
  });

  it("erases a date the model could only guess at", () => {
    // "2021ish" is not a year: the digits run into other characters, so no
    // word boundary matches and nothing is salvaged from it.
    expect(normalizeMonthYear("sometime in 2021ish, maybe", true, REF)).toBe("");
    expect(normalizeMonthYear("whenever", true, REF)).toBe("");
  });

  it("refuses Present on a start date", () => {
    expect(normalizeMonthYear("Present", false, REF)).toBe("");
    expect(normalizeMonthYear("Present", true, REF)).toBe("Present");
  });

  it("is idempotent, so re-saving a profile never degrades a date", () => {
    for (const input of ["March 2021", "2014", "Present", ""]) {
      const once = normalizeMonthYear(input, true, REF);
      expect(normalizeMonthYear(once, true, REF)).toBe(once);
    }
  });

  it("produces dates Date.parse understands, which is what the service uses", () => {
    for (const input of ["2021-03", "Mar 2021", "2014"]) {
      expect(Number.isNaN(Date.parse(normalizeMonthYear(input, true, REF)))).toBe(false);
    }
  });
});

describe("yearOptions", () => {
  it("runs newest first, from a near-future year back to 1950", () => {
    const years = yearOptions(REF);
    expect(years[0]).toBe("2034");
    expect(years[years.length - 1]).toBe("1950");
    expect(years).toContain(String(REF));
  });

  it("offers every year a parsed date could produce", () => {
    const years = new Set(yearOptions(REF));
    for (const input of ["June 2029", "March 2021", "1950"]) {
      expect(years.has(parseMonthYear(input, REF).year)).toBe(true);
    }
  });
});

describe("MONTHS", () => {
  it("is the twelve full English names the application service expects", () => {
    expect(MONTHS).toHaveLength(12);
    expect(MONTHS[0]).toBe("January");
    expect(MONTHS[11]).toBe("December");
  });

  it("round-trips every month through parse and format", () => {
    for (const month of MONTHS) {
      expect(normalizeMonthYear(`${month} 2021`, true, REF)).toBe(`${month} 2021`);
    }
  });
});
