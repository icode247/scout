import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_ASSISTANT_AVATAR, activeHumanAssistants, assignedHumanAssistant, mapAssistantRow, savedHumanAssistant, setHumanAssistantsForTest } from "./human-assistants";

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

describe("admin-managed roster", () => {
  afterEach(() => setHumanAssistantsForTest(null));

  it("only assigns new clients to active assistants, but still resolves inactive ones", () => {
    setHumanAssistantsForTest([
      { id: "1", name: "Tahee Ahmed", firstName: "Tahee", avatar: "/a.webp", active: true },
      { id: "2", name: "Old Agent", firstName: "Old", avatar: "/b.webp", active: false },
    ]);
    for (const user of ["u1", "u2", "u3", "u4", "u5"]) expect(assignedHumanAssistant(user).name).toBe("Tahee Ahmed");
    expect(savedHumanAssistant("old agent")?.active).toBe(false);
    expect(activeHumanAssistants().map((assistant) => assistant.name)).toEqual(["Tahee Ahmed"]);
  });

  it("maps database rows, defaulting the photo and first name", () => {
    expect(mapAssistantRow({ id: "x", name: "Ada Obi", first_name: "", avatar_url: null, former_names: null, email: "ada@x.co", active: true }))
      .toEqual({ id: "x", name: "Ada Obi", firstName: "Ada", avatar: DEFAULT_ASSISTANT_AVATAR, formerNames: [], email: "ada@x.co", active: true });
  });
});
