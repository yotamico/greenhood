import { CityAdapter, RawStreetRow } from "../types";
import { dayAfter } from "../hebrewDays";

const URL = "https://www.givatayim.muni.il/985/";
const USER_AGENT = "eco-navigation-sync/1.0 (https://eco-navigation.vercel.app)";

const DAY_LETTERS: Record<string, string> = {
  "א": "ראשון", "ב": "שני", "ג": "שלישי", "ד": "רביעי", "ה": "חמישי", "ו": "שישי",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&ndash;/g, "-")
    .replace(/&amp;/g, "&");
}

// Strips house-number ranges ("גלבוע 10-1"), "עד הסוף" (till the end), the odd/even-side
// qualifiers "אי זוגי"/"זוגי", and parenthetical notes ("אריאל שרון (שפע טל)"), keeping only
// the base street name. Street names in this list never contain digits, so cutting at the
// first digit safely removes every number/range/"עד הסוף" suffix in one step.
function cleanStreetName(raw: string): string {
  return decodeEntities(raw)
    .replace(/\([^)]*\)/g, " ")
    .replace(/אי\s*זוגי/g, " ")
    .replace(/\bזוגי\b/g, " ")
    .replace(/\d[\s\S]*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[־\-.,]+|[־\-.,]+$/g, "")
    .trim();
}

// Only two citywide zones, each a flat plain-text street list embedded directly in the page
// (no table, no per-street lookup) — the whole schedule is a single fetch. The page states,
// per zone, only the TAKEOUT day ("הוצאת פסולת ביום א'"/"ביום ג'"), never a separate collection
// day, so collection_day is derived via dayAfter (same shape as Tel Aviv / Kiryat Ekron). The
// source itself is occasionally missing the comma between two list entries (a house-number
// range directly followed by the next street name, e.g. "...143-141  דרך השלום 53-27,") —
// the tell is 2+ spaces where a single ", " belongs, so that gap gets a comma inserted before
// splitting; without it the second street silently disappears into the first one's digit cut.
// <br/> line-wraps inside a still-open street name (e.g. "מורדי<br/>הגטאות") become a plain
// space, not a comma, since not every line break is a list separator. A few streets (e.g.
// ויצמן) legitimately appear in both zones for different house-number ranges, becoming two
// distinct-day rows for the same street_name — same shape as Ramat Gan's split streets.
export const givatayimAdapter: CityAdapter = {
  city: "גבעתיים",
  async fetchStreets(): Promise<RawStreetRow[]> {
    const res = await fetch(URL, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`Givatayim source returned ${res.status}`);
    const html = await res.text();

    const rows = new Map<string, RawStreetRow>();
    for (const zoneMatch of html.matchAll(/הוצאת פסולת ביום ([א-ת])&#39;,[\s\S]*?ברחובות הבאים:([\s\S]*?)<\/span>/g)) {
      const takeoutDay = DAY_LETTERS[zoneMatch[1]];
      if (!takeoutDay) continue;
      const collectionDay = dayAfter(takeoutDay);

      let listText = zoneMatch[2].replace(/<br\s*\/?>/gi, " ");
      listText = decodeEntities(listText).replace(/(\d)(\s{2,})([א-ת])/g, "$1,$3");

      for (const rawName of listText.split(",")) {
        const streetName = cleanStreetName(rawName);
        if (!streetName) continue;
        rows.set(`${streetName}|${collectionDay}`, {
          street_name: streetName,
          collection_day: collectionDay,
          takeout_day: takeoutDay,
          lat: null,
          lng: null,
        });
      }
    }
    if (rows.size === 0) throw new Error("Givatayim: 0 rows parsed from street lists");
    return [...rows.values()];
  },
};
