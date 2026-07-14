import WebSocketImpl from "ws";
import { CITY_ADAPTERS } from "../lib/streetSchedules/registry";
import { syncCity } from "../lib/streetSchedules/sync";

// Plain `node` (unlike the Next.js runtime) has no global WebSocket on Node < 22,
// which @supabase/supabase-js needs even though this script never uses realtime.
if (!globalThis.WebSocket) {
  (globalThis as unknown as { WebSocket: typeof WebSocketImpl }).WebSocket = WebSocketImpl;
}

async function main() {
  const key = process.argv[2];
  const available = Object.keys(CITY_ADAPTERS).join(", ") || "(none yet — Stage A has no adapters)";
  if (!key) {
    console.error(`Usage: npm run sync-city -- <adapter-key>\nAvailable: ${available}`);
    process.exit(1);
  }
  const adapter = CITY_ADAPTERS[key];
  if (!adapter) {
    console.error(`Unknown adapter key "${key}". Available: ${available}`);
    process.exit(1);
  }

  const result = await syncCity(adapter);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main();
