/**
 * RETIRED — the mirror this drove is no longer used, and its cron is off.
 *
 * The board API used to 500 on q/location/work_mode/employment_type, so Scout swept the
 * parameters that did work and searched its own `board_jobs` copy instead. Re-measured
 * 2026-08-10: all four now return 200, and `posted` (Nh/Nd/Nw/Nm) works too, so
 * /api/app/job-search queries the board directly.
 *
 * The mirror was never a good trade — it held ~52k rows against a corpus where one saved
 * search alone matches 2,257, because the 10,000-row cap below limits it to ~80k total.
 *
 * `normalizeBoardJob`, `initialsFor`, `logoUrlForDomain` and `salaryLabel` are still the
 * shared shaping helpers and are used by the live search path. The sweep constants and
 * `nextCursor` are kept only so /api/cron/ingest-jobs still compiles; delete both, the
 * `board_jobs` table and `board_ingest_cursor` once live search is confirmed in production.
 */
/**
 * The board caps every result set at 10,000 rows (`meta.total: 10000,
 * totalIsCapped: true`) and serves an empty `data` array at or beyond that
 * offset — measured against the live service:
 *
 *   offset 9000  -> 100 rows
 *   offset 10000 -> 0 rows
 *   offset 12000 -> 0 rows
 *
 * The ceiling has to match, or the sweep spends its runs paging through nothing
 * instead of wrapping back to offset 0 to pick up newly posted jobs. At 100000 it
 * took ~15 hours of empty pages per axis to come back around, which is why the
 * corpus went stale and searches fell through to the unfiltered fallback.
 */
export const OFFSET_CEILING = 10000;
export const PAGE_SIZE = 100;
export const PAGES_PER_RUN = 10;

/** Never send these: each one independently times the board out. */
export const BANNED_PARAMS = ["q", "location", "work_mode", "employment_type"] as const;

export interface IngestAxis { key: string; params: Record<string, string>; }

export const INGEST_AXES: IngestAxis[] = [
  { key: "ats:greenhouse", params: { ats: "greenhouse" } },
  { key: "ats:lever", params: { ats: "lever" } },
  { key: "ats:ashby", params: { ats: "ashby" } },
  { key: "ats:workable", params: { ats: "workable" } },
  { key: "ats:recruitee", params: { ats: "recruitee" } },
  { key: "ats:workday", params: { ats: "workday" } },
  { key: "ats:smartrecruiters", params: { ats: "smartrecruiters" } },
  { key: "remote", params: { remote: "true" } },
];

export interface BoardJobRow {
  external_id: string;
  board_id: number | null;
  title: string;
  company: string;
  company_domain: string | null;
  logo_url: string | null;
  location: string;
  workplace_type: string | null;
  employment_type: string | null;
  experience_level: string | null;
  is_remote: boolean;
  remote_worldwide: boolean;
  visa_sponsorship: boolean | null;
  salary: unknown;
  ats: string | null;
  external_url: string;
  description: string;
  posted_at: string | null;
}

/**
 * The board populates `company.domain` but leaves `company.logo_url` null on
 * effectively every record, which is why job logos never rendered. Deriving the
 * icon from the domain gives real company imagery; callers keep an initials
 * fallback for the cases where the service has nothing.
 */
export function logoUrlForDomain(domain: string | null | undefined): string | null {
  const value = String(domain || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!value || !value.includes(".")) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(value)}&sz=128`;
}

export function normalizeBoardJob(raw: any): BoardJobRow | null {
  if (!raw) return null;
  const externalUrl = String(raw.url || raw.apply_url || raw.applyUrl || "").trim();
  if (!externalUrl) return null;

  const company = raw.company || {};
  const domain = company.domain ? String(company.domain) : null;
  const boardId = Number(raw.id);

  return {
    external_id: String(raw.external_id || (Number.isFinite(boardId) ? `board_${boardId}` : externalUrl)).slice(0, 200),
    board_id: Number.isFinite(boardId) ? boardId : null,
    title: String(raw.title || "Untitled role").slice(0, 300),
    company: String(company.name || raw.company_name || "Company").slice(0, 300),
    company_domain: domain,
    logo_url: company.logo_url ? String(company.logo_url) : logoUrlForDomain(domain),
    location: String(raw.location || "").slice(0, 300),
    workplace_type: raw.workplace_type ? String(raw.workplace_type) : null,
    employment_type: raw.employment_type ? String(raw.employment_type) : null,
    experience_level: raw.experience_level ? String(raw.experience_level) : null,
    is_remote: Boolean(raw.is_remote),
    remote_worldwide: Boolean(raw.remote_worldwide),
    visa_sponsorship: typeof raw.visa_sponsorship === "boolean" ? raw.visa_sponsorship : null,
    salary: raw.salary ?? null,
    ats: raw.ats ? String(raw.ats) : null,
    external_url: externalUrl,
    description: String(raw.description || "").slice(0, 50000),
    posted_at: raw.posted_at ? String(raw.posted_at) : null,
  };
}

/** Advances a sweep cursor, wrapping at the ceiling because deeper pages time out. */
export function nextCursor(offset: number, pageSize: number) {
  const next = offset + pageSize;
  return next >= OFFSET_CEILING ? 0 : next;
}

/** Formats a board salary object into the display string the jobs UI expects. */
export function salaryLabel(salary: any): string | null {
  if (!salary) return null;
  const { min, max, currency, interval } = salary;
  const suffix = interval ? `/${interval}` : "";
  const unit = currency ? `${currency} ` : "";
  if (min && max) return `${unit}${Number(min).toLocaleString()}–${Number(max).toLocaleString()}${suffix}`;
  if (min || max) return `${unit}${Number(min || max).toLocaleString()}${suffix}`;
  return null;
}

export function initialsFor(company: string) {
  return String(company || "")
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
