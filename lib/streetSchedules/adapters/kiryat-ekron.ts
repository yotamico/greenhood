import * as cheerio from "cheerio";
import { CityAdapter, RawStreetRow } from "../types";
import { dayAfter } from "../hebrewDays";

const SOURCE_URL = "https://kiryat-ekron.muni.il/%D7%9E%D7%97%D7%9C%D7%A7%D7%AA-%D7%AA%D7%A9%D7%AA%D7%99%D7%95%D7%AA-%D7%95%D7%AA%D7%A4%D7%A2%D7%95%D7%9C/%D7%A4%D7%99%D7%A0%D7%95%D7%99-%D7%92%D7%96%D7%9D-%D7%95%D7%A4%D7%A1%D7%95%D7%9C%D7%AA-%D7%92%D7%95%D7%A9%D7%99%D7%AA/";

// The table's own title says "ימי הוצאת גזם ... (פינוי יום למחרת)" — the 4 header columns
// (יום א'-ד') are the TAKEOUT day, and actual collection happens the following calendar day.
// This is the opposite of the usual source shape, so takeout/collection are swapped here.
const TAKEOUT_DAYS = ["ראשון", "שני", "שלישי", "רביעי"];

function cleanCellText(raw: string): string {
  const nbsp = String.fromCharCode(160);
  return raw.split(nbsp).join(" ").trim();
}

// The page is a plain WordPress table (table.has-fixed-layout), fully server-rendered — no JS
// execution needed. Each row has 4 <td> cells (one per day-column); most rows are only partially
// filled since the columns have different street counts, with empty/nbsp-only cells for gaps.
export const kiryatEkronAdapter: CityAdapter = {
  city: "קריית עקרון",
  async fetchStreets(): Promise<RawStreetRow[]> {
    const res = await fetch(SOURCE_URL, {
      headers: { "User-Agent": "eco-navigation-sync/1.0 (https://eco-navigation.vercel.app)" },
    });
    if (!res.ok) throw new Error(`Kiryat Ekron source returned ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const rows: RawStreetRow[] = [];
    const trs = $("table.has-fixed-layout tbody tr");
    trs.slice(1).each((_, tr) => {
      const cells = $(tr).find("td");
      cells.each((colIndex, cell) => {
        if (colIndex >= TAKEOUT_DAYS.length) return;
        const streetName = cleanCellText($(cell).text());
        if (!streetName) return;
        const takeoutDay = TAKEOUT_DAYS[colIndex];
        rows.push({
          street_name: streetName,
          collection_day: dayAfter(takeoutDay),
          takeout_day: takeoutDay,
          lat: null,
          lng: null,
        });
      });
    });
    return rows;
  },
};
