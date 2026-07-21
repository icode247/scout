const DEFAULT_SITE_URL = "https://getscout.app";
const AUTH_KEY = "scoutAuth";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

async function getSettings() {
  const stored = await chrome.storage.local.get([AUTH_KEY, "scoutSiteUrl"]);
  return {
    auth: stored[AUTH_KEY] || null,
    siteUrl: String(stored.scoutSiteUrl || DEFAULT_SITE_URL).replace(/\/$/, ""),
  };
}

async function connect() {
  const { siteUrl } = await getSettings();
  const redirectUri = chrome.identity.getRedirectURL("connected");
  const url = `${siteUrl}/extension/connect?redirect_uri=${encodeURIComponent(redirectUri)}`;
  const resultUrl = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  if (!resultUrl) throw new Error("Scout connection was cancelled.");
  const hash = new URL(resultUrl).hash.slice(1);
  const params = new URLSearchParams(hash);
  const auth = {
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
    expiresAt: Number(params.get("expires_at")),
    supabaseUrl: params.get("supabase_url"),
    supabaseKey: params.get("supabase_key"),
  };
  if (!auth.accessToken || !auth.refreshToken || !auth.supabaseUrl || !auth.supabaseKey) {
    throw new Error("Scout returned an incomplete session. Please try again.");
  }
  await chrome.storage.local.set({ [AUTH_KEY]: auth });
  return { connected: true };
}

async function disconnect() {
  await chrome.storage.local.remove(AUTH_KEY);
  return { connected: false };
}

async function validAccessToken() {
  const { auth } = await getSettings();
  if (!auth?.accessToken) return null;
  if (auth.expiresAt && auth.expiresAt > Math.floor(Date.now() / 1000) + 90) return auth.accessToken;
  if (!auth.refreshToken || !auth.supabaseUrl || !auth.supabaseKey) return null;

  const response = await fetch(`${auth.supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: auth.supabaseKey },
    body: JSON.stringify({ refresh_token: auth.refreshToken }),
  });
  if (!response.ok) {
    await chrome.storage.local.remove(AUTH_KEY);
    return null;
  }
  const data = await response.json();
  const next = {
    ...auth,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || auth.refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
  };
  await chrome.storage.local.set({ [AUTH_KEY]: next });
  return next.accessToken;
}

async function api(path, init = {}) {
  const token = await validAccessToken();
  if (!token) throw Object.assign(new Error("Connect Scout to continue."), { code: "not_connected", status: 401 });
  const { siteUrl } = await getSettings();
  const response = await fetch(`${siteUrl}${path}`, {
    ...init,
    headers: { ...(init.body ? { "content-type": "application/json" } : {}), authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) await chrome.storage.local.remove(AUTH_KEY);
  if (!response.ok) throw Object.assign(new Error(data.error || "Scout could not complete that request."), { status: response.status, data });
  return data;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const run = async () => {
    switch (message?.type) {
      case "SCOUT_AUTH_STATUS": return { connected: Boolean(await validAccessToken()) };
      case "SCOUT_CONNECT": return connect();
      case "SCOUT_DISCONNECT": return disconnect();
      case "SCOUT_GET_PROFILES": return api("/api/extension/jobs");
      case "SCOUT_SEND_JOB": return api("/api/extension/jobs", { method: "POST", body: JSON.stringify(message.payload) });
      case "SCOUT_GET_SETTINGS": return getSettings();
      case "SCOUT_SET_SITE": {
        const value = String(message.siteUrl || "").trim().replace(/\/$/, "");
        if (!/^https?:\/\/(localhost|127\.0\.0\.1|([a-z0-9-]+\.)*getscout\.app)(:\d+)?$/i.test(value)) throw new Error("Enter a Scout website URL.");
        await chrome.storage.local.set({ scoutSiteUrl: value });
        await chrome.storage.local.remove(AUTH_KEY);
        return { siteUrl: value };
      }
      default: throw new Error("Unknown Scout request.");
    }
  };
  run().then((data) => sendResponse({ ok: true, data })).catch((error) => sendResponse({ ok: false, error: error.message, status: error.status || 0, code: error.code || "request_failed" }));
  return true;
});
