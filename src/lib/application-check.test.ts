import { describe, expect, it } from "vitest";
import { applicationCheckVerdict, describeMatch, findApplicationMatches, jobLinkKey, sameCompany, similarTitle, type ClientApplicationRow, type ClientJobRow } from "./application-check";

describe("jobLinkKey", () => {
  it("ignores protocol, www, hash, trailing slash and tracking parameters", () => {
    expect(jobLinkKey("https://www.example.com/careers/123/?utm_source=linkedin&ref=abc#apply")).toBe("example.com/careers/123");
    expect(jobLinkKey("http://example.com/careers/123")).toBe("example.com/careers/123");
    expect(jobLinkKey("example.com/careers/123")).toBe("example.com/careers/123");
  });

  it("keeps the parameters that identify a posting, in a stable order", () => {
    expect(jobLinkKey("https://boards.greenhouse.io/acme/jobs/555?gh_src=abc&token=x")).toBe("boards.greenhouse.io/acme/jobs/555?gh_src=abc&token=x");
    expect(jobLinkKey("https://jobs.lever.co/acme/uuid?lever-source=x")).toBe("jobs.lever.co/acme/uuid?lever-source=x");
    expect(jobLinkKey("https://acme.com/jobs?id=9&utm_medium=x")).toBe(jobLinkKey("https://acme.com/jobs?id=9"));
  });

  it("treats every LinkedIn form of a job as one job", () => {
    const expected = "linkedin.com/jobs/view/4012345678";
    expect(jobLinkKey("https://www.linkedin.com/jobs/view/4012345678/?refId=x&trackingId=y")).toBe(expected);
    expect(jobLinkKey("https://uk.linkedin.com/jobs/view/senior-designer-at-acme-4012345678")).toBe(expected);
    expect(jobLinkKey("https://www.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=designer")).toBe(expected);
    expect(jobLinkKey("https://www.linkedin.com/jobs/view/4012345679")).not.toBe(expected);
  });

  it("treats every Indeed form of a job as one job", () => {
    const expected = "indeed.com/viewjob?jk=ab12cd34";
    expect(jobLinkKey("https://www.indeed.com/viewjob?jk=AB12CD34&from=serp&vjs=3")).toBe(expected);
    expect(jobLinkKey("https://uk.indeed.com/m/viewjob?jk=ab12cd34")).toBe(expected);
    expect(jobLinkKey("https://www.indeed.com/rc/clk?jk=ab12cd34&tk=xyz")).toBe(expected);
  });

  it("rejects anything that is not an http(s) link", () => {
    expect(jobLinkKey("")).toBeNull();
    expect(jobLinkKey("mailto:jobs@acme.com")).toBeNull();
    expect(jobLinkKey("not a url at all")).toBeNull();
    expect(jobLinkKey(null)).toBeNull();
  });
});

describe("text matching", () => {
  it("matches companies despite suffixes, case and punctuation", () => {
    expect(sameCompany("Acme, Inc.", "ACME")).toBe(true);
    expect(sameCompany("Acme Ltd", "Acme Limited")).toBe(true);
    expect(sameCompany("Acme Robotics", "Acme")).toBe(true);
    expect(sameCompany("Acme", "Apex")).toBe(false);
  });

  it("matches titles when one is a longer form of the other", () => {
    expect(similarTitle("Senior Product Designer (Remote)", "Product Designer")).toBe(true);
    expect(similarTitle("Product Designer", "Product designer")).toBe(true);
    expect(similarTitle("Product Designer", "Backend Engineer")).toBe(false);
    expect(similarTitle("QA", "Senior QA Engineer")).toBe(false);
  });
});

const job = (overrides: Partial<ClientJobRow> & { id: string }): ClientJobRow => ({
  title: "Product Designer", company: "Acme", external_url: "https://www.linkedin.com/jobs/view/1", status: "applied", source: "assistant", ...overrides,
});
const application = (overrides: Partial<ClientApplicationRow> & { id: string; job_id: string }): ClientApplicationRow => ({
  status: "evidence_ready", assistant_type: "human", submitted_at: "2026-10-03T10:00:00Z", created_at: "2026-10-03T10:00:00Z", ...overrides,
});

describe("findApplicationMatches", () => {
  const jobs = [
    job({ id: "j1" }),
    job({ id: "j2", title: "Senior Product Designer", company: "Acme Inc", external_url: "https://acme.com/careers/77", status: "delegated" }),
    job({ id: "j3", title: "Data Analyst", company: "Beta", external_url: "https://beta.com/jobs/1", status: "saved" }),
  ];
  const applications = [
    application({ id: "a1", job_id: "j1" }),
    application({ id: "a2", job_id: "j2", status: "preparing", submitted_at: null, created_at: "2026-10-04T10:00:00Z" }),
  ];

  it("finds the job by link, whatever tracking noise the link carries", () => {
    const matches = findApplicationMatches({ jobUrl: "https://uk.linkedin.com/jobs/view/designer-at-acme-1?refId=zzz" }, jobs, applications);
    expect(matches.map((match) => [match.kind, match.job.id, match.applied])).toEqual([["link", "j1", true]]);
    expect(matches[0].summary).toMatch(/Already applied on 3 Oct 2026 by the assistant/);
    expect(applicationCheckVerdict(matches)).toEqual({ state: "applied", headline: "Already applied — do not apply again" });
  });

  it("falls back to role and company when the link is new", () => {
    const matches = findApplicationMatches({ jobUrl: "https://acme.com/careers/99", title: "Product Designer", company: "ACME" }, jobs, applications);
    expect(matches.map((match) => [match.kind, match.job.id])).toEqual([["title", "j1"], ["title", "j2"]]);
    expect(matches[0].applied).toBe(true);
    expect(matches[1].summary).toMatch(/Requested by the client/);
    expect(applicationCheckVerdict(matches).state).toBe("similar");
  });

  it("reports a clean slate", () => {
    const matches = findApplicationMatches({ jobUrl: "https://gamma.com/jobs/1", title: "CTO", company: "Gamma" }, jobs, applications);
    expect(matches).toEqual([]);
    expect(applicationCheckVerdict(matches)).toEqual({ state: "clear", headline: "Not on the client's list — go ahead" });
  });

  it("uses the client's latest application for a job", () => {
    const twice = [
      application({ id: "old", job_id: "j1", status: "withdrawn", submitted_at: null, created_at: "2026-09-01T00:00:00Z" }),
      application({ id: "new", job_id: "j1", status: "interview", created_at: "2026-10-01T00:00:00Z" }),
    ];
    const [match] = findApplicationMatches({ jobUrl: "https://linkedin.com/jobs/view/1" }, jobs, twice);
    expect(match.application?.id).toBe("new");
    expect(match.summary).toMatch(/interview/);
  });

  it("explains a job the client saved but never delegated", () => {
    const [match] = findApplicationMatches({ jobUrl: "https://beta.com/jobs/1" }, jobs, applications);
    expect(match.applied).toBe(false);
    expect(match.summary).toMatch(/never applied/);
    expect(applicationCheckVerdict([match]).state).toBe("listed");
  });
});

describe("describeMatch", () => {
  it("covers every application status", () => {
    const base = job({ id: "j" });
    const statuses = ["submitted", "evidence_ready", "interview", "preparing", "needs_input", "rejected", "withdrawn"];
    const applied = statuses.map((status) => describeMatch(base, application({ id: "a", job_id: "j", status })).applied);
    expect(applied).toEqual([true, true, true, false, false, true, false]);
  });

  it("describes AI-lane applications so the assistant knows who applied", () => {
    expect(describeMatch(job({ id: "j" }), application({ id: "a", job_id: "j", assistant_type: "ai" })).summary).toMatch(/by Scout AI/);
  });
});
