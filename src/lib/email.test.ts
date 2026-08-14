import { afterEach, describe, expect, it, vi } from "vitest";
import { planByCode } from "../config/plans";
import { EmailError, sendSubscriptionConfirmationEmail, subscriptionConfirmationContent } from "./email";

const humanPlan = planByCode("human_full")!;
const humanQuarterly = planByCode("human_full_90")!;
const aiPlan = planByCode("ai_essential")!;
const assistant = { name: "Maya Brooks", firstName: "Maya" };

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("subscriptionConfirmationContent", () => {
  it("introduces the assigned assistant on the human lane", () => {
    const { subject, text, html } = subscriptionConfirmationContent({ to: "m@example.com", plan: humanPlan, assistant });
    expect(subject).toContain("Maya");
    expect(text).toContain("Maya Brooks");
    expect(text).toContain("WhatsApp");
    expect(html).toContain("Maya Brooks");
  });

  it("describes the AI assistant when no human is assigned", () => {
    const { subject, text } = subscriptionConfirmationContent({ to: "m@example.com", plan: aiPlan, assistant: null });
    expect(subject).toContain(aiPlan.name);
    expect(text).toContain("Scout AI");
    expect(text).not.toContain("WhatsApp");
  });

  it("mentions the 90-day validity window only when the plan has one", () => {
    const quarterly = subscriptionConfirmationContent({ to: "m@example.com", plan: humanQuarterly, assistant });
    expect(quarterly.text).toContain("90 days");
    const standard = subscriptionConfirmationContent({ to: "m@example.com", plan: humanPlan, assistant });
    expect(standard.text).not.toContain("valid for");
  });
});

describe("sendSubscriptionConfirmationEmail", () => {
  it("skips with a warning when the API key is not configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await sendSubscriptionConfirmationEmail({ to: "m@example.com", plan: aiPlan });
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("posts the email to Resend with the idempotency key", async () => {
    process.env.RESEND_API_KEY = "re_test_123";
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendSubscriptionConfirmationEmail({
      to: "m@example.com",
      plan: humanPlan,
      assistant,
      idempotencyKey: "subscription-confirmation/evt_1",
    });

    expect(result).toEqual({ id: "email_1" });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.authorization).toBe("Bearer re_test_123");
    expect(init.headers["idempotency-key"]).toBe("subscription-confirmation/evt_1");
    const body = JSON.parse(init.body);
    expect(body.to).toEqual(["m@example.com"]);
    expect(body.subject).toContain(humanPlan.name);
    expect(body.from).toContain("@");
  });

  it("throws an EmailError when Resend rejects the send", async () => {
    process.env.RESEND_API_KEY = "re_test_123";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Domain is not verified" }), { status: 403 })));
    await expect(sendSubscriptionConfirmationEmail({ to: "m@example.com", plan: aiPlan })).rejects.toThrowError(EmailError);
  });

  it("wraps a network failure in an EmailError", async () => {
    process.env.RESEND_API_KEY = "re_test_123";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(sendSubscriptionConfirmationEmail({ to: "m@example.com", plan: aiPlan })).rejects.toThrowError(EmailError);
  });
});
