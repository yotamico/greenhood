import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { CityAdapter } from "./types";
import { geocodeStreet } from "../geocode";

export interface SyncResult {
  city: string;
  ok: boolean;
  rowCount: number;
  error?: string;
}

function getServiceClient(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
}

export async function syncCity(adapter: CityAdapter, client?: SupabaseClient): Promise<SyncResult> {
  const supabase = client ?? getServiceClient();
  try {
    const rawRows = await adapter.fetchStreets();

    const rows = [];
    for (const row of rawRows) {
      let { lat, lng } = row;
      if (lat == null || lng == null) {
        const geocoded = await geocodeStreet(adapter.city, row.street_name);
        lat = geocoded?.lat ?? null;
        lng = geocoded?.lng ?? null;
      }
      rows.push({
        city: adapter.city,
        street_name: row.street_name,
        collection_day: row.collection_day,
        takeout_day: row.takeout_day,
        lat,
        lng,
      });
    }

    const { error: upsertError } = await supabase
      .from("street_schedules")
      .upsert(rows, { onConflict: "city,street_name" });
    if (upsertError) throw upsertError;

    await supabase
      .from("city_sync_sources")
      .update({ last_synced_at: new Date().toISOString(), last_sync_row_count: rows.length, last_sync_error: null })
      .eq("city", adapter.city);

    return { city: adapter.city, ok: true, rowCount: rows.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("city_sync_sources")
      .update({ last_sync_error: message })
      .eq("city", adapter.city);
    return { city: adapter.city, ok: false, rowCount: 0, error: message };
  }
}

export async function syncActiveCities(): Promise<SyncResult[]> {
  const supabase = getServiceClient();
  const { data: sources, error } = await supabase
    .from("city_sync_sources")
    .select("city, adapter_key")
    .eq("status", "active");
  if (error) throw error;

  const { CITY_ADAPTERS } = await import("./registry");
  const results: SyncResult[] = [];
  for (const source of sources ?? []) {
    const adapter = source.adapter_key ? CITY_ADAPTERS[source.adapter_key] : undefined;
    if (!adapter) {
      results.push({ city: source.city, ok: false, rowCount: 0, error: `No adapter registered for key "${source.adapter_key}"` });
      continue;
    }
    results.push(await syncCity(adapter, supabase));
  }
  return results;
}
