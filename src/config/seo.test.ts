import { describe, expect, it } from "vitest";
import { isNonIndexablePath } from "./seo";

describe("isNonIndexablePath", () => {
  it.each([
    "/admin",
    "/agent",
    "/checkout/success",
    "/email/unsubscribe",
    "/settings",
    "/variants/a-restraint",
  ])("excludes private and utility route %s", (pathname) => {
    expect(isNonIndexablePath(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/auto-apply",
    "/blog/job-application-service-cost",
    "/compare/lazyapply-alternative",
    "/download",
  ])("keeps public landing page %s indexable", (pathname) => {
    expect(isNonIndexablePath(pathname)).toBe(false);
  });
});
