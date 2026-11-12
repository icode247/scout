import { describe, expect, it } from "vitest";
import { BOOK_CALL_EVENTS, LEGACY_BOOK_CALL_EVENT_ALIASES, bookCallEventNames } from "./book-call-events";

describe("book-call event names", () => {
  it("uses the free call wording", () => {
    expect(Object.values(BOOK_CALL_EVENTS)).toEqual([
      "Free Call Calendar Opened",
      "Free Call Details Submitted",
      "Free Call Scheduled",
    ]);
  });

  it("maps each new name to its old Strategy Call alias", () => {
    expect(LEGACY_BOOK_CALL_EVENT_ALIASES).toEqual({
      "Free Call Calendar Opened": "Strategy Call Calendar Opened",
      "Free Call Details Submitted": "Strategy Call Details Submitted",
      "Free Call Scheduled": "Strategy Call Scheduled",
    });
  });

  it("sends the new name then the old alias, whichever name the caller passes", () => {
    for (const [name, legacy] of Object.entries(LEGACY_BOOK_CALL_EVENT_ALIASES)) {
      expect(bookCallEventNames(name)).toEqual([name, legacy]);
      expect(bookCallEventNames(legacy)).toEqual([name, legacy]);
    }
  });

  it("passes other events through unchanged", () => {
    expect(bookCallEventNames("Checkout Started")).toEqual(["Checkout Started"]);
  });
});
