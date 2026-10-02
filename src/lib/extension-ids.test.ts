import { afterEach, describe, expect, it, vi } from "vitest";
import { chromeExtensionIds, chromeExtensionUrl } from "./extension";

afterEach(() => vi.unstubAllEnvs());

describe("chromeExtensionIds", () => {
  it("accepts several comma-separated ids and builds the store link from the first", () => {
    vi.stubEnv("PUBLIC_CHROME_EXTENSION_URL", "");
    vi.stubEnv("PUBLIC_CHROME_EXTENSION_ID", " fimngbojooohimghjpfjleilbcmbnoaj , ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP ");
    expect(chromeExtensionIds()).toEqual(["fimngbojooohimghjpfjleilbcmbnoaj", "abcdefghijklmnopabcdefghijklmnop"]);
    expect(chromeExtensionUrl()).toBe("https://chromewebstore.google.com/detail/fimngbojooohimghjpfjleilbcmbnoaj");
  });

  it("ignores the placeholder and malformed values", () => {
    vi.stubEnv("PUBLIC_CHROME_EXTENSION_ID", "abcdefghijklmnopqrstuvwxyzabcdef, not-an-id");
    expect(chromeExtensionIds()).toEqual([]);
  });
});
