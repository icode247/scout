/**
 * Supabase (PostgREST) returns at most 1000 rows per request, whatever `.limit()`
 * asks for, and says nothing when it truncates. A query that can exceed that has
 * to be read in pages, or the rows past the cap silently disappear.
 */
export const SUPABASE_PAGE_SIZE = 1000;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: any }>;

/**
 * Reads up to `max` rows by calling `page(from, to)` for consecutive ranges.
 * `page` must build a fresh query each call and order it deterministically
 * (end with a unique column such as `id`) so rows do not shift between pages.
 */
export async function selectPages<T>(page: (from: number, to: number) => PageResult<T>, max: number): Promise<{ data: T[]; error: any }> {
  const rows: T[] = [];
  while (rows.length < max) {
    const from = rows.length;
    const to = Math.min(from + SUPABASE_PAGE_SIZE, max) - 1;
    const { data, error } = await page(from, to);
    if (error) return { data: rows, error };
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < to - from + 1) break;
  }
  return { data: rows, error: null };
}
