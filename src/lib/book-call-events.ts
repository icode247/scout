/**
 * Analytics event names for /book-call. See docs/analytics-events.md.
 *
 * Cutover 2026-11-12: the events were renamed from "Strategy Call ..." to
 * "Free Call ..." to match the visible "free call" wording. Each event is
 * still sent under its old name too, with the same properties, so PostHog
 * insights and dashboards keyed on the old strings keep working.
 *
 * TODO(remove after ~2027-01-07, 8 weeks after cutover): once the PostHog
 * dashboards and insights use the new names, delete LEGACY_BOOK_CALL_EVENT_ALIASES
 * and BOOK_CALL_EVENT_SENDS, make track() in book-call.astro send only the
 * name it is given, and change its remaining `track("Strategy Call Scheduled", ...)`
 * call to "Free Call Scheduled". (That call keeps its old literal for now only so
 * this change merges cleanly with the GA4 book_call line added right after it.)
 */
export const BOOK_CALL_EVENTS = {
  calendarOpened: "Free Call Calendar Opened",
  detailsSubmitted: "Free Call Details Submitted",
  scheduled: "Free Call Scheduled",
} as const;

export type BookCallEventName = (typeof BOOK_CALL_EVENTS)[keyof typeof BOOK_CALL_EVENTS];

/** New name -> old name. Temporary; see the cutover note above. */
export const LEGACY_BOOK_CALL_EVENT_ALIASES: Readonly<Record<BookCallEventName, string>> = {
  [BOOK_CALL_EVENTS.calendarOpened]: "Strategy Call Calendar Opened",
  [BOOK_CALL_EVENTS.detailsSubmitted]: "Strategy Call Details Submitted",
  [BOOK_CALL_EVENTS.scheduled]: "Strategy Call Scheduled",
};

/**
 * Either name of a book-call event (new or old) -> every name to send it under,
 * new name first. book-call.astro's track() reads this through define:vars.
 */
export const BOOK_CALL_EVENT_SENDS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  Object.entries(LEGACY_BOOK_CALL_EVENT_ALIASES).flatMap(([name, legacy]) => [
    [name, [name, legacy]],
    [legacy, [name, legacy]],
  ]),
);

/** The names to send an event under; names outside the map go out unchanged. */
export function bookCallEventNames(eventName: string): readonly string[] {
  return BOOK_CALL_EVENT_SENDS[eventName] ?? [eventName];
}
