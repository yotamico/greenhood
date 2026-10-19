import WebSocketImpl from "ws";
import { CITY_ADAPTERS } from "../lib/streetSchedules/registry";
import { syncCity, SyncResult } from "../lib/streetSchedules/sync";

// Plain `node` (unlike the Next.js runtime) has no global WebSocket on Node < 22,
// which @supabase/supabase-js needs even though this script never uses realtime.
if (!globalThis.WebSocket) {
  (globalThis as unknown as { WebSocket: typeof WebSocketImpl }).WebSocket = WebSocketImpl;
}

// Usage: npm run sync-city -- <adapter-key> [<adapter-key> ...] [--no-geocode]
// --no-geocode skips phase 2 (Nominatim lookups for streets without coordinates, ~1 per second):
// the schedules themselves are refreshed in minutes, and a later normal run fills coordinates in.
async function main() {
  const args = process.argv.slice(2);
  const geocode = !args.includes("--no-geocode");
  const keys = args.filter((a) => !a.startsWith("--"));
  const available = Object.keys(CITY_ADAPTERS).join(", ") || "(none yet — Stage A has no adapters)";
  if (!keys.length) {
    console.error(`Usage: npm run sync-city -- <adapter-key> [<adapter-key> ...] [--no-geocode]\nAvailable: ${available}`);
    process.exit(1);
  }
  const unknown = keys.filter((k) => !CITY_ADAPTERS[k]);
  if (unknown.length) {
    console.error(`Unknown adapter key(s) ${unknown.map((k) => `"${k}"`).join(", ")}. Available: ${available}`);
    process.exit(1);
  }

  const results: SyncResult[] = [];
  for (const key of keys) {
    const result = await syncCity(CITY_ADAPTERS[key], undefined, { geocode });
    console.log(JSON.stringify(result, null, 2));
    results.push(result);
  }
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

main();
