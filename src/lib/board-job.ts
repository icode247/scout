import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `jobs.id` is a uuid column, so a non-uuid reference must never reach a query. */
export const isUuid = (value: unknown): boolean => UUID_RE.test(String(value ?? ""));

/**
 * Board search results are not rows. They are served straight from `board_jobs` with a
 * synthetic `board:<external_id>` id and `persisted: false`, and they live only in the
 * browser until the member saves one or applies to it. Acting on one therefore has to
 * create the real `jobs` row first — passing the synthetic id to `.eq("id", …)` makes
 * Postgres reject the whole statement with `invalid input syntax for type uuid`.
 *
 * Resolution order: an existing row by id, then by (user_id, external_url) so the same
 * listing is never stored twice, and only then an insert.
 */
export async function resolveJobRow(
  supabase: SupabaseClient,
  userId: string,
  body: Record<string, any>,
  seed: { status?: string; is_saved?: boolean } = {},
) {
  const id = String(body.id ?? body.localId ?? "");
  if (isUuid(id)) {
    const existing = await supabase.from("jobs").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return existing.data;
  }

  const externalUrl = String(body.external_url ?? body.url ?? "").trim();
  if (!externalUrl) throw new Error("This job cannot be saved because it has no application link.");

  const matched = await supabase.from("jobs").select("*").eq("user_id", userId).eq("external_url", externalUrl).maybeSingle();
  if (matched.error) throw matched.error;
  if (matched.data) return matched.data;

  const profileId = String(body.job_profile_id ?? body.profileId ?? "");
  const inserted = await supabase.from("jobs").insert({
    user_id: userId,
    job_profile_id: profileId || null,
    title: String(body.title || "Untitled role").slice(0, 180),
    company: String(body.company || "Company").slice(0, 180),
    location: String(body.location || "").slice(0, 240),
    employment_type: body.employment_type || null,
    salary: body.salary || null,
    description: String(body.description || "").slice(0, 50_000),
    external_url: externalUrl,
    // Keeps the provenance honest, and the jobs page only hides board rows that have
    // not been acted on — a saved or delegated one stays visible.
    source: "job_board",
    assistant_type: body.assistant_type === "human" ? "human" : "ai",
    status: seed.status || "saved",
    is_saved: seed.is_saved ?? false,
    fit_analysis: body.fit_analysis && typeof body.fit_analysis === "object" && !Array.isArray(body.fit_analysis) ? body.fit_analysis : {},
  }).select("*").single();
  if (inserted.error) throw inserted.error;
  return inserted.data;
}
