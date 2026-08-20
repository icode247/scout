import { afterEach, describe, expect, it, vi } from "vitest";
import { launchEmailContent, sendLaunchEmail } from "./launch-email";

const base = {
  to: "alex@example.com",
  firstName: "Alex",
  unsubscribeToken: "00000000-0000-4000-8000-000000000001",
  enrollmentId: "enrollment-1",
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.SCOUT_MAILING_ADDRESS;
});

describe("launchEmailContent", () => {
  it("fails closed when the physical mailing address is missing", () => {
    expect(() => launchEmailContent({ ...base, emailNumber: 1 })).toThrow("SCOUT_MAILING_ADDRESS");
  });

  it("includes Scout branding, reason, address, and unsubscribe link", () => {
    process.env.SCOUT_MAILING_ADDRESS = "123 Scout Street, Lagos";
    const message = launchEmailContent({ ...base, emailNumber: 1 });
    expect(message.html).toContain("#9dde47");
    expect(message.html).toContain("signed up for one of our job search tools");
    expect(message.text).toContain("123 Scout Street, Lagos");
    expect(message.unsubscribe).toContain("/email/unsubscribe?token=");
  });

  it("puts the preferred lane first in email three", () => {
    process.env.SCOUT_MAILING_ADDRESS = "123 Scout Street, Lagos";
    const human = launchEmailContent({ ...base, emailNumber: 3, preferredLane: "human" }).text;
    const ai = launchEmailContent({ ...base, emailNumber: 3, preferredLane: "ai" }).text;
    expect(human.indexOf("Human Assistant:")).toBeLessThan(human.indexOf("AI Assistant:"));
    expect(ai.indexOf("AI Assistant:")).toBeLessThan(ai.indexOf("Human Assistant:"));
  });
});

describe("sendLaunchEmail", () => {
  it("sets sender, reply-to, idempotency, and one-click unsubscribe headers", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.SCOUT_MAILING_ADDRESS = "123 Scout Street, Lagos";
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    await sendLaunchEmail({ ...base, emailNumber: 2 });
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(init.headers["idempotency-key"]).toBe("launch-sequence/enrollment-1/2");
    expect(body.from).toBe("Kate from Scout <kate@updates.applyscout.app>");
    expect(body.reply_to).toBe("kate@applyscout.app");
    expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});
