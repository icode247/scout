import { beforeEach, describe, expect, it, vi } from "vitest";
import { FIRST_TOUCH_KEY, encodeFirstTouch, parseFirstTouch } from "./attribution";

const sent = vi.hoisted(() => [] as any[]);
const state = vi.hoisted(() => ({ supabase: null as any }));
vi.mock("./posthog-server", () => ({ getPostHogServer: () => null }));
vi.mock("./google-analytics", async (original) => ({
  ...(await original<typeof import("./google-analytics")>()),
  sendGoogleAnalyticsEvent: vi.fn(async (event: any) => { sent.push(event); }),
}));
vi.mock("./supabase", () => ({ createSupabaseServerClient: () => state.supabase }));
vi.mock("./server-env", () => ({ serverEnv: (key: string) => (key === "PUBLIC_GA_MEASUREMENT_ID" ? "G-TEST1" : undefined) }));
import { POST } from "../pages/auth/callback";

function fakeSupabase(user: any, options: { alreadyCaptured?: boolean; updateError?: boolean } = {}) {
  const updates: { value: any; filters: [string, string, unknown][] }[] = [];
  return {
    updates,
    sealCookies() {},
    auth: { verifyOtp: async () => ({ data: { user }, error: null }) },
    from(table: string) {
      const write = { value: null as any, filters: [] as [string, string, unknown][] };
      const chain: any = {
        update(value: any) { write.value = value; updates.push(write); return chain; },
        eq(column: string, value: unknown) { write.filters.push(["eq", column, value]); return chain; },
        is(column: string, value: unknown) { write.filters.push(["is", column, value]); return chain; },
        select() { return chain; },
        async maybeSingle() {
          if (options.updateError) return { data: null, error: { code: "42703", message: "column does not exist" } };
          return { data: options.alreadyCaptured || table !== "profiles" ? null : { user_id: user.id }, error: null };
        },
      };
      return chain;
    },
  };
}

async function signIn(cookies: Record<string, string>) {
  const form = new FormData();
  form.set("token_hash", "hash");
  form.set("type", "email");
  form.set("next", "/onboarding");
  return POST({
    request: new Request("https://applyscout.app/auth/callback", { method: "POST", body: form }),
    url: new URL("https://applyscout.app/auth/callback"),
    cookies: { get: (name: string) => (name in cookies ? { value: cookies[name] } : undefined) },
    redirect: (to: string, status: number) => new Response(null, { status, headers: { location: to } }),
  } as any) as Promise<Response>;
}

const touch = parseFirstTouch("https://applyscout.app/pricing?utm_source=chatgpt.com", "https://chatgpt.com/", new Date("2026-11-10T00:00:00Z"));
const cookies = {
  [FIRST_TOUCH_KEY]: decodeURIComponent(encodeFirstTouch(touch)),
  _ga: "GA1.1.123456789.1731400000",
  _ga_TEST1: "GS2.1.s1731400500$o2$g1$t1731400600$j0$l0$h0",
};

beforeEach(() => { sent.length = 0; });

describe("signup tracking in /auth/callback", () => {
  it("saves the first touch once and sends sign_up in the browser's GA session", async () => {
    const user = { id: "u1", created_at: new Date(Date.now() - 60_000).toISOString(), user_metadata: {} };
    state.supabase = fakeSupabase(user);
    const response = await signIn(cookies);
    expect(response.headers.get("location")).toBe("/onboarding");
    const update = state.supabase.updates[0];
    expect(update.value).toMatchObject({ first_utm_source: "chatgpt.com", first_ai_source: "chatgpt", first_landing_path: "/pricing", attribution_captured_at: expect.any(String) });
    expect(update.filters).toContainEqual(["is", "attribution_captured_at", null]);
    const signUp = sent.find((event) => event.name === "sign_up");
    expect(signUp).toMatchObject({ clientId: "123456789.1731400000", userId: "u1", params: { method: "magic_link", session_id: "1731400500" } });
    expect(JSON.stringify(signUp)).not.toContain("@");
  });

  it("sends no sign_up when the signup was already recorded", async () => {
    const user = { id: "u1", created_at: new Date(Date.now() - 60_000).toISOString(), user_metadata: {} };
    state.supabase = fakeSupabase(user, { alreadyCaptured: true });
    await signIn(cookies);
    expect(sent.some((event) => event.name === "sign_up")).toBe(false);
  });

  it("leaves existing members alone", async () => {
    const user = { id: "u1", created_at: "2026-08-01T00:00:00Z", user_metadata: {} };
    state.supabase = fakeSupabase(user);
    await signIn(cookies);
    expect(state.supabase.updates).toEqual([]);
    expect(sent.some((event) => event.name === "sign_up")).toBe(false);
  });

  it("still signs the member in when the columns are missing", async () => {
    const user = { id: "u1", created_at: new Date().toISOString(), user_metadata: {} };
    state.supabase = fakeSupabase(user, { updateError: true });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await signIn(cookies);
    errors.mockRestore();
    expect(response.headers.get("location")).toBe("/onboarding");
    expect(sent.some((event) => event.name === "sign_up")).toBe(false);
  });
});
