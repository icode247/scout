import { describe, expect, it } from "vitest";
import { PLANS, planByCode, plansForLane, recommendedPlan } from "./plans";

describe("plan catalog", () => {
  it("has five plans with unique codes", () => {
    expect(PLANS).toHaveLength(5);
    expect(new Set(PLANS.map((plan) => plan.code)).size).toBe(5);
  });

  it("prices human bundles as one-time and AI plans as recurring", () => {
    expect(plansForLane("human").every((plan) => plan.billing === "one_time")).toBe(true);
    expect(plansForLane("ai").every((plan) => plan.billing === "recurring")).toBe(true);
  });

  it("matches the published pricing", () => {
    expect(planByCode("human_full")?.priceCents).toBe(49900);
    expect(planByCode("human_full")?.applicationsQuota).toBe(500);
    expect(planByCode("ai_essential")?.priceCents).toBe(3900);
    expect(planByCode("ai_essential")?.applicationsQuota).toBe(75);
  });

  it("returns null for an unknown code", () => {
    expect(planByCode("nope")).toBeNull();
  });

  it("gives every plan a distinct Dodo product env key", () => {
    expect(new Set(PLANS.map((plan) => plan.productEnvKey)).size).toBe(5);
    expect(PLANS.every((plan) => plan.productEnvKey.startsWith("DODO_PRODUCT_"))).toBe(true);
  });

  it("recommends exactly one plan per lane", () => {
    expect(recommendedPlan("human").code).toBe("human_full");
    expect(recommendedPlan("ai").code).toBe("ai_plus");
  });
});
