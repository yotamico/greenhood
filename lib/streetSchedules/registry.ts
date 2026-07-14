import { CityAdapter } from "./types";

// Maps city_sync_sources.adapter_key -> adapter implementation.
// Stage A (infrastructure only): intentionally empty. Cities are registered in
// city_sync_sources with status='manual' and no adapter_key until a Stage B task
// builds and adds a parser for that specific city.
export const CITY_ADAPTERS: Record<string, CityAdapter> = {};
