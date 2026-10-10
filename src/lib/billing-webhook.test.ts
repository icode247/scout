import { beforeEach, describe, expect, it, vi } from "vitest";

const settle = vi.fn();
const push = vi.fn();
let db: ReturnType<typeof fakeDb>;

vi.mock("./dodo", () => ({ verifyWebhookSignature: () => true }));
vi.mock("./server-env", () => ({ serverEnv: () => "whsec_test" }));
vi.mock("./supabase", () => ({ createSupabaseServiceClient: () => db.client }));
vi.mock("./email", () => ({ sendSubscriptionConfirmationEmail: vi.fn() }));
vi.mock("./human-assistants", () => ({ refreshHumanAssistants: vi.fn(async () => {}), assignedHumanAssistant: () => null }));
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
      for (const method of ["select", "insert", "update", "delete", "eq", "in", "order", "limit"]) {
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
  settle.mockReset().mockResolvedValue(SETTLED);
  push.mockReset().mockResolvedValue({ pushed: [], failed: [] });
});

describe("billing webhook", () => {
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
});
