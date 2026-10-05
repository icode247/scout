import { describe, expect, it } from "vitest";
import { defaultSearchConfig, isVisibleClientJob, listingLookup } from "./client-matches";

describe("defaultSearchConfig", () => {
  it("searches on the profile's own targets", () => {
    const config = defaultSearchConfig({ target_roles: ["Product Designer"], locations: ["Cluj-Napoca"], applicant_profile: { remotePreference: "On-site" } });
    expect(config).toMatchObject({ roles: ["Product Designer"], locations: ["Cluj-Napoca"], work_modes: ["onsite"], date_posted: "7d", company_blacklist: [] });
  });

  it("falls back to the applicant's headline and city", () => {
    const config = defaultSearchConfig({ target_roles: [], locations: [], applicant_profile: { headline: "QA Engineer", currentCity: "Lagos", country: "Nigeria" } });
    expect(config.roles).toEqual(["QA Engineer"]);
    expect(config.locations).toEqual(["Lagos", "Nigeria"]);
    expect(defaultSearchConfig({}).roles).toEqual([]);
  });
});

describe("isVisibleClientJob", () => {
  it("always shows jobs that were acted on", () => {
    expect(isVisibleClientJob({ status: "applied", source: "fastapply_match" }, "f1")).toBe(true);
  });

  it("hides untouched FastApply imports and results of another saved search", () => {
    expect(isVisibleClientJob({ status: "saved", source: "fastapply_job_board" }, null)).toBe(false);
    expect(isVisibleClientJob({ status: "saved", source: "job_search", fit_analysis: { search_filter_id: "f2" } }, "f1")).toBe(false);
    expect(isVisibleClientJob({ status: "saved", source: "job_search", fit_analysis: { search_filter_id: "f1" } }, "f1")).toBe(true);
  });

  it("shows jobs the client saved or added by hand", () => {
    expect(isVisibleClientJob({ status: "saved", source: "job_board" }, "f1")).toBe(true);
    expect(isVisibleClientJob({ status: "saved", source: "dashboard" }, undefined)).toBe(true);
  });
});

describe("listingLookup", () => {
  const jobs = [
    { id: "j1", title: "Designer", company: "Acme", external_url: "https://www.linkedin.com/jobs/view/1", status: "applied", source: "assistant" },
    { id: "j2", title: "Analyst", company: "Beta", external_url: "https://beta.com/jobs/2", status: "saved", source: "job_board" },
    { id: "j3", title: "Analyst", company: "Beta", external_url: null, status: "saved", source: "dashboard" },
  ];
  const applications = [{ id: "a1", job_id: "j1", status: "evidence_ready", assistant_type: "human", submitted_at: "2026-10-03T10:00:00Z", created_at: "2026-10-03T10:00:00Z" }];
  const lookup = listingLookup(jobs, applications);

  it("finds an applied job through a differently tracked link", () => {
    expect(lookup("https://uk.linkedin.com/jobs/view/designer-at-acme-1?trk=x")).toMatchObject({ jobId: "j1", applied: true });
  });

  it("reports a saved job as on the list but not applied", () => {
    expect(lookup("https://beta.com/jobs/2/?utm_source=x")).toMatchObject({ jobId: "j2", jobStatus: "saved", applied: false });
  });

  it("returns null for jobs that are not on the list", () => {
    expect(lookup("https://gamma.com/jobs/9")).toBeNull();
    expect(lookup(null)).toBeNull();
  });
});
