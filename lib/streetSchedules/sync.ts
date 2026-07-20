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

// Daily cron entry point: refreshes ONE active city per invocation instead of all cities in a
// single run - per-street sources (Rehovot ~605, Rishon ~1000+, Nes Ziona ~244 requests) can't
// all fit in one serverless execution window. Picks by priority tier, not a flat oldest-first
// queue: (1) never-attempted cities first (they deserve an initial try), (2) cities whose last
// attempt errored - retried on the very next run instead of waiting a full round-robin cycle
// behind every healthy city, (3) everything else, oldest-attempted first. Sorted client-side
// (not via .order()) since Postgrest can't express a 3-tier computed priority; the source table
// is tiny (one row per city) so fetching it whole is cheap.
export async function syncNextCity(): Promise<SyncResult | null> {
  const supabase = getServiceClient();
  const { data: sources, error } = await supabase
    .from("city_sync_sources")
    .select("city, adapter_key, last_attempted_at, last_sync_error")
    .eq("status", "active");
  if (error) throw error;
  if (!sources || sources.length === 0) return null;

  const priority = (s: { last_attempted_at: string | null; last_sync_error: string | null }) =>
    s.last_attempted_at === null ? 0 : s.last_sync_error !== null ? 1 : 2;
  const [source] = [...sources].sort((a, b) => {
    const diff = priority(a) - priority(b);
    if (diff !== 0) return diff;
    if (a.last_attempted_at !== b.last_attempted_at) {
      return (a.last_attempted_at ?? "").localeCompare(b.last_attempted_at ?? "");
    }
    // Final tiebreak (e.g. several cities sharing last_attempted_at = NULL) so ties resolve
    // deterministically instead of Postgrest/JS sort order leaving one city starved for days.
    return a.city.localeCompare(b.city);
  });

  const { CITY_ADAPTERS } = await import("./registry");
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
    return { city: source.city, ok: false, rowCount: 0, error: message };
  }
  return syncCity(adapter, supabase);
}
