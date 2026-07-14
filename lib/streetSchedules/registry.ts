import { CityAdapter } from "./types";
import { ganYavneAdapter } from "./adapters/gan-yavne";

// Maps city_sync_sources.adapter_key -> adapter implementation.
// Cities with status='manual' in city_sync_sources intentionally have no entry here yet.
export const CITY_ADAPTERS: Record<string, CityAdapter> = {
  "gan-yavne": ganYavneAdapter,
};
