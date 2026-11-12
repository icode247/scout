import { describe, expect, it } from "vitest";
import {
  FIRST_TOUCH_KEY, aiSourceOf, attributionColumns, captureFirstTouch, cleanReferrer, decodeFirstTouch,
  encodeFirstTouch, heardFromValue, isNewSignup, parseFirstTouch,
} from "./attribution";
import { googleSessionCookieName, googleSessionIdFromCookie } from "./google-analytics";

const NOW = new Date("2026-11-12T10:00:00.000Z");

function memoryEnv(url: string, referrer = "", cookie: string | null = null) {
  const jar = { cookie, storage: new Map<string, string>() };
  const env = {
    url, referrer, now: NOW,
    readCookie: () => jar.cookie,
    writeCookie: (value: string) => { jar.cookie = value; },
    storage: { getItem: (key: string) => jar.storage.get(key) ?? null, setItem: (key: string, value: string) => { jar.storage.set(key, value); } },
  };
  return { env, jar };
}

describe("parseFirstTouch", () => {
  it("reads every utm tag, gclid, the landing path and the time", () => {
    const touch = parseFirstTouch(
      "https://applyscout.app/blog/job-application-service-cost?utm_source=newsletter&utm_medium=email&utm_campaign=nov&utm_term=apply+for+me&utm_content=hero&gclid=abc123",
      "", NOW,
    );
    expect(touch).toEqual({
      utm_source: "newsletter", utm_medium: "email", utm_campaign: "nov", utm_term: "apply for me", utm_content: "hero",
      gclid: "abc123", referrer: null, ai_source: null, landing_path: "/blog/job-application-service-cost", at: NOW.toISOString(),
    });
  });

  it("keeps no query string from the landing page or the referrer", () => {
    const touch = parseFirstTouch("https://applyscout.app/login?sent=someone%40example.com", "https://mail.example.com/inbox?user=someone@example.com", NOW);
    expect(touch.landing_path).toBe("/login");
    expect(touch.referrer).toBe("https://mail.example.com/inbox");
    expect(JSON.stringify(touch)).not.toContain("someone");
  });

  it("treats this site as no referrer", () => {
    expect(parseFirstTouch("https://applyscout.app/pricing", "https://www.applyscout.app/", NOW).referrer).toBeNull();
    expect(cleanReferrer("android-app://com.google.android.gm/", "applyscout.app")).toBeNull();
    expect(cleanReferrer("not a url", "applyscout.app")).toBeNull();
  });

  it("caps long values", () => {
    const touch = parseFirstTouch(`https://applyscout.app/?utm_campaign=${"x".repeat(500)}`, "", NOW);
    expect(touch.utm_campaign).toHaveLength(150);
  });
});

describe("AI referrer detection", () => {
  it.each([
    ["https://chatgpt.com/", "chatgpt"],
    ["https://chat.openai.com/", "chatgpt"],
    ["https://www.perplexity.ai/", "perplexity"],
    ["https://gemini.google.com/", "gemini"],
    ["https://copilot.microsoft.com/", "copilot"],
    ["https://claude.ai/", "claude"],
  ])("%s is %s", (referrer, label) => {
    expect(parseFirstTouch("https://applyscout.app/", referrer, NOW).ai_source).toBe(label);
  });

  it("uses utm_source when the engine sends no referrer", () => {
    expect(parseFirstTouch("https://applyscout.app/?utm_source=chatgpt.com", "", NOW).ai_source).toBe("chatgpt");
    expect(aiSourceOf(null, "perplexity")).toBe("perplexity");
  });

  it("does not count ordinary search or lookalike hosts", () => {
    expect(aiSourceOf("https://www.google.com/")).toBeNull();
    expect(aiSourceOf("https://www.bing.com/")).toBeNull();
    expect(aiSourceOf("https://notchatgpt.com/")).toBeNull();
    expect(aiSourceOf(null, "newsletter")).toBeNull();
  });
});

describe("captureFirstTouch", () => {
  it("stores the first visit in the cookie and localStorage", () => {
    const { env, jar } = memoryEnv("https://applyscout.app/pricing?utm_source=chatgpt.com", "https://chatgpt.com/");
    const touch = captureFirstTouch(env);
    expect(touch?.ai_source).toBe("chatgpt");
    expect(decodeFirstTouch(jar.cookie)).toEqual(touch);
    expect(decodeFirstTouch(jar.storage.get(FIRST_TOUCH_KEY))).toEqual(touch);
  });

  it("never overwrites an earlier first touch", () => {
    const { env, jar } = memoryEnv("https://applyscout.app/?utm_source=chatgpt.com", "https://chatgpt.com/");
    const first = captureFirstTouch(env);
    const later = captureFirstTouch({ ...env, url: "https://applyscout.app/pricing?utm_source=google&utm_medium=cpc&gclid=g1", referrer: "https://www.google.com/", now: new Date("2026-11-20T00:00:00Z") });
    expect(later).toEqual(first);
    expect(decodeFirstTouch(jar.cookie)?.utm_source).toBe("chatgpt.com");
  });

  it("restores the cookie from localStorage instead of starting over", () => {
    const { env, jar } = memoryEnv("https://applyscout.app/?utm_source=linkedin", "");
    const first = captureFirstTouch(env);
    jar.cookie = null; // e.g. Safari expired the script-set cookie
    const again = captureFirstTouch({ ...env, url: "https://applyscout.app/pricing", referrer: "https://www.google.com/" });
    expect(again).toEqual(first);
    expect(decodeFirstTouch(jar.cookie)?.utm_source).toBe("linkedin");
  });

  it("replaces a malformed stored value", () => {
    const { env } = memoryEnv("https://applyscout.app/?utm_source=reddit", "", "garbage");
    expect(captureFirstTouch(env)?.utm_source).toBe("reddit");
  });

  it("survives blocked cookies and storage", () => {
    const touch = captureFirstTouch({
      url: "https://applyscout.app/", referrer: "", now: NOW,
      readCookie: () => { throw new Error("blocked"); },
      writeCookie: () => { throw new Error("blocked"); },
      storage: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } },
    });
    expect(touch?.landing_path).toBe("/");
  });
});

describe("decodeFirstTouch", () => {
  it("round-trips an encoded touch, raw or already URL-decoded", () => {
    const touch = parseFirstTouch("https://applyscout.app/how-it-works?utm_source=x", "https://www.perplexity.ai/search", NOW);
    expect(decodeFirstTouch(encodeFirstTouch(touch))).toEqual(touch);
    expect(decodeFirstTouch(decodeURIComponent(encodeFirstTouch(touch)))).toEqual(touch);
  });

  it("drops unknown fields and rejects values that are not a first touch", () => {
    const decoded = decodeFirstTouch(JSON.stringify({ landing_path: "/", at: NOW.toISOString(), email: "a@b.co", utm_source: 7 }));
    expect(decoded).not.toHaveProperty("email");
    expect(decoded?.utm_source).toBeNull();
    expect(decodeFirstTouch(JSON.stringify({ landing_path: "https://evil.example", at: NOW.toISOString() }))).toBeNull();
    expect(decodeFirstTouch(JSON.stringify({ landing_path: "/", at: "yesterday" }))).toBeNull();
    expect(decodeFirstTouch(undefined)).toBeNull();
    expect(decodeFirstTouch("[]")).toBeNull();
  });
});

describe("signup helpers", () => {
  it("maps a first touch onto the profile columns, all null without one", () => {
    const touch = parseFirstTouch("https://applyscout.app/?utm_source=chatgpt.com", "https://chatgpt.com/", NOW);
    expect(attributionColumns(touch)).toMatchObject({ first_utm_source: "chatgpt.com", first_referrer: "https://chatgpt.com/", first_ai_source: "chatgpt", first_landing_path: "/", first_touch_at: NOW.toISOString() });
    expect(Object.values(attributionColumns(null)).every((value) => value === null)).toBe(true);
  });

  it("counts a sign-in within a day of account creation as the signup", () => {
    const now = NOW.getTime();
    expect(isNewSignup(new Date(now - 5 * 60_000).toISOString(), now)).toBe(true);
    expect(isNewSignup(new Date(now - 2 * 24 * 60 * 60_000).toISOString(), now)).toBe(false);
    expect(isNewSignup(undefined, now)).toBe(false);
  });

  it("accepts only known heard_from answers", () => {
    expect(heardFromValue("chatgpt")).toBe("chatgpt");
    expect(heardFromValue("")).toBeNull();
    expect(heardFromValue("made-up")).toBeNull();
    expect(heardFromValue("other", "  A  newsletter ")).toBe("other: A newsletter");
    expect(heardFromValue("other", "")).toBe("other");
    expect(heardFromValue("google", "ignored")).toBe("google");
  });
});

describe("GA4 session cookie", () => {
  it("finds the session id in both cookie formats", () => {
    expect(googleSessionCookieName("G-ABC123")).toBe("_ga_ABC123");
    expect(googleSessionCookieName("")).toBeNull();
    expect(googleSessionIdFromCookie("GS1.1.1731400000.3.1.1731400100.0.0.0")).toBe("1731400000");
    expect(googleSessionIdFromCookie("GS2.1.s1731400000$o3$g1$t1731400100$j0$l0$h0")).toBe("1731400000");
    expect(googleSessionIdFromCookie(undefined)).toBeNull();
    expect(googleSessionIdFromCookie("junk")).toBeNull();
  });
});
