import { describe, expect, it } from "vitest";

import { assertSameOrigin } from "./api";

function apiContext({
  authTransport,
  user = true,
  origin,
}: {
  authTransport?: "cookie" | "bearer";
  user?: boolean;
  origin?: string;
}) {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  return {
    locals: {
      authTransport,
      user: user ? { id: "user-1" } : undefined,
    },
    request: new Request("https://applyscout.app/api/app/jobs", { headers }),
    url: new URL("https://applyscout.app/api/app/jobs"),
  } as Parameters<typeof assertSameOrigin>[0];
}

function rejectedResponse(context: Parameters<typeof assertSameOrigin>[0]) {
  try {
    assertSameOrigin(context);
  } catch (reason) {
    return reason;
  }
  return null;
}

describe("assertSameOrigin", () => {
  it("accepts a verified bearer-authenticated native request without a browser origin", () => {
    expect(() => assertSameOrigin(apiContext({ authTransport: "bearer" }))).not.toThrow();
  });

  it("does not let an unverified bearer flag bypass the origin check", () => {
    const rejection = rejectedResponse(apiContext({ authTransport: "bearer", user: false }));
    expect(rejection).toBeInstanceOf(Response);
    expect((rejection as Response).status).toBe(403);
  });

  it("keeps same-origin enforcement for cookie-authenticated mutations", () => {
    expect(() => assertSameOrigin(apiContext({ authTransport: "cookie", origin: "https://applyscout.app" }))).not.toThrow();
    const rejection = rejectedResponse(apiContext({ authTransport: "cookie", origin: "https://attacker.example" }));
    expect(rejection).toBeInstanceOf(Response);
    expect((rejection as Response).status).toBe(403);
  });
});
