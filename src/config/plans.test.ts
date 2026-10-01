import { describe, expect, it } from "vitest";
import { PLANS, REGIONS, formatRegionalAmount, planByCode, plansForLane, recommendedPlan, regionCode, regionalPriceLabel, savings, standardSibling } from "./plans";

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

  it("bills every plan as a recurring subscription", () => {
    expect(PLANS.every((p) => p.billing === "recurring")).toBe(true);
    expect(PLANS.every((p) => p.billingMonths === (p.term === "quarterly" ? 3 : 1))).toBe(true);
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
  it("bills every three months with three times the allowance", () => {
    for (const code of ["ai_essential", "ai_plus", "human_focused", "human_full", "human_campaign"]) {
      const monthly = planByCode(code)!;
      const quarterly = planByCode(`${code}_90`)!;
      expect(quarterly.billingMonths).toBe(3);
      expect(quarterly.applicationsQuota).toBe(monthly.applicationsQuota * 3);
      expect(quarterly.validityDays).toBeNull();
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

  it("computes savings against three monthly charges", () => {
    // AI Plus: 3 x $79 = $237 versus $213.
    expect(savings(planByCode("ai_plus_90")!)!.cents).toBe(2400);
    expect(savings(planByCode("ai_plus_90")!)!.label).toBe("Save $24");
    // Full Search: 3 x $499 = $1,497 versus $1,347.
    expect(savings(planByCode("human_full_90")!)!.cents).toBe(15000);
    expect(savings(planByCode("human_full_90")!)!.label).toBe("Save $150");
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

describe("regional pricing", () => {
  const regions = Object.keys(REGIONS) as (keyof typeof REGIONS)[];

  it("gives every plan a positive whole amount for every region", () => {
    for (const plan of PLANS) {
      for (const region of regions) {
        expect(Number.isInteger(plan.regional[region]), `${plan.code} ${region}`).toBe(true);
        expect(plan.regional[region]).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the quarterly term cheaper than the standard equivalent in every region", () => {
    for (const plan of PLANS.filter((p) => p.term === "quarterly")) {
      const sibling = standardSibling(plan)!;
      for (const region of regions) {
        // The comparison price is three monthly cycles, matching the USD logic.
        const standardTotal = sibling.regional[region] * 3;
        const discount = 1 - plan.regional[region] / standardTotal;
        expect(discount, `${plan.code} ${region}`).toBeGreaterThan(0.05);
        expect(discount, `${plan.code} ${region}`).toBeLessThan(0.15);
      }
    }
  });

  it("discounts AI plans more deeply than Human plans", () => {
    // Regional amounts relative to each other must reflect the chosen policy:
    // AI near 70% off list, Human near 35%, so AI's local-to-USD ratio is
    // roughly half of Human's within a region.
    for (const region of regions) {
      const aiRatio = planByCode("ai_essential")!.regional[region] / planByCode("ai_essential")!.priceCents;
      const humanRatio = planByCode("human_full")!.regional[region] / planByCode("human_full")!.priceCents;
      expect(aiRatio, region).toBeLessThan(humanRatio * 0.65);
    }
  });

  it("formats regional labels in local currency", () => {
    expect(regionalPriceLabel(planByCode("ai_essential")!, "IN")).toBe("₹999");
    expect(regionalPriceLabel(planByCode("ai_essential")!, "NG")).toBe("₦16,000");
    expect(regionalPriceLabel(planByCode("human_campaign")!, "IN")).toBe("₹59,999");
    expect(formatRegionalAmount("NG", planByCode("ai_essential")!.regional.NG * 3)).toBe("₦48,000");
  });

  it("maps only supported countries to a region", () => {
    expect(regionCode("IN")).toBe("IN");
    expect(regionCode("NG")).toBe("NG");
    expect(regionCode("US")).toBeNull();
    expect(regionCode(null)).toBeNull();
    expect(regionCode(undefined)).toBeNull();
  });
});
