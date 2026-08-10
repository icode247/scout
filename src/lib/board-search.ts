/**
 * Maps a saved `job_search_filters` row onto the upstream board's query parameters.
 *
 * Scout used to mirror the board into `board_jobs` and search that, because the upstream
 * 500d on q/location/work_mode/employment_type. Re-measured 2026-08-10, all four answer
 * 200 and `posted` works too, so the search runs against the board itself — the mirror
 * held ~52k rows where one saved search alone matches 2,257.
 *
 * The board's contract (job-aggregator src/api/routes/jobs.js):
 *   q ★                comma-separated roles, OR'd; words within a role are AND'd
 *   location ★         comma-separated free text, OR'd (ILIKE)
 *   work_mode ★        remote | hybrid | onsite
 *   employment_type ★  full-time | part-time | contract | internship
 *   experience_level ★ internship | entry | mid | senior | lead | executive
 *   posted             Nh | Nd | Nw | Nm — anything else is ignored
 *   remote / remote_worldwide   "true"
 */
export interface BoardSearchConfig {
  roles?: string[];
  locations?: string[];
  employment_types?: string[];
  work_modes?: string[];
  experience_levels?: string[];
  date_posted?: string;
}

export interface BoardSearchOptions {
  limit: number;
  offset: number;
  /** False re-runs the same search over the whole board, ignoring the date window. */
  withinDateWindow?: boolean;
  /** False drops the location clause, so a caller can tell whether it is what emptied the search. */
  withLocation?: boolean;
}

export const jobType = (value: string) =>
  value === "full_time" ? "full-time" : value === "part_time" ? "part-time" : value;

/** Legacy filters stored `past_day`/`past_week`/`past_month`. */
export const posted = (value: string) =>
  ({ past_day: "24h", past_week: "7d", past_month: "30d" } as Record<string, string>)[value] || value || "7d";

/**
 * Day counts behind each window, for the "Scout widened the dates" notice. `any` carries
 * no window at all, so a member can search the whole board deliberately.
 */
export const POSTED_DAYS: Record<string, number | null> = { "1h": 1, "24h": 1, "7d": 7, "30d": 30, "6m": 183, any: null };

const WORK_MODES = ["remote", "hybrid", "onsite"];
const EXPERIENCE_LEVELS = ["internship", "entry", "mid", "senior", "lead", "executive"];

const clean = (values: unknown): string[] =>
  (Array.isArray(values) ? values : []).map((value) => String(value ?? "").trim()).filter(Boolean);

/** The board window for this config, or null when it asks for any date. */
export function postedWindow(config: BoardSearchConfig): string | null {
  const key = posted(String(config.date_posted || ""));
  return /^\d+[hdwm]$/i.test(key) ? key : null;
}

/** Days behind the configured window, or null for "any time". */
export function dateWindowDays(config: BoardSearchConfig): number | null {
  const key = posted(String(config.date_posted || ""));
  return key === "any" ? null : POSTED_DAYS[key] ?? 7;
}

export function boardSearchParams(config: BoardSearchConfig, options: BoardSearchOptions) {
  const { limit, offset, withinDateWindow = true, withLocation = true } = options;
  const params: Record<string, string | number> = { limit, offset, include: "description" };

  // The board splits `q` on commas into separate role queries, so a comma inside one role
  // would silently become two.
  const roles = clean(config.roles).map((role) => role.replace(/,/g, " "));
  if (roles.length) params.q = roles.join(",");

  if (withLocation) {
    // Remote is a location in the picker but a boolean upstream. Picked on its own it maps
    // to the board's indexed flag; alongside cities it stays a location term so the two are
    // OR'd, which is what the member actually chose.
    const selected = clean(config.locations);
    const plain = selected.filter((value) => !/^remote\b/i.test(value));
    const worldwide = selected.some((value) => /^remote\s*(global|worldwide)$/i.test(value));
    const remote = selected.some((value) => /^remote$/i.test(value));
    const terms = [...plain, ...(remote || worldwide ? ["Remote"] : [])];
    if (!plain.length && worldwide) params.remote_worldwide = "true";
    else if (!plain.length && remote) params.remote = "true";
    else if (terms.length) params.location = terms.join(",");
  }

  const workModes = clean(config.work_modes)
    .map((value) => value.toLowerCase().replace(/_/g, "-"))
    .map((value) => (value === "remote-solely" ? "remote" : value === "on-site" ? "onsite" : value))
    .filter((value) => WORK_MODES.includes(value));
  if (workModes.length) params.work_mode = [...new Set(workModes)].join(",");

  // `contractor` is Scout's wording; the board says `contract`.
  const employmentTypes = clean(config.employment_types)
    .map(jobType)
    .map((value) => (value === "contractor" ? "contract" : value));
  if (employmentTypes.length) params.employment_type = employmentTypes.join(",");

  const experienceLevels = clean(config.experience_levels)
    .map((value) => value.toLowerCase())
    .filter((value) => EXPERIENCE_LEVELS.includes(value));
  if (experienceLevels.length) params.experience_level = experienceLevels.join(",");

  const window = postedWindow(config);
  if (withinDateWindow && window) params.posted = window;

  return params;
}

/**
 * Where the next page starts, or null at the end. A short page ends the results whatever
 * the board reports as its total: it caps large totals at 10,000 and serves nothing at or
 * beyond that offset.
 */
export function nextBoardOffset(rowCount: number, meta: { nextOffset?: unknown }, limit: number, offset: number) {
  if (rowCount < limit) return null;
  return typeof meta?.nextOffset === "number" ? meta.nextOffset : offset + limit;
}
