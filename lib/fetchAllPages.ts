// Supabase/PostgREST silently caps every select at 1,000 rows. street_schedules crossed that
// once Tel Aviv (~2,600 streets × 2 pickup days) joined, so whole-city and whole-table reads
// must page with .range() until a short page signals the end.
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error || !data) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}
