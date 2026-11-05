import { beforeEach, describe, expect, it, vi } from "vitest";

const settle = vi.fn();
const push = vi.fn();
const assign = vi.hoisted(() => vi.fn(() => null as any));
let db: ReturnType<typeof fakeDb>;

vi.mock("./dodo", () => ({ verifyWebhookSignature: () => true }));
vi.mock("./server-env", () => ({
  serverEnv: (key: string) => key === "DODO_PRODUCT_HUMAN_FOCUSED" ? "pdt_focused" : key.startsWith("DODO_PRODUCT_") ? undefined : "whsec_test",
}));
vi.mock("./supabase", () => ({ createSupabaseServiceClient: () => db.client }));
vi.mock("./email", () => ({ sendSubscriptionConfirmationEmail: vi.fn() }));
vi.mock("./human-assistants", () => ({ refreshHumanAssistants: vi.fn(async () => {}), assignedHumanAssistant: assign }));
vi.mock("./posthog-server", () => ({ getPostHogServer: () => null }));
vi.mock("./google-analytics", () => ({ sendGoogleAnalyticsEvent: vi.fn(async () => {}) }));
vi.mock("./fastapply-limits", async () => {
  const actual = await vi.importActual<typeof import("./fastapply-limits")>("./fastapply-limits");
  return { ...actual, settleAfterPlanChange: (...args: any[]) => settle(...args), pushApplicantPlanLimits: (...args: any[]) => push(...args) };
});

import { POST } from "../pages/api/billing/webhook";

type Call = [string, ...any[]];
/** Each awaited chain is answered by `answer(table, calls)`; every chain's calls are kept in `chains`. */
function fakeDb(answer: (table: string, calls: Call[]) => { data?: any; error?: any }) {
  const chains: { table: string; calls: Call[] }[] = [];
  const client: any = {
    from(table: string) {
      const entry = { table, calls: [] as Call[] };
      chains.push(entry);
      const chain: any = {};
      for (const method of ["select", "insert", "update", "delete", "eq", "neq", "in", "lt", "is", "ilike", "order", "limit"]) {
        chain[method] = (...args: any[]) => { entry.calls.push([method, ...args]); return chain; };
      }
      const settleWith = () => { const result = answer(table, entry.calls); return { data: result.data ?? null, error: result.error ?? null }; };
      chain.maybeSingle = () => Promise.resolve(settleWith());
      chain.then = (resolve: any, reject: any) => Promise.resolve(settleWith()).then(resolve, reject);
      return chain;
    },
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "ada@example.com" } } }) } },
  };
  return { client, chains };
}
const has = (calls: Call[], ...expected: any[]) => calls.some((call) => JSON.stringify(call) === JSON.stringify(expected));

function deliver(type: string, data: Record<string, any>) {
  return POST({
    request: new Request("https://applyscout.app/api/billing/webhook", {
      method: "POST",
      headers: { "webhook-id": "evt_1", "webhook-timestamp": "1", "webhook-signature": "v1,x" },
      body: JSON.stringify({ type, data: { metadata: { user_id: "u1", plan_code: "ai_plus" }, ...data } }),
    }),
  } as any) as Promise<Response>;
}

const SETTLED = { remaining: null, push: { pushed: [], failed: [] }, paused: null };

beforeEach(() => {
  assign.mockReset().mockReturnValue(null);
  settle.mockReset().mockResolvedValue(SETTLED);
  push.mockReset().mockResolvedValue({ pushed: [], failed: [] });
});

describe("billing webhook", () => {
  it("keeps the onboarding reservation when a human plan activates", async () => {
    assign.mockReturnValue({ name: "Clinton" });
    db = fakeDb((table, calls) => table === "profiles" && has(calls, "select", "assistant_name") ? { data: { assistant_name: "Clinton" } } : {});
    const response = await deliver("payment.succeeded", { payment_id: "pay_human", metadata: { user_id: "u1", plan_code: "human_focused" } });
    expect(response.status).toBe(200);
    expect(assign).toHaveBeenCalledWith("u1", "Clinton");
    const update = db.chains.find(chain => chain.table === "profiles" && chain.calls.some(([method]) => method === "update"));
    expect(update?.calls.find(([method]) => method === "update")?.[1]).toMatchObject({ assistant_type: "human", assistant_name: "Clinton" });
  });

  it("ends only the subscription the event names, then settles on what the customer still pays for", async () => {
    db = fakeDb((table, calls) => (table === "subscriptions" && calls.some(([m]) => m === "update") ? { data: [{ id: "row-a" }] } : {}));
    const response = await deliver("subscription.cancelled", { subscription_id: "sub_A" });
    expect(response.status).toBe(200);
    const updates = db.chains.filter((chain) => chain.table === "subscriptions" && chain.calls.some(([m]) => m === "update"));
    expect(updates).toHaveLength(1);
    expect(has(updates[0].calls, "eq", "dodo_subscription_id", "sub_A")).toBe(true);
    expect(has(updates[0].calls, "in", "status", ["active", "past_due"])).toBe(true);
    expect(updates[0].calls.some(([m, column]) => m === "eq" && column === "plan_code")).toBe(false);
    expect(settle).toHaveBeenCalledWith(db.client, "u1", { pauseUnlessAgentPlan: true });
  });

  it("falls back to the plan's own rows when none carries the subscription id", async () => {
    let first = true;
    db = fakeDb((table, calls) => {
      if (table !== "subscriptions" || !calls.some(([m]) => m === "update")) return {};
      const result = first ? { data: [] } : { data: [{ id: "row-a" }] };
      first = false;
      return result;
    });
    await deliver("subscription.expired", { subscription_id: "sub_A" });
    const updates = db.chains.filter((chain) => chain.table === "subscriptions" && chain.calls.some(([m]) => m === "update"));
    expect(updates).toHaveLength(2);
    expect(has(updates[1].calls, "eq", "plan_code", "ai_plus")).toBe(true);
    // Only rows from before Scout kept the id: a row naming another subscription is another purchase.
    expect(has(updates[1].calls, "is", "dodo_subscription_id", null)).toBe(true);
  });

  it("keeps the plan-wide match for an event that names no subscription", async () => {
    db = fakeDb((table, calls) => (table === "subscriptions" && calls.some(([m]) => m === "update") ? { data: [{ id: "row-a" }] } : {}));
    await deliver("subscription.cancelled", {});
    const update = db.chains.find((chain) => chain.table === "subscriptions" && chain.calls.some(([m]) => m === "update"));
    expect(has(update!.calls, "eq", "plan_code", "ai_plus")).toBe(true);
    expect(update!.calls.some(([m]) => m === "is")).toBe(false);
  });

  it("retires a plan whose period ended when the customer buys again, leaving the new plan alone", async () => {
    db = fakeDb(() => ({}));
    const response = await deliver("subscription.active", { subscription_id: "sub_new", next_billing_date: "2099-01-01T00:00:00Z" });
    expect(response.status).toBe(200);
    const updates = db.chains.filter((chain) => chain.table === "subscriptions" && chain.calls.some(([m]) => m === "update"));
    expect(updates).toHaveLength(1);
    expect(updates[0].calls.find(([m]) => m === "update")?.[1]).toMatchObject({ status: "expired" });
    expect(has(updates[0].calls, "eq", "user_id", "u1")).toBe(true);
    expect(has(updates[0].calls, "eq", "status", "active")).toBe(true);
    expect(updates[0].calls.some(([m, column]) => m === "lt" && column === "current_period_end")).toBe(true);
  });

  it("releases the event when a lapsed plan cannot be retired, so the retry finishes the job", async () => {
    db = fakeDb((table, calls) => (table === "subscriptions" && calls.some(([m]) => m === "lt") ? { error: { message: "write failed" } } : {}));
    const response = await deliver("subscription.active", { subscription_id: "sub_new" });
    expect(response.status).toBe(500);
    expect(db.chains.some((chain) => chain.table === "webhook_events" && chain.calls.some(([m]) => m === "delete"))).toBe(true);
  });

  it("puts only the renewing subscription past due on a failed payment, and never pauses", async () => {
    db = fakeDb((table, calls) => (table === "subscriptions" && calls.some(([m]) => m === "update") ? { data: [{ id: "row-a" }] } : {}));
    await deliver("payment.failed", { subscription_id: "sub_A" });
    const update = db.chains.find((chain) => chain.table === "subscriptions" && chain.calls.some(([m]) => m === "update"))!;
    expect(update.calls.find(([m]) => m === "update")?.[1]).toMatchObject({ status: "past_due" });
    expect(has(update.calls, "eq", "dodo_subscription_id", "sub_A")).toBe(true);
    expect(settle).toHaveBeenCalledWith(db.client, "u1", { pauseUnlessAgentPlan: false });
  });

  it("changes no plan when a first payment fails (there is no subscription yet)", async () => {
    db = fakeDb(() => ({}));
    expect((await deliver("payment.failed", {})).status).toBe(200);
    expect(db.chains.some((chain) => chain.table === "subscriptions")).toBe(false);
    expect(settle).not.toHaveBeenCalled();
  });

  it("releases the recorded event when a write fails, so Dodo's retry runs it again", async () => {
    db = fakeDb((table, calls) => (table === "subscriptions" && calls.some(([m]) => m === "insert") ? { error: { message: "column current_period_start does not exist" } } : {}));
    const response = await deliver("payment.succeeded", { payment_id: "pay_1" });
    expect(response.status).toBe(500);
    const release = db.chains.find((chain) => chain.table === "webhook_events" && chain.calls.some(([m]) => m === "delete"));
    expect(release && has(release.calls, "eq", "dodo_event_id", "evt_1")).toBe(true);
  });

  it("acknowledges a repeated delivery without doing anything", async () => {
    db = fakeDb((table, calls) => (table === "webhook_events" && calls.some(([m]) => m === "insert") ? { error: { code: "23505", message: "duplicate" } } : {}));
    const response = await deliver("subscription.cancelled", { subscription_id: "sub_A" });
    expect(await response.json()).toEqual({ ok: true, duplicate: true });
    expect(db.chains.some((chain) => chain.table === "subscriptions")).toBe(false);
  });

  describe("a payment made outside Scout's checkout (no metadata)", () => {
    const unlabelled = { payment_id: "pay_2", metadata: {}, product_cart: [{ product_id: "pdt_focused", quantity: 1 }], customer: { customer_id: "cus_T", email: "Tahnee@example.com" } };
    const writes = (table = "subscriptions") => db.chains.filter((chain) => chain.table === table && chain.calls.some(([m]) => m === "insert" || m === "update"));

    it("is matched to the customer by their Dodo customer id and starts a fresh period that replaces the used-up row", async () => {
      db = fakeDb((table, calls) => {
        if (table === "subscriptions" && has(calls, "eq", "dodo_customer_id", "cus_T") && !calls.some(([m]) => m === "update")) return { data: [{ user_id: "u9" }, { user_id: "u9" }] };
        if (table === "subscriptions" && calls.some(([m]) => m === "insert")) return { data: [{ id: "row-new" }] };
        return {};
      });
      const response = await deliver("payment.succeeded", unlabelled);
      expect(response.status).toBe(200);
      const insert = writes().find((chain) => chain.calls.some(([m]) => m === "insert"))!;
      expect(insert.calls.find(([m]) => m === "insert")?.[1]).toMatchObject({ user_id: "u9", plan_code: "human_focused", applications_used: 0, applications_quota: 250 });
      const replaced = writes().find((chain) => has(chain.calls, "neq", "id", "row-new"))!;
      expect(replaced.calls.find(([m]) => m === "update")?.[1]).toMatchObject({ status: "expired" });
      expect(has(replaced.calls, "eq", "user_id", "u9")).toBe(true);
      expect(has(replaced.calls, "eq", "plan_code", "human_focused")).toBe(true);
      expect(has(replaced.calls, "is", "dodo_subscription_id", null)).toBe(true);
    });

    it("does not fall back to email when the Dodo customer maps to multiple accounts", async () => {
      db = fakeDb((table, calls) => {
        if (table === "subscriptions" && has(calls, "eq", "dodo_customer_id", "cus_T")) return { data: [{ user_id: "u7" }, { user_id: "u8" }] };
        if (table === "profiles") return { data: [{ user_id: "u7" }] };
        return {};
      });
      expect(await (await deliver("payment.succeeded", unlabelled)).json()).toEqual({ ok: true, ignored: true });
      expect(writes()).toHaveLength(0);
      expect(db.chains.some(chain => chain.table === "profiles")).toBe(false);
    });

    it("does not fall back to customer when a subscription maps to multiple accounts", async () => {
      db = fakeDb((table, calls) => table === "subscriptions" && has(calls, "eq", "dodo_subscription_id", "sub_ambiguous")
        ? { data: [{ user_id: "u7" }, { user_id: "u8" }] } : { data: [{ user_id: "u7" }] });
      expect(await (await deliver("subscription.active", { ...unlabelled, subscription_id: "sub_ambiguous" })).json()).toEqual({ ok: true, ignored: true });
      expect(writes()).toHaveLength(0);
      expect(db.chains.some(chain => has(chain.calls, "eq", "dodo_customer_id", "cus_T"))).toBe(false);
    });

    it("finishes a partially written payment without inserting again or resetting its usage", async () => {
      db = fakeDb((table, calls) => {
        if (table === "subscriptions" && has(calls, "eq", "dodo_customer_id", "cus_T")) return { data: [{ user_id: "u9" }] };
        if (table === "subscriptions" && has(calls, "eq", "dodo_payment_id", "pay_2")) return { data: { id: "row-new", user_id: "u9", plan_code: "human_focused", applications_used: 12, current_period_start: "2026-11-01T00:00:00Z", current_period_end: null } };
        return {};
      });
      expect((await deliver("payment.succeeded", unlabelled)).status).toBe(200);
      expect(writes().some(chain => chain.calls.some(([m]) => m === "insert"))).toBe(false);
      const update = writes().find(chain => has(chain.calls, "eq", "id", "row-new"));
      expect(update?.calls.find(([m]) => m === "update")?.[1]).toMatchObject({ applications_used: 12, current_period_start: "2026-11-01T00:00:00Z" });
      expect(writes().some(chain => has(chain.calls, "neq", "id", "row-new"))).toBe(true);
    });

    it("falls back to the one profile with the payer's email", async () => {
      db = fakeDb((table, calls) => {
        if (table === "profiles" && calls.some(([m]) => m === "ilike")) return { data: [{ user_id: "u7" }] };
        if (table === "subscriptions" && calls.some(([m]) => m === "insert")) return { data: [{ id: "row-new" }] };
        return {};
      });
      expect((await deliver("payment.succeeded", unlabelled)).status).toBe(200);
      const insert = writes().find((chain) => chain.calls.some(([m]) => m === "insert"))!;
      expect(insert.calls.find(([m]) => m === "insert")?.[1]).toMatchObject({ user_id: "u7", plan_code: "human_focused" });
    });

    it("changes nothing when two profiles share the payer's email", async () => {
      db = fakeDb((table, calls) => (table === "profiles" && calls.some(([m]) => m === "ilike") ? { data: [{ user_id: "u7" }, { user_id: "u8" }] } : {}));
      const response = await deliver("payment.succeeded", unlabelled);
      expect(await response.json()).toEqual({ ok: true, ignored: true });
      expect(writes()).toHaveLength(0);
    });

    it("ignores a product that is not a Scout plan (FastApply shares the Dodo account) without looking anyone up", async () => {
      db = fakeDb(() => ({ data: [{ user_id: "u9" }] }));
      const response = await deliver("payment.succeeded", { ...unlabelled, product_cart: [{ product_id: "pdt_fastapply", quantity: 1 }] });
      expect(await response.json()).toEqual({ ok: true, ignored: true });
      expect(db.chains.some((chain) => chain.table === "subscriptions" || chain.table === "profiles")).toBe(false);
    });

    it("releases the event when the customer lookup fails, so Dodo's retry runs it again", async () => {
      db = fakeDb((table, calls) => (table === "subscriptions" && has(calls, "eq", "dodo_customer_id", "cus_T") ? { error: { message: "timeout" } } : {}));
      expect((await deliver("payment.succeeded", unlabelled)).status).toBe(500);
      expect(db.chains.some((chain) => chain.table === "webhook_events" && chain.calls.some(([m]) => m === "delete"))).toBe(true);
    });
  });

  it("leaves the customer's other rows alone when a payment names its subscription", async () => {
    db = fakeDb((table, calls) => (table === "subscriptions" && calls.some(([m]) => m === "insert") ? { data: [{ id: "row-new" }] } : {}));
    await deliver("subscription.active", { subscription_id: "sub_new" });
    expect(db.chains.some((chain) => chain.calls.some(([m]) => m === "neq"))).toBe(false);
  });
});
