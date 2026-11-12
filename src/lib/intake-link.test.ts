import { describe, expect, it } from "vitest";
import { createIntakeToken, loadIntakePrefill, readIntakeToken } from "./intake-link";

const userId = "11111111-2222-4333-8444-555555555555";
const secret = "test-signing-key";

describe("intake link tokens", () => {
  it("round-trips a user id and carries nothing personal", () => {
    const token = createIntakeToken(userId, secret);
    expect(token).toMatch(/^[0-9a-f]{32}\.[A-Za-z0-9_-]{22}$/);
    expect(readIntakeToken(token, secret)).toBe(userId);
  });

  it("refuses tampered, foreign, malformed and unsigned tokens", () => {
    const token = createIntakeToken(userId, secret);
    const other = createIntakeToken("00000000-0000-4000-8000-000000000000", secret);
    expect(readIntakeToken(token, "another-key")).toBeNull();
    expect(readIntakeToken(`${other.split(".")[0]}.${token.split(".")[1]}`, secret)).toBeNull();
    expect(readIntakeToken(`${token}.x`, secret)).toBeNull();
    expect(readIntakeToken(token.split(".")[0], secret)).toBeNull();
    expect(readIntakeToken("", secret)).toBeNull();
    expect(readIntakeToken(token, "")).toBeNull();
  });
});

function fakeSupabase(rows: Record<string, any>) {
  return {
    from(table: string) {
      const query: any = { select: () => query, eq: () => query, order: () => query, limit: () => query, maybeSingle: async () => ({ data: rows[table] ?? null, error: null }) };
      return query;
    },
  } as any;
}

describe("loadIntakePrefill", () => {
  it("uses the latest intake and falls back to the account's WhatsApp number", async () => {
    const saved = await loadIntakePrefill(fakeSupabase({
      profiles: { email: "Client@Example.com", full_name: "client", whatsapp_phone: "+447700900123" },
      assistant_intakes: { full_name: "Alex Rivera", answers: { currentCity: "Leeds", desiredSalary: "90000" } },
    }), userId);
    expect(saved).toEqual({ email: "client@example.com", name: "Alex Rivera", answers: { currentCity: "Leeds", whatsappPhone: "+447700900123" } });
  });

  it("returns nothing for an account without an email", async () => {
    expect(await loadIntakePrefill(fakeSupabase({ profiles: null }), userId)).toBeNull();
  });
});
