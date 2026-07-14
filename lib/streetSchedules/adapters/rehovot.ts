import { CityAdapter, RawStreetRow } from "../types";
import { parseHebrewDayAbbrList, dayBefore } from "../hebrewDays";

const BASE_URL = "https://www.rehovot.muni.il/content/";
const USER_AGENT = "eco-navigation-sync/1.0 (https://eco-navigation.vercel.app)";
const PER_STREET_DELAY_MS = 40;
const MAX_FAILURE_RATIO = 0.1;

const FULL_DAY_NAMES = new Set(["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי"]);

// Almost every street's gezem cell is a bare day letter ("ד"), but a handful use variants like
// "ו' גזם בלבד - בלי גרוטאות" (day letter + free text) or a full day name ("רביעי"). Streets
// with no fixed day ("גזם ע\"פ קריאה") legitimately yield nothing.
function extractDays(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (FULL_DAY_NAMES.has(trimmed)) return [trimmed];
  const viaList = parseHebrewDayAbbrList(trimmed);
  if (viaList.length) return viaList;
  return parseHebrewDayAbbrList(trimmed.split(/\s+/)[0]);
}

// The street-lookup widget on rehovot.muni.il/254/ is backed by two plain JSON endpoints:
// pinuy_streets.php?phrase= (empty phrase returns ALL ~605 street names) and
// pinuy_data.php?phrase=<name> whose Cell array is:
//   [0] street name, [1] display label, [2] household-trash days ("ב/ד/ו" — ignored),
//   [3] gezem/bulky day, [4] orange bin, [5] blue bin, [6] area name.
// Requests are strictly sequential with a small delay — Cloudflare silently drops responses
// under concurrent load (observed: 4-concurrent lost ~2/3 of streets; sequential loses none).
export const rehovotAdapter: CityAdapter = {
  city: "רחובות",
  async fetchStreets(): Promise<RawStreetRow[]> {
    const listRes = await fetch(`${BASE_URL}pinuy_streets.php?phrase=&format=json`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!listRes.ok) throw new Error(`Rehovot street list returned ${listRes.status}`);
    const names: string[] = await listRes.json();
    const uniqueNames = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    if (!uniqueNames.length) throw new Error("Rehovot: street list is empty");

    const rows: RawStreetRow[] = [];
    let failures = 0;
    for (const name of uniqueNames) {
      await new Promise((resolve) => setTimeout(resolve, PER_STREET_DELAY_MS));
      let gezemRaw = "";
      try {
        const res = await fetch(`${BASE_URL}pinuy_data.php?phrase=${encodeURIComponent(name)}&format=json&v=3`, {
          headers: { "User-Agent": USER_AGENT },
        });
        if (!res.ok) throw new Error(String(res.status));
        const data: { Cell?: { Data?: string }[] }[] = await res.json();
        gezemRaw = data?.[0]?.Cell?.[3]?.Data ?? "";
      } catch {
        failures++;
        continue;
      }
      for (const day of extractDays(gezemRaw)) {
        rows.push({
          street_name: name,
          collection_day: day,
          takeout_day: dayBefore(day),
          lat: null,
          lng: null,
        });
      }
    }

    // A high failure rate means we were being throttled/blocked — bail out rather than let the
    // stale-row cleanup in syncCity treat every unfetched street as "removed from the source".
    if (failures > uniqueNames.length * MAX_FAILURE_RATIO) {
      throw new Error(`Rehovot: ${failures}/${uniqueNames.length} street fetches failed — aborting to avoid data loss`);
    }
    return rows;
  },
};
