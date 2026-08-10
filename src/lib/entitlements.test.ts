import { describe, expect, it } from "vitest";
import {
  EMPTY_ENTITLEMENT,
  RESUMES_PER_PROFILE,
  assertCanActivateAgent,
  assertCanApply,
  assertProfileLimit,
  assertResumeLimit,
  evaluateEntitlement,
  loadEntitlement,
  type SubscriptionRow,
} from "./entitlements";
import { PLANS } from "../config/plans";

const base: SubscriptionRow = {
  plan_code: "ai_essential", lane: "ai", status: "active",
  applications_quota: 75, applications_used: 0, current_period_end: null,
};

describe("evaluateEntitlement", () => {
  it("treats a missing subscription as unpaid", () => {
    const e = evaluateEntitlement(null);
    expect(e).toEqual(EMPTY_ENTITLEMENT);
    expect(e.paid).toBe(false);
    expect(e.canApply).toBe(false);
    expect(e.reason).toBe("no_plan");
  });

  it("allows applying on an active plan with quota left", () => {
    const e = evaluateEntitlement(base);
    expect(e.paid).toBe(true);
    expect(e.canApply).toBe(true);
    expect(e.canActivateAgent).toBe(true);
    expect(e.applicationsRemaining).toBe(75);
    expect(e.reason).toBeNull();
  });

  it("refuses applying when the quota is exhausted", () => {
    const e = evaluateEntitlement({ ...base, applications_used: 75 });
    expect(e.paid).toBe(true);
    expect(e.canApply).toBe(false);
    expect(e.applicationsRemaining).toBe(0);
    expect(e.reason).toBe("quota_exhausted");
  });

  it("never reports negative remaining applications", () => {
    expect(evaluateEntitlement({ ...base, applications_used: 900 }).applicationsRemaining).toBe(0);
  });

  it("refuses a past_due subscription", () => {
    const e = evaluateEntitlement({ ...base, status: "past_due" });
    expect(e.canApply).toBe(false);
    expect(e.reason).toBe("past_due");
  });

  it("refuses a canceled subscription", () => {
    const e = evaluateEntitlement({ ...base, status: "canceled" });
    expect(e.paid).toBe(false);
    expect(e.canApply).toBe(false);
  });

  it("expires a recurring plan whose period has ended", () => {
    const e = evaluateEntitlement({ ...base, current_period_end: "2020-01-01T00:00:00Z" });
    expect(e.paid).toBe(false);
    expect(e.canApply).toBe(false);
    expect(e.status).toBe("expired");
  });

  it("keeps a plan valid while its period is still running", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(evaluateEntitlement({ ...base, current_period_end: future }).canApply).toBe(true);
  });

  it("keeps a one-time human bundle valid with no period end", () => {
    const e = evaluateEntitlement({
      ...base, plan_code: "human_full", lane: "human",
      applications_quota: 500, applications_used: 12, current_period_end: null,
    });
    expect(e.paid).toBe(true);
    expect(e.canApply).toBe(true);
    expect(e.hasHumanAssistant).toBe(true);
    expect(e.applicationsRemaining).toBe(488);
  });

  it("does not grant a human assistant on an AI plan", () => {
    expect(evaluateEntitlement(base).hasHumanAssistant).toBe(false);
  });

  it("only grants agent activation on the AI lane", () => {
    const human = evaluateEntitlement({ ...base, plan_code: "human_full", lane: "human" });
    expect(human.canApply).toBe(true);
    expect(human.canActivateAgent).toBe(false);
  });

  it("does not grant a human assistant on an unpaid row", () => {
    const e = evaluateEntitlement({ ...base, lane: "human", status: "canceled" });
    expect(e.hasHumanAssistant).toBe(false);
  });
});

describe("loadEntitlement", () => {
  /** Minimal PostgREST-ish stub that records the status filter it was given. */
  function stubClient(row: SubscriptionRow | null) {
    const calls: { statuses?: string[] } = {};
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: (_column: string, values: string[]) => { calls.statuses = values; return builder; },
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({ data: row, error: null }),
    };
    return { client: { from: () => builder } as any, calls };
  }

  it("surfaces a past_due subscription instead of reporting no plan", async () => {
    // Regression: filtering on status='active' hid failed payments, so a member
    // whose card bounced was told to choose a plan rather than fix billing.
    const { client, calls } = stubClient({
      plan_code: "human_full", lane: "human", status: "past_due",
      applications_quota: 500, applications_used: 10, current_period_end: null,
    });
    const entitlement = await loadEntitlement("user-1", client, false);
    expect(calls.statuses).toContain("past_due");
    expect(entitlement.reason).toBe("past_due");
    expect(entitlement.lane).toBe("human");
    expect(entitlement.canApply).toBe(false);
  });

  it("grants a usable plan in demo mode, which has no billing backend", async () => {
    const entitlement = await loadEntitlement("demo", undefined, true);
    expect(entitlement.paid).toBe(true);
    expect(entitlement.canApply).toBe(true);
  });
});

describe("assertions", () => {
  it("throws a 402 Response when applying is not allowed", () => {
    try {
      assertCanApply(EMPTY_ENTITLEMENT);
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(402);
    }
  });

  it("carries a machine-readable code and reason", async () => {
    try {
      assertCanApply(evaluateEntitlement({ ...base, applications_used: 75 }));
      throw new Error("should have thrown");
    } catch (error) {
      const body = await (error as Response).json();
      expect(body.code).toBe("payment_required");
      expect(body.reason).toBe("quota_exhausted");
      expect(body.lane).toBe("ai");
    }
  });

  it("does not throw for an entitled user", () => {
    expect(() => assertCanApply(evaluateEntitlement(base))).not.toThrow();
    expect(() => assertCanActivateAgent(evaluateEntitlement(base))).not.toThrow();
  });

  it("blocks agent activation for a paid human member", () => {
    const human = evaluateEntitlement({ ...base, lane: "human", plan_code: "human_full" });
    expect(() => assertCanActivateAgent(human)).toThrow();
  });
});

describe("profileLimit", () => {
  it("takes the limit from the purchased plan", () => {
    expect(evaluateEntitlement({ ...base, plan_code: "ai_essential" }).profileLimit).toBe(1);
    expect(evaluateEntitlement({ ...base, plan_code: "ai_plus" }).profileLimit).toBe(3);
    expect(evaluateEntitlement({ ...base, lane: "human", plan_code: "human_campaign" }).profileLimit).toBe(4);
  });

  it("matches every plan the pricing page sells", () => {
    for (const plan of PLANS) {
      const entitlement = evaluateEntitlement({
        ...base, lane: plan.lane, plan_code: plan.code, applications_quota: plan.applicationsQuota,
      });
      expect(entitlement.profileLimit).toBe(plan.profileLimit);
    }
  });

  it("gives an unpaid member one profile, so onboarding can create it", () => {
    expect(evaluateEntitlement(null).profileLimit).toBe(1);
  });

  it("falls back to the free allowance for an unrecognised plan code", () => {
    expect(evaluateEntitlement({ ...base, plan_code: "ai_retired_2019" }).profileLimit).toBe(1);
  });

  it("drops a lapsed plan back to the free allowance", () => {
    const expired = evaluateEntitlement({ ...base, plan_code: "ai_plus", current_period_end: "2020-01-01T00:00:00.000Z" });
    expect(expired.paid).toBe(false);
    expect(expired.profileLimit).toBe(1);
  });

  it("keeps the full profile allowance when only the application quota is spent", () => {
    const exhausted = evaluateEntitlement({ ...base, plan_code: "ai_plus", applications_used: 200, applications_quota: 200 });
    expect(exhausted.canApply).toBe(false);
    expect(exhausted.profileLimit).toBe(3);
  });
});

describe("assertProfileLimit", () => {
  const plus = evaluateEntitlement({ ...base, plan_code: "ai_plus" });

  it("allows a profile below the limit", () => {
    expect(() => assertProfileLimit(plus, 0)).not.toThrow();
    expect(() => assertProfileLimit(plus, 2)).not.toThrow();
  });

  it("refuses the one that would exceed it", async () => {
    let thrown: unknown;
    try { assertProfileLimit(plus, 3); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(Response);
    const response = thrown as Response;
    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.code).toBe("profile_limit_reached");
    expect(body.profileLimit).toBe(3);
    expect(body.error).toContain("3 active job profiles");
  });

  it("tells an unpaid member to choose a plan rather than to upgrade", async () => {
    let thrown: unknown;
    try { assertProfileLimit(evaluateEntitlement(null), 1); } catch (error) { thrown = error; }
    const body = await (thrown as Response).json();
    expect(body.error).toContain("Choose a plan");
  });

  it("still refuses when a member is already over the limit after a downgrade", () => {
    expect(() => assertProfileLimit(evaluateEntitlement({ ...base, plan_code: "ai_essential" }), 3)).toThrow();
  });

  it("uses the singular for a one-profile plan", async () => {
    let thrown: unknown;
    try { assertProfileLimit(evaluateEntitlement({ ...base, plan_code: "ai_essential" }), 1); } catch (error) { thrown = error; }
    const body = await (thrown as Response).json();
    expect(body.error).toContain("1 active job profile.");
  });
});

describe("assertResumeLimit", () => {
  it("allows resumes below the per-profile ceiling", () => {
    expect(() => assertResumeLimit(0)).not.toThrow();
    expect(() => assertResumeLimit(RESUMES_PER_PROFILE - 1)).not.toThrow();
  });

  it("refuses the one that would exceed it", async () => {
    let thrown: unknown;
    try { assertResumeLimit(RESUMES_PER_PROFILE); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(Response);
    const response = thrown as Response;
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("resume_limit_reached");
    expect(body.resumeLimit).toBe(RESUMES_PER_PROFILE);
  });
});
