import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./first-apply", async () => {
  const actual = await vi.importActual<typeof import("./first-apply")>("./first-apply");
  return {
    ...actual,
    firstApply: { ...actual.firstApply, upsertApplicant: vi.fn(), cancelAutomation: vi.fn() },
  };
});

import { FirstApplyError, firstApply } from "./first-apply";
import { planByCode } from "../config/plans";
import {
  NO_APPLICATIONS, applicantPlanLimits, assertPlanLimitsPushed, monthlyAllowance, pauseScoutAiAutomations,
  periodStart, pushApplicantPlanLimits, syncApplicantPlanLimits,
} from "./fastapply-limits";

const upsertApplicant = firstApply.upsertApplicant as unknown as ReturnType<typeof vi.fn>;
const cancelAutomation = firstApply.cancelAutomation as unknown as ReturnType<typeof vi.fn>;

const inFuture = new Date(Date.now() + 20 * 86400000).toISOString();
const inPast = new Date(Date.now() - 86400000).toISOString();

function row(overrides: Record<string, any> = {}) {
  return {
    plan_code: "ai_plus", lane: "ai" as const, status: "active" as const,
    applications_quota: 200, applications_used: 12,
    current_period_end: inFuture, current_period_start: "2026-10-01T09:30:00.000Z",
    ...overrides,
  };
}

/** A minimal chainable stand-in for the Supabase client: every chain resolves to the table's canned answer. */
function fakeSupabase(tables: Record<string, { data?: any; error?: any }>, log: any[] = []) {
  const client: any = {
    from(table: string) {
      const answer = tables[table] ?? { data: [], error: null };
      const chain: any = {};
      for (const method of ["select", "eq", "in", "order", "limit", "update"]) {
        chain[method] = (...args: any[]) => { log.push([table, method, ...args]); return chain; };
      }
      chain.maybeSingle = () => Promise.resolve({ data: Array.isArray(answer.data) ? answer.data[0] ?? null : answer.data ?? null, error: answer.error ?? null });
      chain.then = (resolve: any, reject: any) => Promise.resolve({ data: answer.data ?? [], error: answer.error ?? null }).then(resolve, reject);
      return chain;
    },
  };
  return client;
}

beforeEach(() => { upsertApplicant.mockReset(); cancelAutomation.mockReset(); });

describe("monthlyAllowance", () => {
  it("is the quota for a monthly plan and a third of it for a quarterly one", () => {
    expect(monthlyAllowance(planByCode("ai_plus")!)).toBe(200);
    expect(monthlyAllowance(planByCode("ai_plus_90")!)).toBe(200);
    expect(monthlyAllowance(planByCode("ai_essential")!)).toBe(75);
    expect(monthlyAllowance(planByCode("ai_essential_90")!)).toBe(75);
  });

  it("spreads a 90-day bundle over three months and leaves a never-expiring one as is", () => {
    const quarterly = { ...planByCode("ai_plus")!, billing: "one_time" as const, billingMonths: 0, validityDays: 90, applicationsQuota: 600 };
    expect(monthlyAllowance(quarterly)).toBe(200);
    const bundle = { ...quarterly, validityDays: null, applicationsQuota: 250 };
    expect(monthlyAllowance(bundle)).toBe(250);
  });
});

describe("periodStart", () => {
  it("prefers the start the webhook recorded", () => {
    expect(periodStart(row(), planByCode("ai_plus")!)).toBe("2026-10-01T09:30:00.000Z");
  });

  it("derives it from the period end and the billing cycle for older rows", () => {
    expect(periodStart(row({ current_period_start: null, current_period_end: "2026-11-15T00:00:00.000Z" }), planByCode("ai_plus")!)).toBe("2026-10-15T00:00:00.000Z");
    expect(periodStart(row({ current_period_start: null, current_period_end: "2026-11-15T00:00:00.000Z" }), planByCode("ai_plus_90")!)).toBe("2026-08-15T00:00:00.000Z");
    const bundle = { ...planByCode("ai_plus")!, billingMonths: 0, validityDays: 90 };
    expect(periodStart(row({ current_period_start: null, current_period_end: "2026-11-15T00:00:00.000Z" }), bundle)).toBe("2026-08-17T00:00:00.000Z");
  });

  it("leaves FastApply's default when nothing is known", () => {
    expect(periodStart(row({ current_period_start: null, current_period_end: null }), planByCode("ai_plus")!)).toBeNull();
    expect(periodStart(row({ current_period_start: "not a date", current_period_end: "also not" }), planByCode("ai_plus")!)).toBeNull();
  });
});

describe("applicantPlanLimits", () => {
  it("gives an active plan its monthly rate, no daily cap, anchored to the period start", () => {
    expect(applicantPlanLimits(row())).toEqual({ dailyApplicationLimit: null, monthlyApplicationLimit: 200, limitPeriodStartedAt: "2026-10-01T09:30:00.000Z" });
    expect(applicantPlanLimits(row({ plan_code: "ai_essential_90", applications_quota: 225 })).monthlyApplicationLimit).toBe(75);
  });

  it("stops a customer whose plan is cancelled, expired, past due, unknown or missing", () => {
    expect(applicantPlanLimits(null)).toEqual(NO_APPLICATIONS);
    expect(applicantPlanLimits(row({ status: "canceled" }))).toEqual(NO_APPLICATIONS);
    expect(applicantPlanLimits(row({ status: "past_due" }))).toEqual(NO_APPLICATIONS);
    expect(applicantPlanLimits(row({ current_period_end: inPast }))).toEqual(NO_APPLICATIONS);
    expect(applicantPlanLimits(row({ plan_code: "retired_plan" }))).toEqual(NO_APPLICATIONS);
  });

  it("keeps the plan rate even when Scout's own counter says the quota is spent: FastApply counts per applicant", () => {
    expect(applicantPlanLimits(row({ applications_used: 200 })).monthlyApplicationLimit).toBe(200);
  });
});

describe("pushApplicantPlanLimits", () => {
  it("pushes to every applicant the user has synced and reports each failure without throwing", async () => {
    upsertApplicant.mockResolvedValueOnce({}).mockRejectedValueOnce(new FirstApplyError("boom", 502));
    const supabase = fakeSupabase({ fastapply_applicant_sync: { data: [{ external_id: "u:p1" }, { external_id: "u:p2" }] } });
    const result = await pushApplicantPlanLimits(supabase, "u", NO_APPLICATIONS);
    expect(result).toEqual({ pushed: ["u:p1"], failed: [{ externalId: "u:p2", error: "boom" }] });
    expect(upsertApplicant).toHaveBeenCalledWith("u:p1", NO_APPLICATIONS);
    expect(upsertApplicant).toHaveBeenCalledWith("u:p2", NO_APPLICATIONS);
  });

  it("pushes to one applicant when told which", async () => {
    upsertApplicant.mockResolvedValue({});
    const log: any[] = [];
    const supabase = fakeSupabase({}, log);
    const result = await pushApplicantPlanLimits(supabase, "u", applicantPlanLimits(row()), "u:p9");
    expect(result.pushed).toEqual(["u:p9"]);
    expect(log).toEqual([]);
  });

  it("reports a failed applicant lookup instead of throwing", async () => {
    const supabase = fakeSupabase({ fastapply_applicant_sync: { error: { message: "down" } } });
    expect(await pushApplicantPlanLimits(supabase, "u", NO_APPLICATIONS)).toEqual({ pushed: [], failed: [{ externalId: "*", error: "down" }] });
  });
});

describe("syncApplicantPlanLimits", () => {
  it("reads the user's current plan and pushes what it entitles", async () => {
    upsertApplicant.mockResolvedValue({});
    const supabase = fakeSupabase({
      subscriptions: { data: [row()] },
      fastapply_applicant_sync: { data: [{ external_id: "u:p1" }] },
    });
    await syncApplicantPlanLimits(supabase, "u");
    expect(upsertApplicant).toHaveBeenCalledWith("u:p1", { dailyApplicationLimit: null, monthlyApplicationLimit: 200, limitPeriodStartedAt: "2026-10-01T09:30:00.000Z" });
  });

  it("pushes zero when the user has no plan", async () => {
    upsertApplicant.mockResolvedValue({});
    const supabase = fakeSupabase({ subscriptions: { data: [] }, fastapply_applicant_sync: { data: [{ external_id: "u:p1" }] } });
    await syncApplicantPlanLimits(supabase, "u");
    expect(upsertApplicant).toHaveBeenCalledWith("u:p1", NO_APPLICATIONS);
  });
});

describe("assertPlanLimitsPushed", () => {
  it("lets a clean push through and refuses activation on any failure", () => {
    expect(() => assertPlanLimitsPushed({ pushed: ["a"], failed: [] })).not.toThrow();
    expect(() => assertPlanLimitsPushed({ pushed: [], failed: [{ externalId: "a", error: "x" }] })).toThrow(FirstApplyError);
  });
});

describe("pauseScoutAiAutomations", () => {
  it("cancels each running automation upstream and marks the config paused", async () => {
    cancelAutomation.mockResolvedValue(undefined);
    const log: any[] = [];
    const supabase = fakeSupabase({ ai_agent_configs: { data: [{ id: "c1", first_apply_id: "fa1" }, { id: "c2", first_apply_id: null }] } }, log);
    const result = await pauseScoutAiAutomations(supabase, "u");
    expect(result).toEqual({ paused: 2, failed: [] });
    expect(cancelAutomation).toHaveBeenCalledTimes(1);
    expect(cancelAutomation).toHaveBeenCalledWith("fa1");
    const updates = log.filter(([table, method]) => table === "ai_agent_configs" && method === "update");
    expect(updates).toHaveLength(2);
    expect(updates[0][2]).toMatchObject({ status: "paused", last_error: null });
  });

  it("treats an automation FastApply no longer has as stopped, and keeps any other failure active", async () => {
    cancelAutomation
      .mockRejectedValueOnce(new FirstApplyError("not found", 404))
      .mockRejectedValueOnce(new FirstApplyError("unavailable", 503));
    const supabase = fakeSupabase({ ai_agent_configs: { data: [{ id: "c1", first_apply_id: "gone" }, { id: "c2", first_apply_id: "down" }] } });
    const result = await pauseScoutAiAutomations(supabase, "u");
    expect(result.paused).toBe(1);
    expect(result.failed).toEqual([{ configId: "c2", error: "unavailable" }]);
  });
});

describe("isStoppedUpstream", () => {
  it("reads gone (404) and already completed or failed (422, or 400 from older versions) as stopped", async () => {
    const { isStoppedUpstream } = await import("./fastapply-limits");
    expect(isStoppedUpstream(new FirstApplyError("not found", 404))).toBe(true);
    expect(isStoppedUpstream(new FirstApplyError("Cannot cancel a completed or failed automation", 422))).toBe(true);
    expect(isStoppedUpstream(new FirstApplyError("bad", 400))).toBe(true);
    expect(isStoppedUpstream(new FirstApplyError("unavailable", 503))).toBe(false);
    expect(isStoppedUpstream(new Error("network"))).toBe(false);
  });

  it("lets pausing mark an automation that already failed upstream as paused", async () => {
    cancelAutomation.mockRejectedValueOnce(new FirstApplyError("Cannot cancel a completed or failed automation", 422));
    const supabase = fakeSupabase({ ai_agent_configs: { data: [{ id: "c1", first_apply_id: "done" }] } });
    expect(await pauseScoutAiAutomations(supabase, "u")).toEqual({ paused: 1, failed: [] });
  });
});

describe("settleAfterPlanChange", () => {
  const sync = { fastapply_applicant_sync: { data: [{ external_id: "u:p1" }] } };

  it("keeps a customer who still pays for a Scout AI plan running, on that plan's limits", async () => {
    const { settleAfterPlanChange } = await import("./fastapply-limits");
    upsertApplicant.mockResolvedValue({});
    const supabase = fakeSupabase({ ...sync, subscriptions: { data: [row({ plan_code: "ai_essential" })] }, ai_agent_configs: { data: [{ id: "c1", first_apply_id: "fa1" }] } });
    const result = await settleAfterPlanChange(supabase, "u", { pauseUnlessAgentPlan: true });
    expect(upsertApplicant).toHaveBeenCalledWith("u:p1", expect.objectContaining({ monthlyApplicationLimit: 75, dailyApplicationLimit: null }));
    expect(result.paused).toBeNull();
    expect(cancelAutomation).not.toHaveBeenCalled();
  });

  it("stops a customer with no plan left: zero limits and Scout AI paused", async () => {
    const { settleAfterPlanChange } = await import("./fastapply-limits");
    upsertApplicant.mockResolvedValue({});
    cancelAutomation.mockResolvedValue(undefined);
    const supabase = fakeSupabase({ ...sync, subscriptions: { data: [] }, ai_agent_configs: { data: [{ id: "c1", first_apply_id: "fa1" }] } });
    const result = await settleAfterPlanChange(supabase, "u", { pauseUnlessAgentPlan: true });
    expect(upsertApplicant).toHaveBeenCalledWith("u:p1", NO_APPLICATIONS);
    expect(cancelAutomation).toHaveBeenCalledWith("fa1");
    expect(result.paused).toEqual({ paused: 1, failed: [] });
  });

  it("pauses when the plan left is not a Scout AI plan, and never when told not to", async () => {
    const { settleAfterPlanChange } = await import("./fastapply-limits");
    upsertApplicant.mockResolvedValue({});
    cancelAutomation.mockResolvedValue(undefined);
    const human = fakeSupabase({ ...sync, subscriptions: { data: [row({ plan_code: "human_focused", lane: "human" })] }, ai_agent_configs: { data: [{ id: "c1", first_apply_id: "fa1" }] } });
    expect((await settleAfterPlanChange(human, "u", { pauseUnlessAgentPlan: true })).paused).toEqual({ paused: 1, failed: [] });
    cancelAutomation.mockClear();
    const none = fakeSupabase({ ...sync, subscriptions: { data: [] }, ai_agent_configs: { data: [{ id: "c1", first_apply_id: "fa1" }] } });
    expect((await settleAfterPlanChange(none, "u", { pauseUnlessAgentPlan: false })).paused).toBeNull();
    expect(cancelAutomation).not.toHaveBeenCalled();
  });

  it("throws when the remaining plan cannot be read, so the webhook asks for the event again", async () => {
    const { settleAfterPlanChange } = await import("./fastapply-limits");
    const supabase = fakeSupabase({ subscriptions: { data: null, error: { message: "db down" } } });
    await expect(settleAfterPlanChange(supabase, "u", { pauseUnlessAgentPlan: true })).rejects.toBeTruthy();
  });
});

describe("stopProfileAutomation", () => {
  it("cancels the profile's automation, and skips one that is paused or was never created", async () => {
    const { stopProfileAutomation } = await import("./fastapply-limits");
    cancelAutomation.mockResolvedValue(undefined);
    await stopProfileAutomation(fakeSupabase({ ai_agent_configs: { data: [{ id: "c1", first_apply_id: "fa1", status: "active" }] } }), "u", "p1");
    expect(cancelAutomation).toHaveBeenCalledWith("fa1");
    cancelAutomation.mockClear();
    await stopProfileAutomation(fakeSupabase({ ai_agent_configs: { data: [{ id: "c1", first_apply_id: "fa1", status: "paused" }] } }), "u", "p1");
    await stopProfileAutomation(fakeSupabase({ ai_agent_configs: { data: [] } }), "u", "p1");
    expect(cancelAutomation).not.toHaveBeenCalled();
  });

  it("accepts an automation already stopped upstream, and throws on anything else", async () => {
    const { stopProfileAutomation } = await import("./fastapply-limits");
    const supabase = fakeSupabase({ ai_agent_configs: { data: [{ id: "c1", first_apply_id: "fa1", status: "error" }] } });
    cancelAutomation.mockRejectedValueOnce(new FirstApplyError("Cannot cancel a completed or failed automation", 422));
    await expect(stopProfileAutomation(supabase, "u", "p1")).resolves.toBeUndefined();
    cancelAutomation.mockRejectedValueOnce(new FirstApplyError("unavailable", 503));
    await expect(stopProfileAutomation(supabase, "u", "p1")).rejects.toThrow("unavailable");
  });
});
