/**
 * "Has this client already applied here?" — the question an assistant asks
 * before spending time (and one of the client's applications) on a posting.
 *
 * Job boards wrap the same posting in tracking noise, so two links to one job
 * rarely match byte for byte. The check compares a stable key for each link
 * and falls back to the role and company, so a LinkedIn link and the company's
 * own careers page still land on the same answer.
 */

export type ApplicationMatchKind = "link" | "title";

export interface ClientJobRow {
  id: string;
  title: string | null;
  company: string | null;
  external_url: string | null;
  status: string;
  source: string | null;
  created_at?: string | null;
}

export interface ClientApplicationRow {
  id: string;
  job_id: string;
  status: string;
  assistant_type: string | null;
  submitted_at: string | null;
  created_at: string;
}

export interface ApplicationMatch {
  kind: ApplicationMatchKind;
  job: { id: string; title: string; company: string; url: string | null; source: string | null };
  application: { id: string; status: string; assistantType: string | null; submittedAt: string | null } | null;
  /** True when the client's record means the application was actually sent. */
  applied: boolean;
  /** What an assistant should read: "Applied 3 Oct by your assistant", etc. */
  summary: string;
}

const TRACKING_PARAMS = new Set([
  "ref", "refid", "ref_id", "referer", "referrer", "trackingid", "tracking_id", "trk", "src", "source", "from", "origin",
  "gclid", "fbclid", "msclkid", "mc_cid", "mc_eid", "igshid", "position", "pageno", "pagenum", "currentjobid",
  "eagerloadstate", "originalsubdomain", "original_referer", "alid", "sjdu", "tk", "vjs", "advn", "xkcb", "xpse", "xfps",
  "ss", "iis", "iisn", "lipi", "licu", "lici", "campaign", "cmp", "s", "t", "lr", "usg", "ved", "sa", "ei", "spm",
]);

function isTrackingParam(name: string) {
  const key = name.toLowerCase();
  return TRACKING_PARAMS.has(key) || key.startsWith("utm_") || key.startsWith("_hs") || key.startsWith("mkt_") || key.startsWith("pk_");
}

/**
 * A stable key for a job link: host without `www.`, the path, and only the
 * query parameters that identify the posting. Returns null when the value is
 * not an http(s) URL at all.
 */
export function jobLinkKey(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let url: URL;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw);
  try { url = new URL(hasScheme ? raw : `https://${raw}`); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^[a-z]{2}\.(linkedin\.com|indeed\.com|glassdoor\.com)$/, "$1");
  let path = url.pathname.replace(/\/+$/, "").replace(/\/+/g, "/").toLowerCase();

  // LinkedIn exposes the same job as /jobs/view/<id>/ and /jobs/view/<slug>-<id>;
  // Indeed as /viewjob?jk=<id>, /m/viewjob?jk=<id> and /rc/clk?jk=<id>.
  const linkedIn = path.match(/^\/jobs\/view\/(?:.*?-)?(\d+)$/);
  if (host.endsWith("linkedin.com") && linkedIn) return `linkedin.com/jobs/view/${linkedIn[1]}`;
  if (host.endsWith("linkedin.com") && url.searchParams.get("currentJobId")) return `linkedin.com/jobs/view/${url.searchParams.get("currentJobId")}`;
  if (host.endsWith("indeed.com") && url.searchParams.get("jk")) return `indeed.com/viewjob?jk=${url.searchParams.get("jk")!.toLowerCase()}`;
  if (host.endsWith("glassdoor.com")) {
    const listing = path.match(/jl=(\d+)/) || url.search.match(/jl=(\d+)/);
    if (listing) return `glassdoor.com/job-listing/${listing[1]}`;
  }

  const kept = [...url.searchParams.entries()].filter(([name]) => !isTrackingParam(name)).sort(([a], [b]) => a.localeCompare(b));
  const query = kept.length ? `?${kept.map(([name, value]) => `${name.toLowerCase()}=${value}`).join("&")}` : "";
  if (path === "" && !query) path = "/";
  return `${host}${path}${query}`;
}

/** Lowercase, no punctuation, no "Inc", "Ltd", "(Remote)" decorations, single spaces. */
export function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\b(inc|llc|ltd|limited|gmbh|plc|co|corp|corporation|company|srl|sa|ag|bv|the)\b\.?/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** True when two titles are the same role, allowing one to be a longer form of the other ("Designer" vs "Senior Product Designer"). */
export function similarTitle(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeText(a), right = normalizeText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right, longer = shorter === left ? right : left;
  if (shorter.length < 4) return false;
  return longer.includes(shorter);
}

export function sameCompany(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeText(a), right = normalizeText(b);
  if (!left || !right) return false;
  return left === right || (left.length >= 3 && right.length >= 3 && (left.startsWith(right) || right.startsWith(left)));
}

const APPLIED_STATUSES = new Set(["submitted", "evidence_ready", "interview"]);
const APPLIED_JOB_STATUSES = new Set(["applied", "interview"]);

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function who(assistantType: string | null | undefined) {
  if (assistantType === "ai") return "by Scout AI";
  if (assistantType === "human") return "by the assistant";
  return "by the client";
}

/** One sentence an assistant can act on, from the job and its (latest) application. */
export function describeMatch(job: ClientJobRow, application: ClientApplicationRow | null): { applied: boolean; summary: string } {
  if (application) {
    const date = formatDate(application.submitted_at || application.created_at);
    const when = date ? ` on ${date}` : "";
    switch (application.status) {
      case "submitted":
      case "evidence_ready": return { applied: true, summary: `Already applied${when} ${who(application.assistant_type)}. Do not apply again.` };
      case "interview": return { applied: true, summary: `Already applied${when} and the client has an interview. Do not apply again.` };
      case "preparing": return { applied: false, summary: `Requested by the client${when} and not applied yet. Find it under Requested and apply from there.` };
      case "needs_input": return { applied: false, summary: `Requested by the client${when}, waiting on their answer. Find it under Requested.` };
      case "rejected": return { applied: true, summary: `Applied${when} and rejected. Only apply again if the client asks for it.` };
      case "withdrawn": return { applied: false, summary: `On the client's list${when} but withdrawn or not applied (expired or not a fit). Check with the client before applying.` };
    }
  }
  if (APPLIED_JOB_STATUSES.has(job.status)) return { applied: true, summary: "Marked applied on the client's list. Do not apply again." };
  if (job.status === "skipped") return { applied: false, summary: "On the client's list but skipped. Check with the client before applying." };
  if (job.status === "delegated" || job.status === "preparing") return { applied: false, summary: "Requested by the client and not applied yet. Find it under Requested." };
  return { applied: false, summary: "Saved on the client's list but never applied. You can apply, then log it." };
}

export interface ApplicationCheckQuery { jobUrl?: string | null; title?: string | null; company?: string | null }

/**
 * Finds the client's existing records for a posting. Link matches come first
 * and are definitive; title-and-company matches follow as "probably the same
 * job" hints when the link differs or was not given.
 */
export function findApplicationMatches(query: ApplicationCheckQuery, jobs: ClientJobRow[], applications: ClientApplicationRow[]): ApplicationMatch[] {
  const key = jobLinkKey(query.jobUrl);
  const latestByJob = new Map<string, ClientApplicationRow>();
  for (const application of applications) {
    const current = latestByJob.get(application.job_id);
    if (!current || application.created_at > current.created_at) latestByJob.set(application.job_id, application);
  }

  const toMatch = (job: ClientJobRow, kind: ApplicationMatchKind): ApplicationMatch => {
    const application = latestByJob.get(job.id) || null;
    const { applied, summary } = describeMatch(job, application);
    return {
      kind, applied, summary,
      job: { id: job.id, title: job.title || "Unknown role", company: job.company || "Unknown company", url: job.external_url, source: job.source },
      application: application ? { id: application.id, status: application.status, assistantType: application.assistant_type, submittedAt: application.submitted_at } : null,
    };
  };

  const linkMatches = key ? jobs.filter((job) => jobLinkKey(job.external_url) === key) : [];
  const seen = new Set(linkMatches.map((job) => job.id));
  const titleMatches = query.title && query.company
    ? jobs.filter((job) => !seen.has(job.id) && sameCompany(job.company, query.company) && similarTitle(job.title, query.title))
    : [];

  const rank = (match: ApplicationMatch) => (match.applied ? 0 : 1);
  return [
    ...linkMatches.map((job) => toMatch(job, "link")).sort((a, b) => rank(a) - rank(b)),
    ...titleMatches.map((job) => toMatch(job, "title")).sort((a, b) => rank(a) - rank(b)),
  ];
}

/** The headline verdict for a set of matches. */
export function applicationCheckVerdict(matches: ApplicationMatch[]): { state: "clear" | "applied" | "listed" | "similar"; headline: string } {
  const link = matches.filter((match) => match.kind === "link");
  if (link.some((match) => match.applied)) return { state: "applied", headline: "Already applied — do not apply again" };
  if (link.length) return { state: "listed", headline: "Already on the client's list" };
  if (matches.some((match) => match.applied)) return { state: "similar", headline: "A matching role at this company was already applied to" };
  if (matches.length) return { state: "similar", headline: "A similar role at this company is on the client's list" };
  return { state: "clear", headline: "Not on the client's list — go ahead" };
}

export const isAppliedStatus = (status: string) => APPLIED_STATUSES.has(status);
