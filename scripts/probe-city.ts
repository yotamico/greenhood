import { CITY_ADAPTERS } from "../lib/streetSchedules/registry";

// Dry run of one city adapter: fetches and parses the source exactly like a real sync, but never
// touches the database. Answers "can this environment reach and parse this city's source, and how
// long does it take?" — used to test whether an environment (e.g. a GitHub Actions runner) is
// blocked by a municipal site, without needing any credentials.
// Usage: npx tsx scripts/probe-city.ts <adapter-key>
async function main() {
  const key = process.argv[2];
  const adapter = key ? CITY_ADAPTERS[key] : undefined;
  if (!adapter) {
    console.error(`Usage: npx tsx scripts/probe-city.ts <adapter-key>\nAvailable: ${Object.keys(CITY_ADAPTERS).join(", ")}`);
    process.exit(1);
  }
  const started = Date.now();
  try {
    const rows = await adapter.fetchStreets();
    const streets = new Set(rows.map((r) => r.street_name)).size;
    console.log(JSON.stringify({ key, city: adapter.city, ok: true, rows: rows.length, streets, seconds: Math.round((Date.now() - started) / 1000) }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ key, city: adapter.city, ok: false, error: message, seconds: Math.round((Date.now() - started) / 1000) }));
    process.exit(1);
  }
}

main();
