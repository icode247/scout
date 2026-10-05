/**
 * The job feed a client sees on their Jobs page, shared with the assistant who
 * works that client. Both pages run the same saved search against the board and
 * apply the same visibility rule to the client's own rows, so "the jobs Scout
 * matched for me" means one list whoever is looking at it.
 */
import { searchJobBoard } from "./job-board";
import { describeMatch, jobLinkKey, type ClientApplicationRow, type ClientJobRow } from "./application-check";

export const DEFAULT_PLATFORMS = ["greenhouse", "lever", "ashby", "workable", "recruitee", "workday", "smartrecruiters"];

/** The search a profile runs before the client has saved any filters of their own. */
export function defaultSearchConfig(profile: any) {
  const applicant = profile?.applicant_profile || {};
  return {
    roles: (profile?.target_roles?.length ? profile.target_roles : [applicant.headline].filter(Boolean)) as string[],
    locations: (profile?.locations?.length ? profile.locations : [applicant.currentCity, applicant.country].filter(Boolean)) as string[],
    platforms: DEFAULT_PLATFORMS,
    work_modes: (applicant.remotePreference ? [String(applicant.remotePreference).toLowerCase().replace("on-site", "onsite")] : []) as string[],
    employment_types: [] as string[],
    experience_levels: [] as string[],
    company_blacklist: [] as string[],
    date_posted: "7d",
  };
}

const ACTED_ON = ["delegated", "preparing", "applied", "interview"];

/**
 * Which of a client's own job rows belong on the Jobs page: anything acted on,
 * nothing imported from FastApply matching, and search results only for the
 * saved search that is active now.
 */
export function isVisibleClientJob(job: { status: string; source?: string | null; fit_analysis?: any }, activeFilterId: string | null | undefined) {
  if (ACTED_ON.includes(job.status)) return true;
  if (["fastapply_match", "fastapply_job_board"].includes(String(job.source || ""))) return false;
  if (job.source === "job_search" && activeFilterId) return job.fit_analysis?.search_filter_id === activeFilterId;
  return true;
}

/**
 * A board page costs 2-24s upstream, so an instance keeps the last few payloads for a
 * few minutes. This is a request cache, not a corpus: it holds raw board responses keyed
 * by the exact upstream query, never anything member-specific (profile, assistant and
 * blacklist are applied after), and it dies with the instance.
 */
const CACHE_TTL_MS = 180_000;
const CACHE_MAX = 40;
const boardCache = new Map<string, { at: number; payload: any }>();
export async function fetchBoardCached(params: Record<string, string | number>, timeoutMs: number) {
  const key = JSON.stringify(params);
  const hit = boardCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.payload;
  const payload = await searchJobBoard(params, { timeoutMs });
  boardCache.set(key, { at: Date.now(), payload });
  if (boardCache.size > CACHE_MAX) boardCache.delete(boardCache.keys().next().value!);
  return payload;
}

export interface ListingState { jobId: string; jobStatus: string; applied: boolean; summary: string }

/**
 * Looks a posting up on the client's list by its link, ignoring tracking noise.
 * Built once per request so a page of board jobs is annotated in one pass.
 */
export function listingLookup(jobs: ClientJobRow[], applications: ClientApplicationRow[]) {
  const latest = new Map<string, ClientApplicationRow>();
  for (const application of applications) {
    const current = latest.get(application.job_id);
    if (!current || application.created_at > current.created_at) latest.set(application.job_id, application);
  }
  const byKey = new Map<string, ListingState>();
  for (const job of jobs) {
    const key = jobLinkKey(job.external_url);
    if (!key) continue;
    const state: ListingState = { jobId: job.id, jobStatus: job.status, ...describeMatch(job, latest.get(job.id) || null) };
    const existing = byKey.get(key);
    // When the same posting is on the list twice, the applied record is the one that matters.
    if (!existing || (state.applied && !existing.applied)) byKey.set(key, state);
  }
  return (url: string | null | undefined): ListingState | null => {
    const key = jobLinkKey(url);
    return key ? byKey.get(key) ?? null : null;
  };
}
