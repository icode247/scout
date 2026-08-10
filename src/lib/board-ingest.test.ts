import { describe, expect, it } from "vitest";
import {
  BANNED_PARAMS,
  INGEST_AXES,
  OFFSET_CEILING,
  PAGE_SIZE,
  initialsFor,
  logoUrlForDomain,
  nextCursor,
  normalizeBoardJob,
  salaryLabel,
} from "./board-ingest";

// A verbatim record from the live board API.
const raw = {
  id: 245038189,
  external_id: "workday_R0005562",
  title: "Client Services Representative",
  location: "Kansas City, Missouri",
  workplace_type: "hybrid",
  employment_type: "Full-time",
  is_remote: false,
  remote_worldwide: false,
  visa_sponsorship: null,
  experience_level: null,
  url: "https://example.com/job/1",
  posted_at: "2026-08-04T00:00:00.000Z",
  ats: "workday",
  salary: { min: null, max: null, currency: null, interval: null },
  company: { id: 512483, name: "American Century Services, LLC", domain: "americancentury.myworkdayjobs.com", logo_url: null },
};

describe("normalizeBoardJob", () => {
  it("maps a board record onto a row", () => {
    const row = normalizeBoardJob(raw)!;
    expect(row.external_id).toBe("workday_R0005562");
    expect(row.company).toBe("American Century Services, LLC");
    expect(row.company_domain).toBe("americancentury.myworkdayjobs.com");
    expect(row.external_url).toBe("https://example.com/job/1");
    expect(row.ats).toBe("workday");
    expect(row.is_remote).toBe(false);
  });

  it("derives a logo because the board leaves logo_url null", () => {
    expect(normalizeBoardJob(raw)!.logo_url).toContain("americancentury.myworkdayjobs.com");
  });

  it("prefers the board logo when it is actually present", () => {
    const withLogo = { ...raw, company: { ...raw.company, logo_url: "https://cdn.example.com/a.png" } };
    expect(normalizeBoardJob(withLogo)!.logo_url).toBe("https://cdn.example.com/a.png");
  });

  it("drops a record with no apply URL", () => {
    expect(normalizeBoardJob({ ...raw, url: "" })).toBeNull();
    expect(normalizeBoardJob(null)).toBeNull();
  });

  it("falls back to a synthetic external id", () => {
    expect(normalizeBoardJob({ ...raw, external_id: null })!.external_id).toBe("board_245038189");
  });

  it("survives a record with no company object", () => {
    const row = normalizeBoardJob({ ...raw, company: undefined })!;
    expect(row.company).toBe("Company");
    expect(row.logo_url).toBeNull();
  });

  it("caps oversized description text", () => {
    const row = normalizeBoardJob({ ...raw, description: "x".repeat(60000) })!;
    expect(row.description).toHaveLength(50000);
  });
});

describe("logoUrlForDomain", () => {
  it("returns null for a missing or malformed domain", () => {
    expect(logoUrlForDomain(null)).toBeNull();
    expect(logoUrlForDomain("")).toBeNull();
    expect(logoUrlForDomain("notadomain")).toBeNull();
  });

  it("strips a scheme and path", () => {
    expect(logoUrlForDomain("https://acme.com/careers")).toContain("acme.com");
    expect(logoUrlForDomain("https://acme.com/careers")).not.toContain("careers");
  });
});

describe("nextCursor", () => {
  it("advances by the page size", () => {
    expect(nextCursor(0, PAGE_SIZE)).toBe(100);
  });

  it("wraps at the offset ceiling because deeper pages time out", () => {
    expect(nextCursor(OFFSET_CEILING - PAGE_SIZE, PAGE_SIZE)).toBe(0);
    expect(nextCursor(OFFSET_CEILING, PAGE_SIZE)).toBe(0);
    expect(nextCursor(OFFSET_CEILING + 5000, PAGE_SIZE)).toBe(0);
  });

  // The board caps every result set at 10,000 rows and serves an empty page at or
  // beyond that offset. A ceiling above the cap makes the sweep page through
  // nothing for hours instead of wrapping to pick up newly posted jobs, which is
  // what let the corpus go stale.
  it("matches the board's 10,000-row result cap", () => {
    expect(OFFSET_CEILING).toBe(10000);
  });

  it("wraps within one run of reaching the cap", () => {
    // A cursor stranded past the cap must come straight back to 0, not crawl.
    expect(nextCursor(10000, PAGE_SIZE)).toBe(0);
    expect(nextCursor(10100, PAGE_SIZE)).toBe(0);
  });

  it("still sweeps the whole reachable range before wrapping", () => {
    expect(nextCursor(OFFSET_CEILING - PAGE_SIZE * 2, PAGE_SIZE)).toBe(OFFSET_CEILING - PAGE_SIZE);
  });
});

describe("INGEST_AXES", () => {
  it("never sends a parameter that times the board out", () => {
    for (const axis of INGEST_AXES) {
      for (const key of Object.keys(axis.params)) {
        expect(BANNED_PARAMS).not.toContain(key as any);
      }
    }
  });

  it("has a unique key per axis", () => {
    expect(new Set(INGEST_AXES.map((axis) => axis.key)).size).toBe(INGEST_AXES.length);
  });
});

describe("salaryLabel", () => {
  it("renders a range, a single bound, and nothing at all", () => {
    expect(salaryLabel({ min: 100000, max: 150000, currency: "USD", interval: "year" })).toBe("USD 100,000–150,000/year");
    expect(salaryLabel({ min: 90000, max: null, currency: "USD", interval: null })).toBe("USD 90,000");
    expect(salaryLabel({ min: null, max: null, currency: null, interval: null })).toBeNull();
    expect(salaryLabel(null)).toBeNull();
  });
});

describe("initialsFor", () => {
  it("takes at most two initials", () => {
    expect(initialsFor("American Century Services, LLC")).toBe("AC");
    expect(initialsFor("Stripe")).toBe("S");
    expect(initialsFor("")).toBe("");
  });
});
