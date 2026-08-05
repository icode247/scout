import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "./dodo";

const secret = "whsec_dGVzdHNlY3JldA==";
const id = "evt_123";
const timestamp = String(Math.floor(Date.now() / 1000));
const rawBody = JSON.stringify({ type: "payment.succeeded" });

function sign(body: string, ts = timestamp, key = secret) {
  const bytes = Buffer.from(key.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", bytes).update(`${id}.${ts}.${body}`).digest("base64");
}

describe("verifyWebhookSignature", () => {
  it("accepts a correctly signed payload", () => {
    const signature = `v1,${sign(rawBody)}`;
    expect(verifyWebhookSignature({ id, timestamp, signature, rawBody, secret })).toBe(true);
  });

  it("accepts when several versioned signatures are present", () => {
    const signature = `v1,Ym9ndXM= v1,${sign(rawBody)}`;
    expect(verifyWebhookSignature({ id, timestamp, signature, rawBody, secret })).toBe(true);
  });

  it("rejects a tampered body", () => {
    const signature = `v1,${sign(rawBody)}`;
    const tampered = JSON.stringify({ type: "payment.failed" });
    expect(verifyWebhookSignature({ id, timestamp, signature, rawBody: tampered, secret })).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const signature = `v1,${sign(rawBody, timestamp, "whsec_b3RoZXJzZWNyZXQ=")}`;
    expect(verifyWebhookSignature({ id, timestamp, signature, rawBody, secret })).toBe(false);
  });

  it("rejects a signature bound to a different event id", () => {
    const bytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const other = createHmac("sha256", bytes).update(`evt_other.${timestamp}.${rawBody}`).digest("base64");
    expect(verifyWebhookSignature({ id, timestamp, signature: `v1,${other}`, rawBody, secret })).toBe(false);
  });

  it("rejects a stale timestamp outside the tolerance window", () => {
    const old = String(Math.floor(Date.now() / 1000) - 60 * 60);
    const signature = `v1,${sign(rawBody, old)}`;
    expect(verifyWebhookSignature({ id, timestamp: old, signature, rawBody, secret })).toBe(false);
  });

  it("rejects a non-numeric timestamp", () => {
    expect(verifyWebhookSignature({ id, timestamp: "not-a-time", signature: `v1,${sign(rawBody)}`, rawBody, secret })).toBe(false);
  });

  it("rejects an empty signature header", () => {
    expect(verifyWebhookSignature({ id, timestamp, signature: "", rawBody, secret })).toBe(false);
  });

  it("rejects when the secret is not configured", () => {
    expect(verifyWebhookSignature({ id, timestamp, signature: `v1,${sign(rawBody)}`, rawBody, secret: "" })).toBe(false);
  });

  it("rejects a missing webhook id", () => {
    expect(verifyWebhookSignature({ id: "", timestamp, signature: `v1,${sign(rawBody)}`, rawBody, secret })).toBe(false);
  });
});
