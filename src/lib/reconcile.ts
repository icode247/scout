import type { SupabaseClient } from "@supabase/supabase-js";
import { firstApply, FirstApplyError } from "./first-apply";
import { fastApplyExternalId } from "./fastapply-applicant";
import { scoreAndPersistJob } from "./job-match";

// Row-fetch caps. Kept generous; the real throttle is APPLICANT_BUDGET below.
const RECONCILE_BATCH = 60; // in-flight local applications pulled per run
const AGENT_BATCH = 60; // active agent configs pulled per run
// FastApply allows ~60 req/min/key. We make one history GET per distinct applicant, sequentially,
// so cap distinct applicants per run below that with headroom for the occasional retry.
const APPLICANT_BUDGET = 45;
const SCORE_BATCH = 10;
const HISTORY_PAGE_SIZE = 100;

// Local remote_status values that mean "still live, keep polling".
const OPEN_REMOTE_STATUSES = ["pending", "queued", "processing", "running"];

interface MappedStatus {
  remoteStatus: string;
  /** Local applications.status enum value, when the remote state implies one. */
  status?: "submitted";
  submitted?: boolean;
}

/**
 * Map a FastApply application-history status (`pending | submitted | failed`, per the Enterprise
 * API §11) onto Scout's local vocabulary. `failed` has no applications.status enum value, so it
 * lives only in remote_status. Unknown values fall through to "keep polling".
 */
function mapApplicationStatus(raw: string): MappedStatus {
  switch (String(raw || "").toLowerCase()) {
    case "submitted": return { remoteStatus: "submitted", status: "submitted", submitted: true };
    case "failed": return { remoteStatus: "failed" };
    case "pending": return { remoteStatus: "pending" };
    default: return { remoteStatus: String(raw || "pending").toLowerCase() };
  }
}

function embeddedExternalUrl(row: Record<string, any>): string {
  const embed = row.jobs;
  const value = Array.isArray(embed) ? embed[0]?.external_url : embed?.external_url;
  return String(value || "");
}

function historyItems(history: any): any[] {
  if (Array.isArray(history?.data)) return history.data;
  if (Array.isArray(history)) return history;
  return [];
}

function historyUrl(item: any): string {
  return String(item?.jobUrl || item?.url || item?.applyUrl || item?.external_url || "");
}

function toIsoDate(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A distinct FastApply applicant we will hit the history endpoint for, once, this run. */
interface Applicant {
  userId: string;
  jobProfileId: string;
  /** Parent scheduled-automation id, when this applicant has an active agent. Enables ingestion. */
  automationId: string | null;
  /** In-flight local application rows for this applicant that need a status update. */
  openRows: Array<Record<string, any>>;
}

export interface ReconcileResult {
  /** Distinct applicants whose history we fetched. */
  applicants: number;
  /** In-flight local rows whose status advanced. */
  updated: number;
  /** Automation applies with no prior local row that we ingested. */
  ingested: number;
  errors: number;
}

/**
 * Fold the true state of FastApply automations back into the local `applications` table. Two
 * classes of drift are closed here from a single history fetch per applicant:
 *
 *  1. In-flight single-applies (`ai-jobs.ts` created a local row, status still open) — advanced to
 *     submitted/failed.
 *  2. Scheduled-automation applies (`ai-agent.ts` → `POST /b2b/automations` applies autonomously,
 *     leaving NO local row) — ingested as new rows so they are observed, billed-against, and shown.
 *
 * Status is authoritative in the applicant's history (`GET /applicants/{externalId}/applications`),
 * matched by job URL — NOT in `/b2b/automations`, which only tracks the schedule, not each apply.
 */
export async function reconcileAutomations(admin: SupabaseClient): Promise<ReconcileResult> {
  const [openRes, agentRes] = await Promise.all([
    admin
      .from("applications")
      .select("id,user_id,job_id,job_profile_id,status,remote_status,submitted_at,jobs!inner(external_url)")
      .not("remote_automation_id", "is", null)
      .in("remote_status", OPEN_REMOTE_STATUSES)
      .order("updated_at", { ascending: true })
      .limit(RECONCILE_BATCH),
    admin
      .from("ai_agent_configs")
      .select("user_id,job_profile_id,first_apply_id")
      .eq("status", "active")
      .not("first_apply_id", "is", null)
      .order("synced_at", { ascending: true, nullsFirst: true })
      .limit(AGENT_BATCH),
  ]);
  if (openRes.error) throw new Error(`reconcile open-rows query failed: ${openRes.error.message}`);
  if (agentRes.error) throw new Error(`reconcile agent query failed: ${agentRes.error.message}`);

  // Build the distinct-applicant registry. In-flight rows are registered first so status updates
  // (time-sensitive) win the APPLICANT_BUDGET over ingestion-only applicants.
  const applicants = new Map<string, Applicant>();
  const order: string[] = [];
  const ensure = (userId: string, jobProfileId: string, automationId: string | null): Applicant => {
    const externalId = fastApplyExternalId(userId, jobProfileId);
    let applicant = applicants.get(externalId);
    if (!applicant) {
      applicant = { userId, jobProfileId, automationId, openRows: [] };
      applicants.set(externalId, applicant);
      order.push(externalId);
    } else if (!applicant.automationId && automationId) {
      applicant.automationId = automationId;
    }
    return applicant;
  };

  for (const row of (openRes.data || []) as Array<Record<string, any>>) {
    if (!row.job_profile_id) continue; // externalId requires a profile; legacy rows can't be keyed.
    ensure(row.user_id, row.job_profile_id, null).openRows.push(row);
  }
  for (const cfg of (agentRes.data || []) as Array<Record<string, any>>) {
    if (!cfg.job_profile_id) continue;
    ensure(cfg.user_id, cfg.job_profile_id, cfg.first_apply_id);
  }

  const selected = order.slice(0, APPLICANT_BUDGET);
  let updated = 0;
  let ingested = 0;
  let errors = 0;

  for (const externalId of selected) {
    const applicant = applicants.get(externalId)!;
    let items: any[];
    try {
      items = historyItems(await firstApply.getApplicantApplications(externalId, 1, HISTORY_PAGE_SIZE));
    } catch (error) {
      // An applicant that does not exist upstream has no history to reconcile.
      // That is a normal state before the first apply, and it also happens when
      // the applicant was created under a different api key. Treating it as a
      // failure logged the same line every five minutes forever; the next apply
      // recreates the applicant, so skip quietly instead.
      if (error instanceof FirstApplyError && error.status === 404) continue;
      errors += Math.max(1, applicant.openRows.length);
      console.error(`[reconcile] history for ${externalId}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    // History is newest-first; keep the latest item per URL.
    const byUrl = new Map<string, any>();
    for (const item of items) {
      const url = historyUrl(item);
      if (url && !byUrl.has(url)) byUrl.set(url, item);
    }

    // (1) Advance in-flight local rows.
    for (const row of applicant.openRows) {
      const url = embeddedExternalUrl(row);
      const remote = url ? byUrl.get(url) : undefined;
      if (!remote) continue; // Not yet visible in history — leave open for a later run.

      const mapped = mapApplicationStatus(String(remote.status || ""));
      if (mapped.remoteStatus === row.remote_status && !mapped.status) continue; // no change

      const patch: Record<string, unknown> = { remote_status: mapped.remoteStatus, updated_at: new Date().toISOString() };
      if (mapped.status) patch.status = mapped.status;
      if (mapped.submitted && !row.submitted_at) patch.submitted_at = toIsoDate(remote.appliedAt) || new Date().toISOString();
      if (remote.id) patch.remote_application_id = String(remote.id);

      try {
        const result = await admin.from("applications").update(patch).eq("id", row.id).eq("user_id", row.user_id);
        if (result.error) throw result.error;
        updated++;
      } catch (error) {
        errors++;
        console.error(`[reconcile] update ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // (2) Ingest automation applies that have no local row (active agents only).
    if (!applicant.automationId) continue;

    // Fast-path skip: URLs this applicant already has an application for. The unique(user_id,job_id)
    // upsert below is the real safety net; this just avoids needless find-or-create round-trips.
    const knownUrls = new Set<string>();
    const known = await admin
      .from("applications")
      .select("id,jobs!inner(external_url)")
      .eq("user_id", applicant.userId)
      .eq("job_profile_id", applicant.jobProfileId);
    if (!known.error) {
      for (const row of known.data || []) {
        const url = embeddedExternalUrl(row as Record<string, any>);
        if (url) knownUrls.add(url);
      }
    }

    for (const [url, item] of byUrl) {
      if (!url || knownUrls.has(url)) continue;
      try {
        if (await ingestApplication(admin, applicant, url, item)) ingested++;
      } catch (error) {
        errors++;
        console.error(`[reconcile] ingest ${externalId} ${url}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return { applicants: selected.length, updated, ingested, errors };
}

/**
 * Materialise one automation-originated apply into the local tables. Idempotent: find-or-create the
 * `jobs` row by (user_id, external_url), then upsert the `applications` row on the
 * unique(user_id, job_id) constraint with ignoreDuplicates. Returns true only when a new
 * application row was actually inserted.
 */
async function ingestApplication(
  admin: SupabaseClient,
  applicant: Applicant,
  url: string,
  item: any,
): Promise<boolean> {
  const mapped = mapApplicationStatus(String(item?.status || ""));

  const found = await admin
    .from("jobs")
    .select("id")
    .eq("user_id", applicant.userId)
    .eq("external_url", url)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (found.error) throw found.error;

  let jobId = found.data?.id as string | undefined;
  if (!jobId) {
    const inserted = await admin
      .from("jobs")
      .insert({
        user_id: applicant.userId,
        job_profile_id: applicant.jobProfileId,
        title: String(item?.jobTitle || item?.title || "Applied role").slice(0, 180),
        company: String(item?.company || "Company").slice(0, 180),
        location: String(item?.location || "").slice(0, 240),
        employment_type: item?.employmentType || item?.jobType || null,
        description: String(item?.description || "").slice(0, 50000),
        external_url: url,
        source: "fastapply_automation",
        status: mapped.submitted ? "applied" : "delegated",
        assistant_type: "ai",
      })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;
    jobId = inserted.data.id;
  }

  const claim = await admin
    .from("applications")
    .upsert(
      {
        user_id: applicant.userId,
        job_id: jobId,
        job_profile_id: applicant.jobProfileId,
        assistant_type: "ai",
        status: mapped.status ?? "preparing",
        remote_status: mapped.remoteStatus,
        remote_automation_id: applicant.automationId,
        remote_application_id: item?.id ? String(item.id) : null,
        platform: item?.platform || null,
        submitted_at: mapped.submitted ? toIsoDate(item?.appliedAt) || new Date().toISOString() : null,
        notes: "Ingested from Scout AI automation history.",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,job_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  if (claim.error) throw claim.error;
  return Boolean(claim.data);
}

export interface ScoreResult { scored: number; failed: number }

/**
 * Score jobs still awaiting a fit analysis in the background, so the LLM call never blocks a
 * user-facing request. `scoreAndPersistJob` is user-scoped by the `userId` argument, so it is
 * safe to drive with the service-role client here.
 */
export async function scorePendingJobs(admin: SupabaseClient): Promise<ScoreResult> {
  const pending = await admin
    .from("jobs")
    .select("*")
    .eq("fit_status", "pending")
    .not("job_profile_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(SCORE_BATCH);
  if (pending.error) throw new Error(`score query failed: ${pending.error.message}`);

  const rows = pending.data || [];
  let scored = 0;
  let failed = 0;

  for (const job of rows) {
    try {
      await scoreAndPersistJob(admin, job.user_id, job);
      scored++;
    } catch (error) {
      // scoreAndPersistJob already persists fit_status='failed' + fit_error; just count it.
      failed++;
      console.error(`[score] job ${job.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { scored, failed };
}
