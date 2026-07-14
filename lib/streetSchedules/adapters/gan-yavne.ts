import * as cheerio from "cheerio";
import { CityAdapter, RawStreetRow } from "../types";
import { parseHebrewDayAbbrList, dayBefore } from "../hebrewDays";

const SOURCE_URL = "https://www.ganyavne.muni.il/Departments/SanitationEnvironment/Pages/Garbage.aspx";
const BULKY_SERVICE_LABEL = "פינוי גזם ופסולת מוצקה";

// The page is a standard SharePoint list view (table.ms-listviewtable), fully server-rendered —
// no JS execution needed, a plain fetch + HTML parse is enough.
export const ganYavneAdapter: CityAdapter = {
  city: "גן יבנה",
  async fetchStreets(): Promise<RawStreetRow[]> {
    const res = await fetch(SOURCE_URL, {
      headers: { "User-Agent": "eco-navigation-sync/1.0 (https://eco-navigation.vercel.app)" },
    });
    if (!res.ok) throw new Error(`Gan Yavne source returned ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const rows: RawStreetRow[] = [];
    $("table.ms-listviewtable tbody tr").each((_, el) => {
      const cells = $(el).find("td");
      const streetName = $(cells[0]).text().trim();
      const daysText = $(cells[1]).text().trim();
      const service = $(cells[2]).text().trim();
      if (!streetName || service !== BULKY_SERVICE_LABEL) return;

      const days = parseHebrewDayAbbrList(daysText);
      // Some streets get bulky-waste collection more than once a week (e.g. נווה עובד: א' וד') —
      // emit one row per day, each with its own takeout_day (street_schedules' unique key is
      // now (city, street_name, collection_day), so this doesn't collide).
      for (const collectionDay of days) {
        rows.push({
          street_name: streetName,
          collection_day: collectionDay,
          takeout_day: dayBefore(collectionDay),
          lat: null,
          lng: null,
        });
      }
    });
    return rows;
  },
};
