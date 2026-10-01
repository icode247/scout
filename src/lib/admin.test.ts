import { afterEach, describe, expect, it, vi } from "vitest";
import { canWorkClient, staffMember } from "./admin";

afterEach(() => vi.unstubAllEnvs());

describe("staffMember", () => {
  it("treats ordinary users as clients", () => {
    expect(staffMember({ email: "client@example.com", app_metadata: {} })).toBeNull();
    expect(staffMember(null)).toBeNull();
  });

  it("reads agents added from /admin out of app_metadata", () => {
    expect(staffMember({ email: "Hello@ApplyScout.app", app_metadata: { scout_role: "agent", assistant_name: "Lena Santos" } }))
      .toEqual({ email: "hello@applyscout.app", role: "agent", assistantName: "Lena Santos" });
  });

  it("ignores a removed agent whose role was cleared", () => {
    expect(staffMember({ email: "old@applyscout.app", app_metadata: { scout_role: null, assistant_name: null } })).toBeNull();
  });

  it("keeps ADMIN_EMAILS as admins, optionally working as an assistant", () => {
    vi.stubEnv("ADMIN_EMAILS", "boss@applyscout.app");
    expect(staffMember({ email: "boss@applyscout.app", app_metadata: { assistant_name: "Clinton" } }))
      .toEqual({ email: "boss@applyscout.app", role: "admin", assistantName: "Clinton" });
  });

  it("still honours legacy AGENT_EMAILS entries", () => {
    vi.stubEnv("AGENT_EMAILS", "angela@applyscout.app=Angela Price");
    expect(staffMember({ email: "angela@applyscout.app" })?.role).toBe("agent");
  });
});

describe("canWorkClient", () => {
  const agent = { email: "a@applyscout.app", role: "agent" as const, assistantName: "Clinton" };
  it("limits agents to their assistant's clients, matching former names", () => {
    expect(canWorkClient(agent, "Clinton")).toBe(true);
    expect(canWorkClient(agent, "Daniel Kim")).toBe(true);
    expect(canWorkClient(agent, "Lena Santos")).toBe(false);
    expect(canWorkClient(agent, null)).toBe(false);
    expect(canWorkClient({ ...agent, role: "admin" }, "Lena Santos")).toBe(true);
  });
});
