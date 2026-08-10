import { describe, expect, it } from "vitest";
import { boardSearchParams, dateWindowDays, nextBoardOffset, postedWindow } from "./board-search";

const params = (config: any, options: any = {}) => boardSearchParams(config, { limit: 30, offset: 0, ...options });

describe("boardSearchParams", () => {
  it("always asks for descriptions and carries the page window", () => {
    expect(params({ roles: ["Data Engineer"] }, { limit: 50, offset: 100 })).toMatchObject({
      limit: 50, offset: 100, include: "description",
    });
  });

  it("joins roles with commas, which is how the board splits them", () => {
    expect(params({ roles: ["Data Engineer", "Analytics Engineer"] }).q).toBe("Data Engineer,Analytics Engineer");
  });

  it("neutralises a comma inside a role so it does not become two searches", () => {
    expect(params({ roles: ["Engineer, Backend"] }).q).toBe("Engineer  Backend");
  });

  it("omits q when no role is set", () => {
    expect(params({ roles: [] })).not.toHaveProperty("q");
  });

  describe("locations", () => {
    it("passes plain locations through as an OR list", () => {
      expect(params({ locations: ["United Kingdom", "Ireland"] }).location).toBe("United Kingdom,Ireland");
    });

    it("maps a bare Remote selection to the board's indexed flag", () => {
      const result = params({ locations: ["Remote"] });
      expect(result.remote).toBe("true");
      expect(result).not.toHaveProperty("location");
    });

    it("maps Remote Worldwide to remote_worldwide", () => {
      const result = params({ locations: ["Remote Worldwide"] });
      expect(result.remote_worldwide).toBe("true");
      expect(result).not.toHaveProperty("location");
    });

    // The flags are AND'd upstream, so pairing one with a city would demand both.
    it("keeps Remote as a location term when a city is also selected, so they are OR'd", () => {
      const result = params({ locations: ["London", "Remote"] });
      expect(result.location).toBe("London,Remote");
      expect(result).not.toHaveProperty("remote");
    });

    it("drops the location clause entirely when asked", () => {
      const result = params({ locations: ["London", "Remote"] }, { withLocation: false });
      expect(result).not.toHaveProperty("location");
      expect(result).not.toHaveProperty("remote");
    });
  });

  describe("employment type", () => {
    it("translates Scout's wording to the board's", () => {
      expect(params({ employment_types: ["contractor"] }).employment_type).toBe("contract");
      expect(params({ employment_types: ["full_time"] }).employment_type).toBe("full-time");
      expect(params({ employment_types: ["part_time"] }).employment_type).toBe("part-time");
    });

    it("leaves values the board already understands alone", () => {
      expect(params({ employment_types: ["full-time", "internship"] }).employment_type).toBe("full-time,internship");
    });
  });

  describe("work mode", () => {
    it("normalises Scout's variants", () => {
      expect(params({ work_modes: ["remote_solely"] }).work_mode).toBe("remote");
      expect(params({ work_modes: ["on-site"] }).work_mode).toBe("onsite");
      expect(params({ work_modes: ["on_site"] }).work_mode).toBe("onsite");
    });

    it("drops anything the board does not accept", () => {
      expect(params({ work_modes: ["any", "flexible"] })).not.toHaveProperty("work_mode");
    });

    it("dedupes after normalising", () => {
      expect(params({ work_modes: ["remote", "remote_solely"] }).work_mode).toBe("remote");
    });
  });

  describe("experience level", () => {
    it("keeps the board's vocabulary and drops the rest", () => {
      expect(params({ experience_levels: ["Senior", "principal"] }).experience_level).toBe("senior");
    });
  });

  describe("date window", () => {
    it("forwards windows the board parses", () => {
      expect(params({ date_posted: "7d" }).posted).toBe("7d");
      expect(params({ date_posted: "6m" }).posted).toBe("6m");
      expect(params({ date_posted: "24h" }).posted).toBe("24h");
    });

    it("translates the legacy wordings", () => {
      expect(params({ date_posted: "past_week" }).posted).toBe("7d");
      expect(params({ date_posted: "past_month" }).posted).toBe("30d");
    });

    // The board ignores an unparseable value, which would silently widen the search.
    it("sends nothing for 'any time' or junk", () => {
      expect(params({ date_posted: "any" })).not.toHaveProperty("posted");
      expect(params({ date_posted: "whenever" })).not.toHaveProperty("posted");
    });

    it("omits the window when re-running over the whole board", () => {
      expect(params({ date_posted: "7d" }, { withinDateWindow: false })).not.toHaveProperty("posted");
    });
  });

  it("builds the full query for a real saved search", () => {
    expect(params(
      { roles: ["Data Engineer"], locations: ["United States"], employment_types: ["full-time"], date_posted: "30d" },
      { limit: 50, offset: 50 },
    )).toEqual({
      limit: 50, offset: 50, include: "description",
      q: "Data Engineer", location: "United States", employment_type: "full-time", posted: "30d",
    });
  });
});

describe("postedWindow / dateWindowDays", () => {
  it("agree on what counts as a window", () => {
    expect(postedWindow({ date_posted: "30d" })).toBe("30d");
    expect(dateWindowDays({ date_posted: "30d" })).toBe(30);
    expect(postedWindow({ date_posted: "any" })).toBeNull();
    expect(dateWindowDays({ date_posted: "any" })).toBeNull();
  });

  it("defaults an unset window to a week, matching the filter form", () => {
    expect(postedWindow({})).toBe("7d");
    expect(dateWindowDays({})).toBe(7);
  });
});

describe("nextBoardOffset", () => {
  it("follows the board when it says where the next page starts", () => {
    expect(nextBoardOffset(30, { nextOffset: 30 }, 30, 0)).toBe(30);
  });

  it("falls back to offset + limit when the board says nothing", () => {
    expect(nextBoardOffset(30, {}, 30, 60)).toBe(90);
  });

  // The board caps large totals at 10,000 and serves nothing beyond, so hasNext can
  // stay true past the last real row.
  it("ends on a short page whatever the board claims", () => {
    expect(nextBoardOffset(12, { nextOffset: 9990 }, 30, 9960)).toBeNull();
    expect(nextBoardOffset(0, { nextOffset: 10000 }, 30, 9990)).toBeNull();
  });
});
