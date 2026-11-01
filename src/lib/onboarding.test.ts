import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_ENTITLEMENT } from "./entitlements";
import { setHumanAssistantsForTest } from "./human-assistants";

vi.mock("./posthog-server", () => ({ getPostHogServer: () => null }));
vi.mock("./google-analytics", () => ({ sendGoogleAnalyticsEvent: vi.fn(async () => {}) }));
import { POST } from "../pages/api/app/onboarding";

afterEach(() => setHumanAssistantsForTest(null));

async function onboard(lane = "human", options: { phone?: string; savedName?: string; resumeError?: boolean } = {}) {
  const writes: { table: string; value: any }[] = [];
  const supabase = { from(table: string) {
    const chain: any = {};
    for (const method of ["select", "eq", "delete"]) chain[method] = () => chain;
    for (const method of ["insert", "update"]) chain[method] = (value: any) => { writes.push({ table, value }); return chain; };
    const result = () => table === "resumes"
      ? { data: { id: "resume-1", extraction_status: "complete", extracted_data: {} }, error: options.resumeError ? { message: "missing" } : null }
      : { data: { id: "profile-1" }, error: null };
    chain.single = async () => result();
    chain.then = (resolve: any) => Promise.resolve(result()).then(resolve);
    return chain;
  } };
  const form = new FormData();
  Object.entries({ assistant: lane, target_roles: "Engineer", locations: "Remote", resume_id: "resume-1", whatsapp_phone: options.phone ?? "+2348012345678" }).forEach(([key, value]) => form.set(key, value));
  const entitlement = { ...EMPTY_ENTITLEMENT };
  const response = await POST({
    request: new Request("https://applyscout.app/api/app/onboarding", { method: "POST", headers: { origin: "https://applyscout.app" }, body: form }),
    url: new URL("https://applyscout.app/api/app/onboarding"),
    locals: { user: { id: "u1", email: "member@example.com", user_metadata: {} }, supabase, entitlement, scoutProfile: { assistant_name: options.savedName } },
  } as any) as Response;
  return { response, writes, entitlement };
}

describe("dashboard-first onboarding", () => {
  it("reserves an assistant and opens the dashboard without granting paid fulfillment", async () => {
    const { response, writes, entitlement } = await onboard();
    expect(await response.json()).toEqual({ ok: true, redirect: "/dashboard" });
    expect(writes.find(write => write.table === "profiles")?.value).toMatchObject({ onboarding_complete: true, assistant_type: "human", assistant_name: expect.any(String) });
    expect(writes.some(write => write.table === "subscriptions")).toBe(false);
    expect(entitlement.canApply).toBe(false);
  });
  it("preserves an existing assigned assistant", async () => {
    const { writes } = await onboard("human", { savedName: "Clinton" });
    expect(writes.find(write => write.table === "profiles")?.value.assistant_name).toBe("Clinton");
  });
  it("opens AI setup without requiring WhatsApp", async () => {
    const { response, writes } = await onboard("ai", { phone: "" });
    expect(await response.json()).toEqual({ ok: true, redirect: "/dashboard" });
    expect(writes.find(write => write.table === "profiles")?.value).toMatchObject({ assistant_name: "Scout AI", whatsapp_phone: null });
  });
  it("does not invent an assistant when the roster is empty", async () => {
    setHumanAssistantsForTest([]);
    const { response, writes } = await onboard();
    expect(response.status).toBe(200);
    expect(writes.find(write => write.table === "profiles")?.value.assistant_name).toBeNull();
  });
  it("rejects missing WhatsApp for Human before saving anything", async () => {
    const { response, writes } = await onboard("human", { phone: "" });
    expect(response.status).toBe(400);
    expect(writes).toEqual([]);
  });
  it("rejects a resume the member cannot access", async () => {
    const { response, writes } = await onboard("human", { resumeError: true });
    expect(response.status).toBe(400);
    expect(writes).toEqual([]);
  });
});
