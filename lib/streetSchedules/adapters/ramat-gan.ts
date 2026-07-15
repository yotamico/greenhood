import { CityAdapter, RawStreetRow } from "../types";
import { parseHebrewDayAbbrList, dayAfter, dayBefore } from "../hebrewDays";
import { mapLimit } from "../mapLimit";

const BASE_URL = "https://api-m.ramat-gan.muni.il/api/";
const USER_AGENT = "eco-navigation-sync/1.0 (https://eco-navigation.vercel.app)";
const GEZEM_CATEGORY_ID = "57221"; // "ימי פינוי גזם, גרוטאות ואשפה" in MyNeighborhood/category/he
const GEZEM_TYPE = "ימי פינוי גזם וגרוטאות"; // other gezems[] entries are household/orange bins
const CONCURRENCY = 5;
const MAX_FAILURE_RATIO = 0.1;

interface HouseNumberRange { type: number; start: number; end: number }
interface StreetEntry { streetName: string; streetId: number; houseNumberRange?: HouseNumberRange[] }
interface GezemEntry { type?: string; disposalDays?: string[]; preparationDays?: string[] }

// Backend of the "השכונה שלי" map on ramat-gan.muni.il. /api/Streets lists all ~620 streets
// with their odd/even house-number ranges; MyNeighborhood/object/he?c=&s=&n= answers per
// ADDRESS, with the schedule zone resolved server-side. Days can change along a street
// (ז'בוטינסקי switches zones mid-street), so each street is probed at the start and end of
// every house-number range and the distinct results are unioned — same "keep every day,
// drop the house-range detail" tradeoff as the Rishon LeZion adapter.
// disposalDays is the COLLECTION day and preparationDays the takeout day, both given
// explicitly; a few addresses have one of them empty (seen live: ז'בוטינסקי 1 has only
// preparationDays), so the missing side is derived from the other.
export const ramatGanAdapter: CityAdapter = {
  city: "רמת גן",
  async fetchStreets(): Promise<RawStreetRow[]> {
    const listRes = await fetch(`${BASE_URL}Streets?skipLoader=true`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!listRes.ok) throw new Error(`Ramat Gan street list returned ${listRes.status}`);
    const streets: StreetEntry[] = await listRes.json();
    const valid = streets.filter((s) => s.streetId != null && s.streetName?.trim());
    if (!valid.length) throw new Error("Ramat Gan: street list is empty");

    let failures = 0;
    const perStreet = await mapLimit(valid, CONCURRENCY, async (street) => {
      const probes = [...new Set((street.houseNumberRange ?? []).flatMap((r) => [r.start, r.end]))];
      if (!probes.length) probes.push(1);

      // collection day -> takeout day; first probe to answer for a day wins.
      const days = new Map<string, string>();
      for (const n of probes) {
        try {
          const res = await fetch(`${BASE_URL}MyNeighborhood/object/he?c=${GEZEM_CATEGORY_ID}&s=${street.streetId}&n=${n}`, {
            headers: { "User-Agent": USER_AGENT },
          });
          if (!res.ok) { failures++; continue; }
          const data: { gezems?: GezemEntry[] | null } = await res.json();
          for (const entry of data.gezems ?? []) {
            if (entry.type !== GEZEM_TYPE) continue;
            const prep = (entry.preparationDays ?? []).flatMap((d) => parseHebrewDayAbbrList(d));
            let disposal = (entry.disposalDays ?? []).flatMap((d) => parseHebrewDayAbbrList(d));
            if (!disposal.length) disposal = prep.map(dayAfter);
            disposal.forEach((day, i) => {
              if (!days.has(day)) days.set(day, prep[i] ?? dayBefore(day));
            });
          }
        } catch { failures++; }
      }

      return [...days].map(([collectionDay, takeoutDay]): RawStreetRow => ({
        street_name: street.streetName.trim(),
        collection_day: collectionDay,
        takeout_day: takeoutDay,
        lat: null,
        lng: null,
      }));
    });

    // A high failure rate means we were being throttled/blocked — bail out rather than let the
    // stale-row cleanup in syncCity treat every unfetched street as "removed from the source".
    if (failures > valid.length * MAX_FAILURE_RATIO) {
      throw new Error(`Ramat Gan: ${failures}/${valid.length} street fetches failed — aborting to avoid data loss`);
    }
    return perStreet.flat();
  },
};
