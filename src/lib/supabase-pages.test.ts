import { describe, expect, it } from "vitest";
import { SUPABASE_PAGE_SIZE, selectPages } from "./supabase-pages";

/** A fake table that, like Supabase, never returns more than SUPABASE_PAGE_SIZE rows. */
function table(size: number) {
  const rows = Array.from({ length: size }, (_, index) => index);
  const calls: Array<[number, number]> = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, Math.min(to + 1, from + SUPABASE_PAGE_SIZE)), error: null };
  };
  return { page, calls };
}

describe("selectPages", () => {
  it("reads past the 1000-row response cap", async () => {
    const { page, calls } = table(1095);
    const result = await selectPages(page, 5000);
    expect(result.data).toHaveLength(1095);
    expect(result.data.at(-1)).toBe(1094);
    expect(calls).toEqual([[0, 999], [1000, 1999]]);
  });

  it("makes one request for a small result", async () => {
    const { page, calls } = table(30);
    expect((await selectPages(page, 5000)).data).toHaveLength(30);
    expect(calls).toHaveLength(1);
  });

  it("stops at the maximum", async () => {
    const { page } = table(3000);
    expect((await selectPages(page, 1500)).data).toHaveLength(1500);
  });

  it("returns the error from a failed page", async () => {
    const result = await selectPages(async () => ({ data: null, error: new Error("boom") }), 5000);
    expect(result.error).toBeInstanceOf(Error);
  });
});
