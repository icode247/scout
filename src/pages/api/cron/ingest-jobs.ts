import type { APIRoute } from "astro";
import { json } from "../../../lib/api";
import { createSupabaseServiceClient } from "../../../lib/supabase";
import { JobBoardError, searchJobBoard } from "../../../lib/job-board";
import { INGEST_AXES, PAGES_PER_RUN, PAGE_SIZE, nextCursor, normalizeBoardJob } from "../../../lib/board-ingest";

export const prerender = false;
// Board pages measured at 1.6-14s each, so a full sweep needs room.
export const maxDuration = 300;

/** Same constant-time bearer check the reconcile cron uses. */
function authorized(request: Request): boolean {
  const secret = import.meta.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

async function run(request: Request) {
  if (!authorized(request)) return json({ error: "Unauthorized" }, { status: 401 });

  let supabase;
  try {
    supabase = createSupabaseServiceClient();
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Service role unavailable" }, { status: 503 });
  }

  const cursors = await supabase.from("board_ingest_cursor").select("axis,next_offset,last_run_at");
  if (cursors.error) return json({ error: cursors.error.message }, { status: 500 });

  interface CursorRow { axis: string; next_offset: number; last_run_at: string | null; rows_ingested?: number }
  const byAxis = new Map<string, CursorRow>((cursors.data || []).map((row: any) => [String(row.axis), row as CursorRow]));

  // Rotate: take the axis that has gone longest without a run, so every ATS
  // makes progress instead of one starving the rest.
  const axis = [...INGEST_AXES].sort((a, b) => {
    const left = byAxis.get(a.key)?.last_run_at;
    const right = byAxis.get(b.key)?.last_run_at;
    if (!left) return -1;
    if (!right) return 1;
    return new Date(left).getTime() - new Date(right).getTime();
  })[0];

  let offset = Number(byAxis.get(axis.key)?.next_offset || 0);
  let upserted = 0;
  let pages = 0;
  let lastError: string | null = null;

  for (let page = 0; page < PAGES_PER_RUN; page += 1) {
    let payload: any;
    try {
      payload = await searchJobBoard({ ...axis.params, limit: PAGE_SIZE, offset, include: "description" });
    } catch (error) {
      // Leave the cursor where it is so the next tick retries this page rather
      // than skipping over jobs we never ingested.
      lastError = error instanceof JobBoardError ? error.message : "Board request failed";
      break;
    }

    // The board can return the same external_id twice inside one page, and
    // Postgres rejects an ON CONFLICT that touches a row twice in one statement.
    // Keep the last occurrence of each key.
    const deduped = new Map<string, any>();
    for (const raw of Array.isArray(payload?.data) ? payload.data : []) {
      const row = normalizeBoardJob(raw);
      if (row) deduped.set(row.external_id, row);
    }
    const rows = [...deduped.values()];

    if (!rows.length) {
      offset = nextCursor(offset, PAGE_SIZE);
      pages += 1;
      break;
    }

    const written = await supabase
      .from("board_jobs")
      .upsert(rows.map((row: any) => ({ ...row, ingested_at: new Date().toISOString() })), { onConflict: "external_id" });
    if (written.error) {
      lastError = written.error.message;
      break;
    }

    upserted += rows.length;
    pages += 1;
    offset = nextCursor(offset, PAGE_SIZE);
    // Wrapped back to the start of this axis: stop here and resume next tick.
    if (offset === 0) break;
  }

  const cursorWrite = await supabase.from("board_ingest_cursor").upsert({
    axis: axis.key,
    next_offset: offset,
    last_run_at: new Date().toISOString(),
    last_error: lastError,
    rows_ingested: Number(byAxis.get(axis.key)?.rows_ingested || 0) + upserted,
  }, { onConflict: "axis" });
  if (cursorWrite.error) return json({ error: cursorWrite.error.message }, { status: 500 });

  return json({ ok: true, axis: axis.key, pages, upserted, nextOffset: offset, error: lastError });
}

export const GET: APIRoute = ({ request }) => run(request);
export const POST: APIRoute = ({ request }) => run(request);
