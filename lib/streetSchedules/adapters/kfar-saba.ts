import { CityAdapter, RawStreetRow } from "../types";
import { dayBefore } from "../hebrewDays";
import { mapLimit } from "../mapLimit";

const BASE_URL = "https://www.kfar-saba.muni.il/pinuy/";
const USER_AGENT = "eco-navigation-sync/1.0 (https://eco-navigation.vercel.app)";
const CONCURRENCY = 3;
const MAX_FAILURE_RATIO = 0.1;

const DAY_LETTERS: Record<string, string> = {
  "א": "ראשון", "ב": "שני", "ג": "שלישי", "ד": "רביעי", "ה": "חמישי", "ו": "שישי",
};

// Same site vendor as Nes Ziona: street list embedded as `var availableTags = [{id, label}]`
// and one server-rendered page per street at ./pinuy/?street=<id>. Unlike Nes Ziona the page
// holds a per-house-number table whose gezem cell is "יום פינוי גזם <letter>" — that letter is
// the COLLECTION day (the page instructs taking waste out the day before), so takeout is
// derived with dayBefore. Days can differ between house numbers, so every distinct letter on
// the page becomes a row.
export const kfarSabaAdapter: CityAdapter = {
  city: "כפר סבא",
  async fetchStreets(): Promise<RawStreetRow[]> {
    const listRes = await fetch(BASE_URL, { headers: { "User-Agent": USER_AGENT } });
    if (!listRes.ok) throw new Error(`Kfar Saba source returned ${listRes.status}`);
    const listHtml = await listRes.text();

    const tagsMatch = listHtml.match(/var availableTags = (\[[\s\S]*?\]);/);
    if (!tagsMatch) throw new Error("Kfar Saba: availableTags street list not found in page");
    const streets: { id: string; label: string }[] = JSON.parse(tagsMatch[1]);
    if (!streets.length) throw new Error("Kfar Saba: availableTags is empty");

    let failures = 0;
    const perStreet = await mapLimit(streets, CONCURRENCY, async (street) => {
      const rows: RawStreetRow[] = [];
      try {
        const res = await fetch(`${BASE_URL}?street=${street.id}`, { headers: { "User-Agent": USER_AGENT } });
        if (!res.ok) { failures++; return rows; }
        const html = await res.text();

        const collectionDays = new Set<string>();
        for (const m of html.matchAll(/יום פינוי גזם\s*([א-ו])(?![א-ת])/g)) {
          const day = DAY_LETTERS[m[1]];
          if (day) collectionDays.add(day);
        }
        for (const collectionDay of collectionDays) {
          rows.push({
            street_name: street.label.trim(),
            collection_day: collectionDay,
            takeout_day: dayBefore(collectionDay),
            lat: null,
            lng: null,
          });
        }
      } catch { failures++; }
      return rows;
    });

    // A high failure rate means we were being throttled/blocked — bail out rather than let the
    // stale-row cleanup in syncCity treat every unfetched street as "removed from the source".
    if (failures > streets.length * MAX_FAILURE_RATIO) {
      throw new Error(`Kfar Saba: ${failures}/${streets.length} street fetches failed — aborting to avoid data loss`);
    }
    return perStreet.flat();
  },
};
