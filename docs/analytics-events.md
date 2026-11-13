# Analytics events

## /book-call events (renamed 2026-11-12)

The `/book-call` page now says "free call", so its events were renamed to match (DEV-SEO-032).

**Cutover date:** 2026-11-12. From this date each event is sent under its new name and, temporarily, under its old name as an alias with the same properties.

| New name (use this) | Old alias (temporary) | GA4 name (new / old) | When it fires | Properties |
|---|---|---|---|---|
| `Free Call Calendar Opened` | `Strategy Call Calendar Opened` | `free_call_calendar_opened` / `strategy_call_calendar_opened` | The Calendly calendar is shown after the details form is saved (or restored from the session). | `lead_id` |
| `Free Call Details Submitted` | `Strategy Call Details Submitted` | `free_call_details_submitted` / `strategy_call_details_submitted` | `/api/book-call` saved the lead. | `lead_id`, `has_role` |
| `Free Call Scheduled` | `Strategy Call Scheduled` | `free_call_scheduled` / `strategy_call_scheduled` | Calendly posts `calendly.event_scheduled`. | `lead_id` |

Both names go through `window.scoutTrack`, which sends to PostHog and to GA4 (GA4 gets the snake_case form). The names and aliases live in `src/lib/book-call-events.ts`. `track()` in `src/pages/book-call.astro` accepts either name and sends the new name, then the old one. The scheduled call site still passes `"Strategy Call Scheduled"` so this change merges cleanly with the GA4 `book_call` line PR #19 adds right after it; it still sends both names.

Not renamed: the server-side PostHog event `strategy_call_lead_created` in `src/pages/api/book-call.ts`, the Calendly URL, and its `utm_campaign=strategy_call`.

### Removing the aliases (about 8 weeks after cutover, around 2027-01-07)

While both names are sent, every action is recorded twice, once under each name. Do not add the old and new names together in one insight for dates on or after 2026-11-12, or the counts double.

1. In PostHog, update every dashboard, insight, funnel, action and cohort that uses a `Strategy Call ...` event to use the matching `Free Call ...` event. The new names have no data before 2026-11-12; for older history, query the old name for dates before the cutover and note the cutover date in the insight description.
2. Do the same for any GA4 reports, explorations or key events that use `strategy_call_*`.
3. Delete the aliases: remove `LEGACY_BOOK_CALL_EVENT_ALIASES`, `BOOK_CALL_EVENT_SENDS` and `bookCallEventNames` from `src/lib/book-call-events.ts` (and their tests). In `src/pages/book-call.astro`, remove the `eventSends` define:var, make `track()` send only the name it is given, and change `track("Strategy Call Scheduled", ...)` to `track("Free Call Scheduled", ...)`.
