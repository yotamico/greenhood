import { CityAdapter, RawStreetRow } from "../types";
import { mapLimit } from "../mapLimit";

const BASE_URL = "https://www.nzc.org.il/pinuy/";
const USER_AGENT = "eco-navigation-sync/1.0 (https://eco-navigation.vercel.app)";
const CONCURRENCY = 3;

// The street list is embedded in the page as `var availableTags = [{id, label}, ...]`, and
// each ./pinuy/?street=<id> returns a server-rendered card with explicit lines for both the
// takeout day ("יום הוצאת גזם וגרוטאות - שישי") and the collection day
// ("יום פינוי גזם וגרוטאות - ראשון") — full day names, no derivation needed.
export const nesZionaAdapter: CityAdapter = {
  city: "נס ציונה",
  async fetchStreets(): Promise<RawStreetRow[]> {
    const listRes = await fetch(BASE_URL, { headers: { "User-Agent": USER_AGENT } });
    if (!listRes.ok) throw new Error(`Nes Ziona source returned ${listRes.status}`);
    const listHtml = await listRes.text();

    const tagsMatch = listHtml.match(/var availableTags = (\[[\s\S]*?\]);/);
    if (!tagsMatch) throw new Error("Nes Ziona: availableTags street list not found in page");
    const streets: { id: string; label: string }[] = JSON.parse(tagsMatch[1]);
    if (!streets.length) throw new Error("Nes Ziona: availableTags is empty");

    const perStreet = await mapLimit(streets, CONCURRENCY, async (street): Promise<RawStreetRow | null> => {
      try {
        const res = await fetch(`${BASE_URL}?street=${street.id}`, { headers: { "User-Agent": USER_AGENT } });
        if (!res.ok) return null;
        const html = await res.text();

        const takeoutMatch = html.match(/יום הוצאת גזם וגרוטאות\s*-\s*([א-ת]+)/);
        const collectionMatch = html.match(/יום פינוי גזם וגרוטאות\s*-\s*([א-ת]+)/);
        if (!collectionMatch) return null;

        return {
          street_name: street.label.trim(),
          collection_day: collectionMatch[1],
          takeout_day: takeoutMatch ? takeoutMatch[1] : collectionMatch[1],
          lat: null,
          lng: null,
        };
      } catch { return null; }
    });
    return perStreet.filter((r): r is RawStreetRow => r !== null);
  },
};
