import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Drives the extension's service worker (extension/src/background.js) through
 * the same messages the side panel sends, against a fake chrome API.
 */
const REDIRECT = "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/connected";
const SESSION = `${REDIRECT}#access_token=a&refresh_token=r&expires_at=${Math.floor(Date.now() / 1000) + 3600}&supabase_url=https%3A%2F%2Fx.supabase.co&supabase_key=k`;

type Listener = (message: unknown, sender: unknown, respond: (value: any) => void) => boolean;

async function loadWorker(launchWebAuthFlow: (options: { url: string; interactive: boolean }) => Promise<string>) {
  const store: Record<string, unknown> = {};
  let listener: Listener | undefined;
  const launch = vi.fn(launchWebAuthFlow);
  vi.stubGlobal("chrome", {
    runtime: { onInstalled: { addListener: () => {} }, onStartup: { addListener: () => {} }, onMessage: { addListener: (fn: Listener) => { listener = fn; } } },
    sidePanel: { setPanelBehavior: async () => {} },
    identity: { getRedirectURL: () => REDIRECT, launchWebAuthFlow: launch },
    storage: { local: {
      get: async (keys: string | string[]) => Object.fromEntries([keys].flat().filter((key) => key in store).map((key) => [key, store[key]])),
      set: async (values: Record<string, unknown>) => { Object.assign(store, values); },
      remove: async (keys: string | string[]) => { for (const key of [keys].flat()) delete store[key]; },
    } },
  });
  vi.resetModules();
  // @ts-expect-error the service worker is plain JavaScript with no types
  await import("../../extension/src/background.js");
  const send = (type: string) => new Promise<any>((resolve) => listener!({ type }, {}, resolve));
  return { send, launch, store };
}

describe("extension connection", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("connects without a window when the member is already signed in to Scout", async () => {
    const worker = await loadWorker(async () => SESSION);
    expect((await worker.send("SCOUT_AUTH_STATUS")).data).toEqual({ connected: true });
    expect(worker.launch).toHaveBeenCalledWith(expect.objectContaining({ interactive: false, url: expect.stringContaining("https://applyscout.app/extension/connect?redirect_uri=") }));
    expect(worker.store.scoutAuth).toMatchObject({ accessToken: "a", refreshToken: "r" });
  });

  it("shows Connect instead of an error when the member is signed out", async () => {
    const worker = await loadWorker(async () => { throw new Error("User interaction required."); });
    expect(await worker.send("SCOUT_AUTH_STATUS")).toEqual({ ok: true, data: { connected: false } });
  });

  it("stays disconnected after Disconnect until the member connects again", async () => {
    const worker = await loadWorker(async () => SESSION);
    await worker.send("SCOUT_AUTH_STATUS");
    await worker.send("SCOUT_DISCONNECT");
    worker.launch.mockClear();
    expect((await worker.send("SCOUT_AUTH_STATUS")).data).toEqual({ connected: false });
    expect(worker.launch).not.toHaveBeenCalled();

    expect((await worker.send("SCOUT_CONNECT")).data).toEqual({ connected: true });
    expect(worker.launch).toHaveBeenCalledWith(expect.objectContaining({ interactive: true }));
    delete worker.store.scoutAuth;
    expect((await worker.send("SCOUT_AUTH_STATUS")).data).toEqual({ connected: true });
  });
});
