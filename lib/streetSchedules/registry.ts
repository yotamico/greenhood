import { CityAdapter } from "./types";
import { ganYavneAdapter } from "./adapters/gan-yavne";
import { herzliyaAdapter } from "./adapters/herzliya";
import { holonAdapter } from "./adapters/holon";
import { kfarSabaAdapter } from "./adapters/kfar-saba";
import { kiryatEkronAdapter } from "./adapters/kiryat-ekron";
import { nesZionaAdapter } from "./adapters/nes-ziona";
import { petahTikvaAdapter } from "./adapters/petah-tikva";
import { ramatGanAdapter } from "./adapters/ramat-gan";
import { rehovotAdapter } from "./adapters/rehovot";
import { rishonLezionAdapter } from "./adapters/rishon-lezion";
import { telAvivAdapter } from "./adapters/tel-aviv";

// Maps city_sync_sources.adapter_key -> adapter implementation.
// Cities with status='manual' in city_sync_sources intentionally have no entry here yet.
export const CITY_ADAPTERS: Record<string, CityAdapter> = {
  "gan-yavne": ganYavneAdapter,
  "herzliya": herzliyaAdapter,
  "holon": holonAdapter,
  "kfar-saba": kfarSabaAdapter,
  "kiryat-ekron": kiryatEkronAdapter,
  "nes-ziona": nesZionaAdapter,
  "petah-tikva": petahTikvaAdapter,
  "ramat-gan": ramatGanAdapter,
  "rehovot": rehovotAdapter,
  "rishon-lezion": rishonLezionAdapter,
  "tel-aviv": telAvivAdapter,
};
