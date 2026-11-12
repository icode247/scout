/**
 * First-touch attribution: where a visitor first came from, kept in the browser until they sign up.
 *
 * On a visitor's first page view, `captureFirstTouch` (run on every page by
 * components/FirstTouch.astro) stores the landing URL's utm_* tags and gclid, the referring
 * site, the landing path and the time in the `scout_ft` first-party cookie, mirrored to
 * localStorage. A later visit never replaces it. When that visitor signs up, /auth/callback
 * reads the cookie and copies it onto their profile once (`attributionColumns`).
 *
 * Privacy: only the referrer's origin and path and the landing page's path are kept, never a
 * query string, so an email or token in a URL is not stored. Nothing here is sent to analytics.
 *
 * Client-safe: this module is bundled into the browser, so it must not import server code.
 */

export const FIRST_TOUCH_KEY = "scout_ft";
/** 180 days. Safari caps script-set cookies at 7 days; localStorage then restores the cookie. */
export const FIRST_TOUCH_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

export type FirstTouch = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  gclid: string | null;
  /** Origin and path of the referring page; null for direct visits and internal navigation. */
  referrer: string | null;
  /** The answer engine that sent the visit (chatgpt, perplexity, …), from the referrer or utm_source. */
  ai_source: string | null;
  landing_path: string;
  /** ISO time of the first page view. */
  at: string;
};

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
const MAX = { tag: 150, gclid: 200, referrer: 300, path: 300 } as const;

/**
 * Answer engines by the hostname their links arrive from (a subdomain also matches). Google AI
 * Mode and AI Overviews send a plain google.com referrer, so they cannot be told apart here.
 */
const AI_HOSTS: Record<string, string> = {
  "chatgpt.com": "chatgpt",
  "chat.openai.com": "chatgpt",
  "openai.com": "chatgpt",
  "perplexity.ai": "perplexity",
  "gemini.google.com": "gemini",
  "bard.google.com": "gemini",
  "copilot.microsoft.com": "copilot",
  "copilot.cloud.microsoft": "copilot",
  "claude.ai": "claude",
  "meta.ai": "meta_ai",
  "deepseek.com": "deepseek",
  "grok.com": "grok",
  "you.com": "you",
  "phind.com": "phind",
  "poe.com": "poe",
  "chat.mistral.ai": "mistral",
};
const AI_LABELS = new Set(Object.values(AI_HOSTS));

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  // Control characters out, whitespace collapsed: these end up in a database column and a cookie.
  const text = value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
  return text || null;
}

function hostOf(value: string): string | null {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function aiForHost(host: string | null): string | null {
  if (!host) return null;
  for (const [aiHost, label] of Object.entries(AI_HOSTS)) {
    if (host === aiHost || host.endsWith(`.${aiHost}`)) return label;
  }
  return null;
}

/** The answer engine behind a visit, from its referrer or a utm_source like "chatgpt.com". */
export function aiSourceOf(referrer: string | null | undefined, utmSource?: string | null): string | null {
  const fromReferrer = referrer ? aiForHost(hostOf(referrer)) : null;
  if (fromReferrer) return fromReferrer;
  const source = (utmSource || "").trim().toLowerCase();
  if (!source) return null;
  if (AI_LABELS.has(source)) return source;
  return /^[a-z0-9.-]+$/.test(source) && source.includes(".") ? aiForHost(hostOf(source)) : null;
}

/** Referrer reduced to origin + path, or null when it is empty, unparseable or this site. */
export function cleanReferrer(referrer: string | null | undefined, ownHost: string): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const own = ownHost.toLowerCase().replace(/^www\./, "");
    if (host === own) return null;
    return clean(`${url.origin}${url.pathname === "/" ? "/" : url.pathname}`, MAX.referrer);
  } catch {
    return null;
  }
}

/** The first touch a page view represents: its URL's tags, the referrer and the time. */
export function parseFirstTouch(pageUrl: string, referrer: string | null | undefined, now: Date = new Date()): FirstTouch {
  const url = new URL(pageUrl);
  const tag = (key: string) => clean(url.searchParams.get(key), MAX.tag);
  const tags = Object.fromEntries(UTM_KEYS.map((key) => [key, tag(key)])) as Pick<FirstTouch, (typeof UTM_KEYS)[number]>;
  const cleanedReferrer = cleanReferrer(referrer, url.hostname);
  return {
    ...tags,
    gclid: clean(url.searchParams.get("gclid"), MAX.gclid),
    referrer: cleanedReferrer,
    ai_source: aiSourceOf(cleanedReferrer, tags.utm_source),
    landing_path: clean(url.pathname, MAX.path) || "/",
    at: now.toISOString(),
  };
}

/**
 * A stored first touch, re-validated: the cookie is user-controlled, so only known fields of
 * the right type and length survive. Null when the value is missing or not a first touch.
 */
export function decodeFirstTouch(raw: unknown): FirstTouch | null {
  let value: any = raw;
  if (typeof value === "string") {
    if (!value) return null;
    try { value = JSON.parse(value); }
    catch {
      try { value = JSON.parse(decodeURIComponent(value)); } catch { return null; }
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const at = clean(value.at, 40);
  const landing = clean(value.landing_path, MAX.path);
  if (!at || Number.isNaN(Date.parse(at)) || !landing || !landing.startsWith("/")) return null;
  const tags = Object.fromEntries(UTM_KEYS.map((key) => [key, clean(value[key], MAX.tag)])) as Pick<FirstTouch, (typeof UTM_KEYS)[number]>;
  const referrer = clean(value.referrer, MAX.referrer);
  return {
    ...tags,
    gclid: clean(value.gclid, MAX.gclid),
    referrer,
    ai_source: aiSourceOf(referrer, tags.utm_source),
    landing_path: landing,
    at: new Date(at).toISOString(),
  };
}

export function encodeFirstTouch(touch: FirstTouch): string {
  return encodeURIComponent(JSON.stringify(touch));
}

/** The profile columns (migration 202611120001) a first touch fills at signup. */
export function attributionColumns(touch: FirstTouch | null) {
  return {
    first_utm_source: touch?.utm_source ?? null,
    first_utm_medium: touch?.utm_medium ?? null,
    first_utm_campaign: touch?.utm_campaign ?? null,
    first_utm_term: touch?.utm_term ?? null,
    first_utm_content: touch?.utm_content ?? null,
    first_gclid: touch?.gclid ?? null,
    first_referrer: touch?.referrer ?? null,
    first_ai_source: touch?.ai_source ?? null,
    first_landing_path: touch?.landing_path ?? null,
    first_touch_at: touch?.at ?? null,
  };
}

/**
 * A sign-in this soon after the account was created is its signup. A sign-in link is valid for
 * an hour and the account exists from the first link request, so the window is generous; the
 * once-only attribution_captured_at stamp is what stops a second sign-in counting again.
 */
export const SIGNUP_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isNewSignup(createdAt: string | null | undefined, now: number = Date.now()) {
  const created = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(created) && now - created >= -60_000 && now - created < SIGNUP_WINDOW_MS;
}

/** Answers for "How did you hear about Scout?" in onboarding; `other` carries free text. */
export const HEARD_FROM_OPTIONS = [
  ["google", "Google search"],
  ["chatgpt", "ChatGPT"],
  ["other_ai", "Another AI assistant (Perplexity, Gemini, Copilot…)"],
  ["linkedin", "LinkedIn"],
  ["instagram", "Instagram"],
  ["reddit", "Reddit"],
  ["youtube", "YouTube"],
  ["friend", "A friend or colleague"],
  ["other", "Something else"],
] as const;

/** The stored `heard_from` value: a known option, "other: <text>", or null when unanswered. */
export function heardFromValue(choice: unknown, otherText?: unknown): string | null {
  const picked = typeof choice === "string" ? choice.trim() : "";
  if (!HEARD_FROM_OPTIONS.some(([value]) => value === picked)) return null;
  if (picked !== "other") return picked;
  const detail = clean(otherText, 120);
  return detail ? `other: ${detail}` : "other";
}

type FirstTouchEnv = {
  url: string;
  referrer: string;
  now?: Date;
  readCookie: () => string | null;
  writeCookie: (value: string) => void;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
};

/**
 * Records this page view as the first touch unless one is already stored (cookie, then
 * localStorage). An existing one is copied back to whichever store lost it. Never throws:
 * blocked cookies or storage must not break the page.
 */
export function captureFirstTouch(env: FirstTouchEnv): FirstTouch | null {
  const read = (get: () => string | null | undefined) => { try { return decodeFirstTouch(get() ?? null); } catch { return null; } };
  const fromCookie = read(env.readCookie);
  const fromStorage = env.storage ? read(() => env.storage!.getItem(FIRST_TOUCH_KEY)) : null;
  let touch = fromCookie || fromStorage;
  try {
    if (!touch) touch = parseFirstTouch(env.url, env.referrer, env.now);
  } catch {
    return null;
  }
  const encoded = encodeFirstTouch(touch);
  if (!fromCookie) { try { env.writeCookie(encoded); } catch { /* cookies blocked */ } }
  if (!fromStorage && env.storage) { try { env.storage.setItem(FIRST_TOUCH_KEY, encoded); } catch { /* storage blocked */ } }
  return touch;
}
