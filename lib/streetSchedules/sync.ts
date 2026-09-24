import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { CityAdapter } from "./types";
import { geocodeStreet } from "../geocode";

export interface SyncResult {
  city: string;
  ok: boolean;
  rowCount: number;
  geocoded?: number;
  missingCoords?: number;
  error?: string;
}

// Supabase's PostgrestError (and similar thrown API error objects) aren't `instanceof Error`,
// so `err.message` / `String(err)` silently degrade to "[object Object]" for them - this was
// observed hiding the real cause of a failed sync. Prefer any `.message` string present.
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return String(err);
}

function getServiceClient(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
}

// Two-phase sync: schedule data is upserted FIRST (fast, one round-trip), and only then are
// missing coordinates filled in street by street. Geocoding is Nominatim-throttled to ~1/sec,
// so a city with hundreds of new streets can take many minutes; by persisting rows before
// geocoding, an interrupted run (serverless window, killed CLI) loses nothing: the next run
// reuses every coordinate already resolved and continues from wherever it stopped.
export async function syncCity(adapter: CityAdapter, client?: SupabaseClient): Promise<SyncResult> {
  const supabase = client ?? getServiceClient();
  // Stamp the attempt regardless of caller (cron round-robin or a manual CLI run) - otherwise a
  // manually-synced city's last_attempted_at stays NULL forever, which the round-robin below
  // treats as "never attempted" and lets it perpetually cut ahead of cities with a real,
  // unresolved sync error.
  await supabase
    .from("city_sync_sources")
    .update({ last_attempted_at: new Date().toISOString() })
    .eq("city", adapter.city);
  try {
    const rawRows = await adapter.fetchStreets();
    // A guard against wiping a whole city because the source site changed its markup or was
    // temporarily down: an empty result is treated as a failed sync, never as "no streets".
    if (rawRows.length === 0) throw new Error("adapter returned 0 rows - refusing to overwrite existing data");

    const { data: existing, error: existingError } = await supabase
      .from("street_schedules")
      .select("id,street_name,collection_day,lat,lng")
      .eq("city", adapter.city);
    if (existingError) throw existingError;
    const knownCoords = new Map<string, { lat: number; lng: number }>();
    for (const row of existing ?? []) {
      if (row.lat != null && row.lng != null) knownCoords.set(row.street_name, { lat: row.lat, lng: row.lng });
    }

    const rows = rawRows.map((row) => {
      const known = row.lat == null || row.lng == null ? knownCoords.get(row.street_name) : undefined;
      return {
        city: adapter.city,
        street_name: row.street_name,
        collection_day: row.collection_day,
        takeout_day: row.takeout_day,
        lat: row.lat ?? known?.lat ?? null,
        lng: row.lng ?? known?.lng ?? null,
      };
    });

    const { error: upsertError } = await supabase
      .from("street_schedules")
      .upsert(rows, { onConflict: "city,street_name,collection_day" });
    if (upsertError) throw upsertError;

    // Rows that disappeared from the source (renamed streets, schedule reshuffles) are stale.
    const freshKeys = new Set(rows.map((r) => `${r.street_name}|${r.collection_day}`));
    const staleIds = (existing ?? [])
      .filter((r) => !freshKeys.has(`${r.street_name}|${r.collection_day}`))
      .map((r) => r.id);
    if (staleIds.length > 0) {
      const { error: deleteError } = await supabase.from("street_schedules").delete().in("id", staleIds);
      if (deleteError) throw deleteError;
    }

    await supabase
      .from("city_sync_sources")
      .update({ last_synced_at: new Date().toISOString(), last_sync_row_count: rows.length, last_sync_error: null })
      .eq("city", adapter.city);

    // Phase 2: fill missing coordinates, persisting each street as soon as it resolves.
    const unresolved = [...new Set(rows.filter((r) => r.lat == null || r.lng == null).map((r) => r.street_name))];
    let geocoded = 0;
    for (const streetName of unresolved) {
      const coords = await geocodeStreet(adapter.city, streetName);
      if (!coords) continue;
      const { error: coordError } = await supabase
        .from("street_schedules")
        .update({ lat: coords.lat, lng: coords.lng })
        .eq("city", adapter.city)
        .eq("street_name", streetName);
      if (!coordError) geocoded++;
    }

    return {
      city: adapter.city,
      ok: true,
      rowCount: rows.length,
      geocoded,
      missingCoords: unresolved.length - geocoded,
    };
  } catch (err) {
    const message = errorMessage(err);
    await supabase
      .from("city_sync_sources")
      .update({ last_sync_error: message })
      .eq("city", adapter.city);
    return { city: adapter.city, ok: false, rowCount: 0, error: message };
  }
}

// A new city is only started while less than this much of the cron's 300s window has elapsed,
// leaving room for it to finish (per-street sources like Rishon take ~1 min; Tel Aviv ~4 min).
const NEW_CITY_START_BUDGET_MS = 120_000;

// Daily cron entry point. Cities are worked through in priority order, one after another, until
// the time budget runs out - each city at most once per invocation. Order: (1) never-attempted
// cities first (they deserve an initial try), then errored and healthy cities alternating
// (errored first - retried on the very next run instead of waiting a full round-robin cycle),
// each group oldest-attempted first. Running several cities per invocation matters because a
// blocked source (403 / connection refused) fails quickly: with one city per run, N permanently
// failing cities occupied every daily slot and the healthy cities were never refreshed at all.
// Sorted client-side (not via .order()) since Postgrest can't express this computed ordering;
// the source table is tiny (one row per city) so fetching it whole is cheap.
export async function syncCitiesWithinBudget(budgetMs = NEW_CITY_START_BUDGET_MS): Promise<SyncResult[]> {
  const started = Date.now();
  const supabase = getServiceClient();
  const { data: sources, error } = await supabase
    .from("city_sync_sources")
    .select("city, adapter_key, last_attempted_at, last_sync_error")
    .eq("status", "active");
  if (error) throw error;
  if (!sources || sources.length === 0) return [];

  type Source = (typeof sources)[number];
  const byStaleness = (a: Source, b: Source) => {
    if (a.last_attempted_at !== b.last_attempted_at) {
      return (a.last_attempted_at ?? "").localeCompare(b.last_attempted_at ?? "");
    }
    // Final tiebreak (e.g. several cities sharing last_attempted_at = NULL) so ties resolve
    // deterministically instead of Postgrest/JS sort order leaving one city starved for days.
    return a.city.localeCompare(b.city);
  };
  const fresh = sources.filter((s) => s.last_attempted_at === null).sort(byStaleness);
  const errored = sources.filter((s) => s.last_attempted_at !== null && s.last_sync_error !== null).sort(byStaleness);
  const healthy = sources.filter((s) => s.last_attempted_at !== null && s.last_sync_error === null).sort(byStaleness);
  // After the never-attempted cities, alternate errored/healthy (errored first) rather than
  // draining every errored city first: a blocked source can fail slowly (connection hangs), and
  // strictly-first would let a few of them eat the whole budget before any healthy city runs.
  const queue: Source[] = [...fresh];
  for (let i = 0; i < Math.max(errored.length, healthy.length); i++) {
    if (i < errored.length) queue.push(errored[i]);
    if (i < healthy.length) queue.push(healthy[i]);
  }

  const { CITY_ADAPTERS } = await import("./registry");
  const results: SyncResult[] = [];
  for (const source of queue) {
    if (results.length > 0 && Date.now() - started > budgetMs) break;
    const adapter = source.adapter_key ? CITY_ADAPTERS[source.adapter_key] : undefined;
    if (!adapter) {
      // syncCity is never reached in this branch, so it never gets to stamp last_attempted_at -
      // do it here instead, otherwise a misconfigured adapter_key would loop-pick this same city
      // forever instead of yielding to the rest of the queue.
      const message = `No adapter registered for key "${source.adapter_key}"`;
      await supabase
        .from("city_sync_sources")
        .update({ last_attempted_at: new Date().toISOString(), last_sync_error: message })
        .eq("city", source.city);
      results.push({ city: source.city, ok: false, rowCount: 0, error: message });
      continue;
    }
    results.push(await syncCity(adapter, supabase));
  }
  return results;
}
