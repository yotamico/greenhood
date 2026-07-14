// Maps items through an async fn with bounded concurrency, preserving input order.
// Per-street city sources need one HTTP request per street (hundreds per city); fully
// sequential fetching would blow past the cron route's execution window, while unbounded
// Promise.all would hammer small municipal servers — a small fixed pool is the middle ground.
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
