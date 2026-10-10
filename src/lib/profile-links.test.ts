import { describe, expect, it } from "vitest";
import { classifyProfileLink, isValidProfileLink, normalizeProfileLink, profileLinkError, sendableProfileLink } from "./profile-links";

describe("profile links (FastApply's rules)", () => {
  it("accepts a pasted link without a scheme and sends it as https", () => {
    expect(normalizeProfileLink("linkedin.com/in/jane")).toBe("https://linkedin.com/in/jane");
    expect(normalizeProfileLink("https://github.com/jane")).toBe("https://github.com/jane");
  });

  it("reads what is not a link as no link", () => {
    for (const value of ["N/A", "@jane", "jane", "javascript:alert(1)", "ftp://files.example.com/cv", ""]) {
      expect(normalizeProfileLink(value)).toBeNull();
    }
  });

  it("tells the networks apart by host", () => {
    expect(classifyProfileLink("https://www.linkedin.com/in/jane")).toBe("linkedin");
    expect(classifyProfileLink("twitter.com/jane")).toBe("twitter");
    expect(classifyProfileLink("x.com/jane")).toBe("twitter");
    expect(classifyProfileLink("https://jane.dev")).toBe("website");
  });

  it("lets each field hold only its own network, and a website any link", () => {
    expect(isValidProfileLink("github", "https://www.linkedin.com/in/jane")).toBe(false);
    expect(isValidProfileLink("github", "")).toBe(true);
    expect(isValidProfileLink("website", "https://www.linkedin.com/in/jane")).toBe(true);
  });

  it("says what is wrong in the editor", () => {
    expect(profileLinkError("github", "https://www.linkedin.com/in/jane")).toBe("GitHub must be a github.com link. This one is a LinkedIn link.");
    expect(profileLinkError("linkedin", "https://jane.dev")).toBe("LinkedIn must be a linkedin.com link.");
    expect(profileLinkError("linkedin", "jane")).toBe("LinkedIn must be a link, for example https://…");
    expect(profileLinkError("linkedin", "linkedin.com/in/jane")).toBeNull();
  });

  it("sends only what FastApply accepts", () => {
    expect(sendableProfileLink("linkedin", "linkedin.com/in/jane")).toBe("https://linkedin.com/in/jane");
    expect(sendableProfileLink("github", "https://www.linkedin.com/in/jane")).toBeUndefined();
    expect(sendableProfileLink("website", "N/A")).toBeUndefined();
  });
});
