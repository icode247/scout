import { describe, expect, it } from "vitest";
import { assignedHumanAssistant, savedHumanAssistant } from "./human-assistants";

describe("renamed assistants", () => {
  it("resolve profiles saved under a former name to the current assistant", () => {
    expect(savedHumanAssistant("Daniel Kim")?.name).toBe("Clinton");
    expect(savedHumanAssistant("daniel kim ")?.firstName).toBe("Clinton");
    expect(assignedHumanAssistant("any-user", "Daniel Kim").name).toBe("Clinton");
  });

  it("still resolve the current name", () => {
    expect(savedHumanAssistant("Clinton")?.avatar).toBe("/assets/agents/clinton.webp");
    expect(savedHumanAssistant("Nobody")).toBeNull();
  });
});
