import { CityAdapter, RawStreetRow } from "../types";
import { dayBefore } from "../hebrewDays";

const URL = "https://www.raanana.muni.il/cityhall/environment/evacuation-times/";
const USER_AGENT = "eco-navigation-sync/1.0 (https://eco-navigation.vercel.app)";

// Simplest source yet: the whole street/day table is embedded server-side as a single
// "eael-advanced-data-table" (Elementor Essential Addons widget) — its "«123456...»" pager
// is client-side JS pagination only, every row is already in the raw HTML in one request,
// no per-street or per-page fetches needed. Columns are street, neighborhood (unused), and
// the COLLECTION day as a full Hebrew day name; the page states takeout is always the day
// before, so takeout_day is derived via dayBefore. A handful of rows have an empty day cell
// (skipped) and a few streets repeat verbatim across neighborhood boundaries with the exact
// same day — deduped on (street_name, collection_day), the sync upsert's own conflict key,
// since two identical-key rows in one batch make Postgres reject the whole upsert.
export const raananaAdapter: CityAdapter = {
  city: "רעננה",
  async fetchStreets(): Promise<RawStreetRow[]> {
    const res = await fetch(URL, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`Ra'anana source returned ${res.status}`);
    const html = await res.text();

    const tbodyMatch = html.match(/ea-advanced-data-table[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
    if (!tbodyMatch) throw new Error("Ra'anana: schedule table not found in page");

    const rows = new Map<string, RawStreetRow>();
    for (const m of tbodyMatch[1].matchAll(/<tr><td>(.*?)<\/td><td>(.*?)<\/td><td>(.*?)<\/td><\/tr>/g)) {
      const streetName = m[1].trim();
      const collectionDay = m[3].trim();
      if (!streetName || !collectionDay) continue;
      rows.set(`${streetName}|${collectionDay}`, {
        street_name: streetName,
        collection_day: collectionDay,
        takeout_day: dayBefore(collectionDay),
        lat: null,
        lng: null,
      });
    }
    if (rows.size === 0) throw new Error("Ra'anana: 0 rows parsed from schedule table");
    return [...rows.values()];
  },
};
