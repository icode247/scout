import { describe, expect, it } from "vitest";
import { canonicalJobUrl, duplicateMessage, findSentDuplicate, isSameJob } from "./job-duplicate";

const job = { title: "Product Designer", company: "Acme", location: "Lagos", external_url: "https://www.linkedin.com/jobs/view/123/" };

describe("job duplicates", () => {
  it("ignores tracking parameters, fragments and trailing slashes in a job link", () => {
    expect(canonicalJobUrl("https://www.linkedin.com/jobs/view/123/?trk=abc&utm_source=x#apply")).toBe(canonicalJobUrl("https://linkedin.com/jobs/view/123"));
  });

  it("keeps parameters that identify the job", () => {
    expect(canonicalJobUrl("https://boards.example.com/jobs?gh_jid=1")).not.toBe(canonicalJobUrl("https://boards.example.com/jobs?gh_jid=2"));
  });

  it("matches the same link even when the page text was read differently", () => {
    expect(isSameJob(job, { ...job, title: "Product Designer (Remote)", external_url: "https://linkedin.com/jobs/view/123?refId=9" })).toBe(true);
  });

  it("matches the same title and company on a different link", () => {
    expect(isSameJob(job, { title: " product  designer ", company: "ACME", location: "", external_url: "https://acme.com/careers/77" })).toBe(true);
  });

  it("treats the same role in another location as a different job", () => {
    expect(isSameJob(job, { ...job, location: "Nairobi", external_url: "https://acme.com/careers/78" })).toBe(false);
  });

  it("does not match different roles at the same company", () => {
    expect(findSentDuplicate({ ...job, title: "Product Manager", external_url: "https://acme.com/careers/79" }, [job])).toBeNull();
  });

  it("says when the job was first sent", () => {
    expect(duplicateMessage("2026-11-12T09:00:00Z")).toBe("You already sent this job to your assistant on 12 Nov. It is in your applications.");
  });
});
