import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./first-apply", async () => {
  const actual = await vi.importActual<typeof import("./first-apply")>("./first-apply");
  return { ...actual, firstApply: { ...actual.firstApply, cancelAutomation: vi.fn(), deleteApplicant: vi.fn() } };
});

import { FirstApplyError, firstApply } from "./first-apply";
import { retireProfileUpstream } from "./fastapply-applicant";

const fa = firstApply as unknown as Record<string, ReturnType<typeof vi.fn>>;

/** Canned rows per table; every chain on a table answers with its first row. */
function fakeDb(tables: Record<string, any[] | { error: string }>) {
  return {
    from(table: string) {
      const chain: any = {};
      for (const method of ["select", "eq"]) chain[method] = () => chain;
      chain.maybeSingle = async () => {
        const rows = tables[table];
        if (rows && !Array.isArray(rows)) return { data: null, error: { message: rows.error } };
        return { data: rows?.[0] ?? null, error: null };
      };
      return chain;
    },
  } as any;
}

beforeEach(() => { fa.cancelAutomation.mockReset().mockResolvedValue(undefined); fa.deleteApplicant.mockReset().mockResolvedValue(undefined); });

describe("retireProfileUpstream (before a job profile is deleted)", () => {
  it("cancels the profile's Scout AI automation and deletes FastApply's applicant", async () => {
    await retireProfileUpstream(fakeDb({
      ai_agent_configs: [{ id: "c1", first_apply_id: "fa1", status: "active" }],
      fastapply_applicant_sync: [{ external_id: "u1:p1" }],
    }), "u1", "p1");
    expect(fa.cancelAutomation).toHaveBeenCalledWith("fa1");
    expect(fa.deleteApplicant).toHaveBeenCalledWith("u1:p1");
  });

  it("calls FastApply for nothing it never had", async () => {
    await retireProfileUpstream(fakeDb({ ai_agent_configs: [], fastapply_applicant_sync: [] }), "u1", "p1");
    expect(fa.cancelAutomation).not.toHaveBeenCalled();
    expect(fa.deleteApplicant).not.toHaveBeenCalled();
  });

  it("accepts an applicant FastApply no longer has", async () => {
    fa.deleteApplicant.mockRejectedValueOnce(new FirstApplyError("not found", 404));
    await expect(retireProfileUpstream(fakeDb({ fastapply_applicant_sync: [{ external_id: "u1:p1" }] }), "u1", "p1")).resolves.toBeUndefined();
  });

  it("refuses (throws) when FastApply could not confirm, so nothing is deleted", async () => {
    fa.cancelAutomation.mockRejectedValueOnce(new FirstApplyError("unavailable", 503));
    await expect(retireProfileUpstream(fakeDb({ ai_agent_configs: [{ id: "c1", first_apply_id: "fa1", status: "active" }] }), "u1", "p1")).rejects.toThrow("unavailable");
    expect(fa.deleteApplicant).not.toHaveBeenCalled();
    fa.deleteApplicant.mockRejectedValueOnce(new FirstApplyError("unavailable", 503));
    await expect(retireProfileUpstream(fakeDb({ fastapply_applicant_sync: [{ external_id: "u1:p1" }] }), "u1", "p1")).rejects.toThrow("unavailable");
  });
});
