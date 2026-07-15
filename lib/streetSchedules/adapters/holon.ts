import * as cheerio from "cheerio";
import { CityAdapter, RawStreetRow } from "../types";
import { dayAfter } from "../hebrewDays";

const SOURCE_URL = "https://www.holon.muni.il/Residents/Environment/Recycling/pages/pinuygezem.aspx";
const USER_AGENT = "eco-navigation-sync/1.0 (https://eco-navigation.vercel.app)";

const DAY_LETTERS: Record<string, string> = {
  "א": "ראשון", "ב": "שני", "ג": "שלישי", "ד": "רביעי", "ה": "חמישי", "ו": "שישי",
};

// The page embeds the full street list as a server-rendered SharePoint list table
// (tr.litsBoxItem — [sic], the class name really is misspelled like that): first visible cell
// is the street name, second is a single day letter א-ד. Per the page's own wording the letter
// is the TAKEOUT day ("הפסולת תפונה ע\"י העירייה ביום שלמחרת יום ההוצאה"), so collection is
// derived as the following day. A handful of rows have an empty day cell — skipped.
export const holonAdapter: CityAdapter = {
  city: "חולון",
  async fetchStreets(): Promise<RawStreetRow[]> {
    const res = await fetch(SOURCE_URL, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`Holon source returned ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    const rows: RawStreetRow[] = [];
    $("tr.litsBoxItem").each((_, tr) => {
      const cells = $(tr).find("td.itemColData");
      const streetName = $(cells[0]).text().trim();
      const takeoutDay = DAY_LETTERS[$(cells[1]).text().trim()];
      if (!streetName || !takeoutDay) return;
      rows.push({
        street_name: streetName,
        collection_day: dayAfter(takeoutDay),
        takeout_day: takeoutDay,
        lat: null,
        lng: null,
      });
    });
    return rows;
  },
};
