import type { APIRoute } from "astro";
import { assertCanWorkClient, createAdminClient, requireStaff } from "../../../lib/admin";
import { errorMessage, json } from "../../../lib/api";
import { JobBoardError } from "../../../lib/job-board";
import { sanitizeJobDescription } from "../../../lib/job-description";
import { initialsFor, normalizeBoardJob, salaryLabel } from "../../../lib/board-ingest";
import { boardSearchParams, dateWindowDays, nextBoardOffset, postedWindow } from "../../../lib/board-search";
import { defaultSearchConfig, fetchBoardCached, isVisibleClientJob, listingLookup } from "../../../lib/client-matches";
import { jobLinkKey, type ClientApplicationRow, type ClientJobRow } from "../../../lib/application-check";

export const prerender = false;
export const maxDuration = 60;
const BOARD_TIMEOUT_MS = 45000;

/**
 * The client's Jobs page, for the assistant who works them: the same saved
 * search run against the same board, plus the jobs the client saved without
 * sending, each marked with what is already on the client's list so nothing
 * is applied to twice.
 */
export const GET: APIRoute = async (context) => {
  try {
    const staff = requireStaff(context);
    const query = context.url.searchParams;
    const userId = (query.get("user_id") || "").slice(0, 64);
    if (!userId) return json({ error: "Client is required" }, { status: 400 });
    const admin = createAdminClient();
    await assertCanWorkClient(staff, admin, userId);

    const filterId = (query.get("filterId") || "").slice(0, 64);
    const requestedProfileId = (query.get("profileId") || "").slice(0, 64);
    const limit = Math.max(10, Math.min(50, Number(query.get("limit") || 30)));
    const offset = Math.max(0, Number(query.get("offset") || 0));

    // The same choice the client's page makes: the saved search they picked, else
    // the one marked active, else their first active profile's own targets.
    const filterQuery = admin.from("job_search_filters").select("*").eq("user_id", userId);
    const filterResult = filterId
      ? await filterQuery.eq("id", filterId).maybeSingle()
      : requestedProfileId
        ? { data: null, error: null }
        : await filterQuery.eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (filterResult.error) throw filterResult.error;
    const filter = filterResult.data;

    const profileId = filter?.job_profile_id || requestedProfileId;
    const profileQuery = admin.from("job_profiles").select("*").eq("user_id", userId);
    const profileResult = profileId
      ? await profileQuery.eq("id", profileId).maybeSingle()
      : await profileQuery.eq("active", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (profileResult.error) throw profileResult.error;
    const profile = profileResult.data;
    if (!profile) return json({ jobs: [], total: 0, offset, nextOffset: null, emptyReason: "This client has no job profile yet. Confirm their targets in WhatsApp." });

    const config = filter || defaultSearchConfig(profile);
    if (!config.roles?.length) return json({ jobs: [], total: 0, offset, nextOffset: null, emptyReason: "This client has no target roles saved, so there is nothing to search for yet." });

    const [ownJobs, ownApplications] = await Promise.all([
      admin.from("jobs").select("id,job_profile_id,title,company,location,employment_type,salary,description,external_url,status,source,is_saved,fit_analysis,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(5000),
      admin.from("applications").select("id,job_id,status,assistant_type,submitted_at,created_at").eq("user_id", userId).limit(5000),
    ]);
    if (ownJobs.error) throw ownJobs.error;
    if (ownApplications.error) throw ownApplications.error;
    const clientJobs = ownJobs.data || [];
    const lookup = listingLookup(clientJobs as ClientJobRow[], (ownApplications.data || []) as ClientApplicationRow[]);

    const runQuery = async (withinDateWindow: boolean, withLocation = true) => {
      const payload = await fetchBoardCached(boardSearchParams(config, { limit, offset, withinDateWindow, withLocation }), BOARD_TIMEOUT_MS);
      return { rows: Array.isArray(payload?.data) ? payload.data : [], meta: payload?.meta || {} };
    };
    const relaxRequested = query.get("relaxed") === "1";
    let relaxedDate = relaxRequested;
    let result = await runQuery(!relaxRequested);
    if (!result.rows.length && !relaxRequested && offset === 0 && postedWindow(config)) {
      const widened = await runQuery(false);
      if (widened.rows.length) { result = widened; relaxedDate = true; }
    }

    const profileName = profile.name || "General profile";
    const blacklist = (config.company_blacklist || []).map((value: string) => value.toLowerCase());
    const boardJobs = result.rows
      .map((raw: any) => normalizeBoardJob(raw))
      .filter((row: any): row is NonNullable<typeof row> => Boolean(row))
      .filter((row: any) => !blacklist.some((name: string) => String(row.company || "").toLowerCase().includes(name)))
      .map((row: any) => ({
        id: `board:${row.external_id}`, origin: "board", saved: false,
        job_profile_id: profile.id, profileName,
        title: row.title, company: row.company, location: row.location || "",
        logo: row.logo_url || null, initials: initialsFor(row.company),
        salary: salaryLabel(row.salary), employment_type: row.employment_type || null,
        workplace_type: row.workplace_type || null, posted_at: row.posted_at,
        external_url: row.external_url, summaryHtml: sanitizeJobDescription(String(row.description || "")),
        listing: lookup(row.external_url),
      }));

    // The jobs the client keeps on their own page without having sent them: saved
    // or added by hand. Requested and applied jobs already have their own sections.
    const ownRows = offset === 0
      ? clientJobs
        .filter((job) => job.status === "saved" && job.external_url && isVisibleClientJob(job, filter?.id))
        .filter((job) => !job.job_profile_id || job.job_profile_id === profile.id)
        .map((job) => ({
          id: job.id, origin: "client", saved: Boolean(job.is_saved),
          job_profile_id: job.job_profile_id || profile.id, profileName,
          title: job.title, company: job.company, location: job.location || "",
          logo: (job.fit_analysis as any)?.logo_url || null, initials: initialsFor(job.company || ""),
          salary: typeof job.salary === "string" ? job.salary : null, employment_type: job.employment_type || null,
          workplace_type: (job.fit_analysis as any)?.workplace_type || null,
          posted_at: (job.fit_analysis as any)?.date_posted || job.created_at,
          external_url: job.external_url, summaryHtml: sanitizeJobDescription(String(job.description || "")),
          listing: lookup(job.external_url),
        }))
      : [];
    const ownKeys = new Set(ownRows.map((row) => jobLinkKey(row.external_url)));
    const jobs = [...ownRows, ...boardJobs.filter((row: any) => !ownKeys.has(jobLinkKey(row.external_url)))];

    let emptyReason: string | null = null;
    const selected = (config.locations || []).map((value: string) => String(value).trim()).filter(Boolean);
    if (!jobs.length && offset === 0) {
      emptyReason = "The board has nothing for this search right now. Look on LinkedIn, Indeed and company sites instead.";
      if (selected.length && (await runQuery(false, false)).rows.length) {
        emptyReason = `No jobs are listed under ${selected.map((value: string) => `“${value}”`).join(" or ")}. Ask the client in WhatsApp whether a broader location works.`;
      }
    }

    return json({
      jobs, offset, relaxedDate, emptyReason,
      total: Number(result.meta.total ?? boardJobs.length),
      nextOffset: nextBoardOffset(result.rows.length, result.meta, limit, offset),
      dateWindowDays: dateWindowDays(config),
      search: { name: filter?.name || profileName, roles: config.roles || [], locations: config.locations || [] },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof JobBoardError && error.status >= 500) {
      return json({ error: "The job board took too long on this search. Try again in a moment." }, { status: 503 });
    }
    return json({ error: errorMessage(error) }, { status: error instanceof JobBoardError ? error.status : 500 });
  }
};
