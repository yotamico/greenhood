import { CityAdapter } from "./types";
import { ganYavneAdapter } from "./adapters/gan-yavne";
import { kiryatEkronAdapter } from "./adapters/kiryat-ekron";
import { nesZionaAdapter } from "./adapters/nes-ziona";
import { rehovotAdapter } from "./adapters/rehovot";
import { rishonLezionAdapter } from "./adapters/rishon-lezion";

// Maps city_sync_sources.adapter_key -> adapter implementation.
// Cities with status='manual' in city_sync_sources intentionally have no entry here yet.
export const CITY_ADAPTERS: Record<string, CityAdapter> = {
  "gan-yavne": ganYavneAdapter,
  "kiryat-ekron": kiryatEkronAdapter,
  "nes-ziona": nesZionaAdapter,
  "rehovot": rehovotAdapter,
  "rishon-lezion": rishonLezionAdapter,
};
