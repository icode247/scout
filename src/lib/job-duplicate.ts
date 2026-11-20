/**
 * Spotting a job the member has already sent to their assistant, so the same
 * role is not delegated (and counted against their plan) twice.
 */

export type SentJob = {
  title: string | null;
  company: string | null;
  location: string | null;
  external_url: string | null;
  created_at?: string | null;
};

/** Query parameters that track where a click came from, not which job it is. */
const TRACKING_PARAM = /^(utm_.+|trk|trackingid|refid|ref|referer|referrer|src|source|gh_src|lever-source.*|ebp|sid|eid|position|pagenum|from|fbclid|gclid|mc_[a-z]+)$/i;

const text = (value: string | null | undefined) => String(value || "").toLowerCase().replace(/\s+/g, " ").trim();

/** A job URL with tracking parameters, fragment and trailing slash removed. */
export function canonicalJobUrl(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    const kept = [...url.searchParams.entries()].filter(([key]) => !TRACKING_PARAM.test(key)).sort(([a], [b]) => a.localeCompare(b));
    const query = new URLSearchParams(kept).toString();
    return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}${query ? `?${query}` : ""}`;
  } catch {
    return "";
  }
}

/**
 * True when two jobs are the same posting: the same link, or the same title at
 * the same company in the same place (a missing location matches any).
 */
export function isSameJob(a: SentJob, b: SentJob): boolean {
  const urlA = canonicalJobUrl(a.external_url), urlB = canonicalJobUrl(b.external_url);
  if (urlA && urlA === urlB) return true;
  if (!text(a.title) || text(a.title) !== text(b.title) || text(a.company) !== text(b.company)) return false;
  const locationA = text(a.location), locationB = text(b.location);
  return !locationA || !locationB || locationA === locationB;
}

export function findSentDuplicate<T extends SentJob>(job: SentJob, sent: T[]): T | null {
  return sent.find((candidate) => isSameJob(job, candidate)) || null;
}

export function duplicateMessage(sentAt: string | null | undefined): string {
  const date = sentAt ? new Date(sentAt) : null;
  const when = date && !Number.isNaN(date.getTime()) ? ` on ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : "";
  return `You already sent this job to your assistant${when}. It is in your applications.`;
}
