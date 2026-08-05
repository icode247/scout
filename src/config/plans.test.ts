import { describe, expect, it } from "vitest";
import { PLANS, planByCode, plansForLane, recommendedPlan, savings, standardSibling } from "./plans";

describe("plan catalog", () => {
  it("has a standard and quarterly version of every product", () => {
    expect(PLANS).toHaveLength(10);
    expect(new Set(PLANS.map((plan) => plan.code)).size).toBe(10);
    const families = new Set(PLANS.map((plan) => plan.family));
    expect(families.size).toBe(5);
    for (const family of families) {
      const terms = PLANS.filter((plan) => plan.family === family).map((plan) => plan.term).sort();
      expect(terms).toEqual(["quarterly", "standard"]);
    }
  });

  it("prices human bundles as one-time and AI plans as recurring", () => {
    expect(PLANS.filter((p) => p.lane === "human").every((p) => p.billing === "one_time")).toBe(true);
    expect(PLANS.filter((p) => p.lane === "ai").every((p) => p.billing === "recurring")).toBe(true);
  });

  it("matches the published standard pricing", () => {
    expect(planByCode("human_full")?.priceCents).toBe(49900);
    expect(planByCode("human_full")?.applicationsQuota).toBe(500);
    expect(planByCode("ai_essential")?.priceCents).toBe(3900);
    expect(planByCode("ai_essential")?.applicationsQuota).toBe(75);
  });

  it("returns null for an unknown code", () => {
    expect(planByCode("nope")).toBeNull();
  });

  it("gives every plan a distinct Dodo product env key", () => {
    expect(new Set(PLANS.map((plan) => plan.productEnvKey)).size).toBe(10);
    expect(PLANS.every((plan) => plan.productEnvKey.startsWith("DODO_PRODUCT_"))).toBe(true);
  });

  it("filters by lane and term", () => {
    expect(plansForLane("ai").map((p) => p.code)).toEqual(["ai_essential", "ai_plus"]);
    expect(plansForLane("ai", "quarterly").map((p) => p.code)).toEqual(["ai_essential_90", "ai_plus_90"]);
    expect(plansForLane("human", "quarterly")).toHaveLength(3);
  });

  it("recommends exactly one plan per lane and term", () => {
    expect(recommendedPlan("human").code).toBe("human_full");
    expect(recommendedPlan("human", "quarterly").code).toBe("human_full_90");
    expect(recommendedPlan("ai", "quarterly").code).toBe("ai_plus_90");
  });
});

describe("quarterly term", () => {
  it("bills AI every three months with three times the allowance", () => {
    for (const code of ["ai_essential", "ai_plus"]) {
      const monthly = planByCode(code)!;
      const quarterly = planByCode(`${code}_90`)!;
      expect(quarterly.billingMonths).toBe(3);
      expect(quarterly.applicationsQuota).toBe(monthly.applicationsQuota * 3);
      expect(quarterly.validityDays).toBeNull();
    }
  });

  it("keeps the Human allowance but expires it after 90 days", () => {
    for (const code of ["human_focused", "human_full", "human_campaign"]) {
      const standard = planByCode(code)!;
      const quarterly = planByCode(`${code}_90`)!;
      expect(quarterly.applicationsQuota).toBe(standard.applicationsQuota);
      expect(quarterly.validityDays).toBe(90);
      expect(standard.validityDays).toBeNull();
    }
  });

  it("discounts every quarterly plan by about 10 percent", () => {
    for (const plan of PLANS.filter((p) => p.term === "quarterly")) {
      const result = savings(plan)!;
      expect(result).not.toBeNull();
      expect(result.percent).toBeGreaterThanOrEqual(9);
      expect(result.percent).toBeLessThanOrEqual(11);
    }
  });

  it("computes savings against three months for AI and the bundle price for Human", () => {
    // AI Plus: 3 x $79 = $237 versus $213.
    expect(savings(planByCode("ai_plus_90")!)!.cents).toBe(2400);
    expect(savings(planByCode("ai_plus_90")!)!.label).toBe("Save $24");
    // Full Search: $499 versus $449.
    expect(savings(planByCode("human_full_90")!)!.cents).toBe(5000);
    expect(savings(planByCode("human_full_90")!)!.label).toBe("Save $50");
  });

  it("reports no savings for a standard plan", () => {
    expect(savings(planByCode("ai_plus")!)).toBeNull();
    expect(standardSibling(planByCode("ai_plus")!)).toBeNull();
  });

  it("pairs each quarterly plan back to its standard sibling", () => {
    expect(standardSibling(planByCode("human_full_90")!)?.code).toBe("human_full");
    expect(standardSibling(planByCode("ai_essential_90")!)?.code).toBe("ai_essential");
  });
});
