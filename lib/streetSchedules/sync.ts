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
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("city_sync_sources")
      .update({ last_sync_error: message })
      .eq("city", adapter.city);
    return { city: adapter.city, ok: false, rowCount: 0, error: message };
  }
}

// Daily cron entry point: refreshes ONE active city per invocation, the least recently
// attempted one, instead of all cities in a single run. Per-street sources (Rehovot ~605,
// Rishon ~1000+, Nes Ziona ~244 requests) can't all fit in one serverless execution window,
// so each city gets its own daily slot in a fair round-robin (ordered by last_attempted_at,
// so a repeatedly-failing city can't starve the others).
export async function syncNextCity(): Promise<SyncResult | null> {
  const supabase = getServiceClient();
  const { data: sources, error } = await supabase
    .from("city_sync_sources")
    .select("city, adapter_key, last_attempted_at")
    .eq("status", "active")
    .order("last_attempted_at", { ascending: true, nullsFirst: true })
    .limit(1);
  if (error) throw error;
  const source = sources?.[0];
  if (!source) return null;

  await supabase
    .from("city_sync_sources")
    .update({ last_attempted_at: new Date().toISOString() })
    .eq("city", source.city);

  const { CITY_ADAPTERS } = await import("./registry");
  const adapter = source.adapter_key ? CITY_ADAPTERS[source.adapter_key] : undefined;
  if (!adapter) {
    const message = `No adapter registered for key "${source.adapter_key}"`;
    await supabase.from("city_sync_sources").update({ last_sync_error: message }).eq("city", source.city);
    return { city: source.city, ok: false, rowCount: 0, error: message };
  }
  return syncCity(adapter, supabase);
}
