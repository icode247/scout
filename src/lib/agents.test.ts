import { describe, expect, it } from "vitest";
import { AgentError, cleanEmail, cleanName } from "./agents";

describe("agent input", () => {
  it("normalizes names and rejects empty ones", () => {
    expect(cleanName("  Tahee   Ahmed ")).toBe("Tahee Ahmed");
    expect(() => cleanName(" ")).toThrow(AgentError);
  });

  it("treats a blank email as no login and rejects malformed ones", () => {
    expect(cleanEmail("")).toBeNull();
    expect(cleanEmail(" Agent@ApplyScout.app ")).toBe("agent@applyscout.app");
    expect(() => cleanEmail("not-an-email")).toThrow(AgentError);
  });
});
