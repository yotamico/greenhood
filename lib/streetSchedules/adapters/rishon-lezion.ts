import { CityAdapter, RawStreetRow } from "../types";
import { dayAfter } from "../hebrewDays";
import { mapLimit } from "../mapLimit";

const BASE_URL = "https://my.rishonlezion.muni.il/Umbraco/Api/";
const USER_AGENT = "eco-navigation-sync/1.0 (https://eco-navigation.vercel.app)";
const BULKY_INFO_TYPE_CODE = "00003"; // "הוצאת פסולת או גזם"
const CONCURRENCY = 5;

const DAY_LETTERS: Record<string, string> = {
  "א": "ראשון", "ב": "שני", "ג": "שלישי", "ד": "רביעי", "ה": "חמישי", "ו": "שישי",
};

const DAY_FLAGS: [keyof InfoEntry, string][] = [
  ["Sunday", "ראשון"], ["Monday", "שני"], ["Tuesday", "שלישי"],
  ["Wednesday", "רביעי"], ["Thursday", "חמישי"], ["Friday", "שישי"],
];

interface StreetEntry { StreetCode: string; StreetName: string }
interface InfoEntry {
  InformationTypeCode?: string; Description?: string;
  Sunday?: boolean; Monday?: boolean; Tuesday?: boolean; Wednesday?: boolean;
  Thursday?: boolean; Friday?: boolean; Saturday?: boolean;
}

// RiZone (my.rishonlezion.muni.il) is a React SPA backed by an Umbraco JSON API:
// GetStreets returns every street (code + name), GetInfo?streetId= returns a mixed list of
// notices per street; the InformationTypeCode 00003 entries hold the bulky-waste TAKEOUT days.
// The API now returns them as boolean Sunday..Saturday flags per house-number segment (the
// older free-text "בתים אי זוגיים בין 1-9 ביום: ב ■" Description is kept as a fallback for
// entries that still use it). A street can have several segments with different days; we keep
// every distinct day (the per-house-range detail doesn't fit street_schedules' one-day-per-row
// shape and is intentionally dropped). Saturday is ignored — no takeout happens on Shabbat.
export const rishonLezionAdapter: CityAdapter = {
  city: "ראשון לציון",
  async fetchStreets(): Promise<RawStreetRow[]> {
    const listRes = await fetch(`${BASE_URL}ExternalNewCallApi/GetStreets?cityId=0`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!listRes.ok) throw new Error(`Rishon LeZion street list returned ${listRes.status}`);
    const listData: { streets?: StreetEntry[] } = await listRes.json();
    const streets = (listData.streets ?? []).filter((s) => s.StreetCode && s.StreetName?.trim());
    if (!streets.length) throw new Error("Rishon LeZion: street list is empty");

    let failures = 0;
    const perStreet = await mapLimit(streets, CONCURRENCY, async (street) => {
      const rows: RawStreetRow[] = [];
      try {
        const res = await fetch(`${BASE_URL}StreetInfoApi/GetInfo?streetId=${street.StreetCode}`, {
          headers: { "User-Agent": USER_AGENT },
        });
        if (!res.ok) { failures++; return rows; }
        const data: { streetsInfo?: InfoEntry[] } = await res.json();
        const bulky = (data.streetsInfo ?? []).filter((i) => i.InformationTypeCode === BULKY_INFO_TYPE_CODE);
        const takeoutDays = new Set<string>();
        for (const entry of bulky) {
          for (const [flag, day] of DAY_FLAGS) if (entry[flag] === true) takeoutDays.add(day);
          // Legacy free-text fallback. Each house-range segment carries its own "ביום: X" — one day letter per occurrence,
          // with a word-boundary guard so a following word starting with א-ו isn't swallowed.
          for (const m of (entry.Description ?? "").matchAll(/(?:ביום|בימים)\s*:?\s*([א-ו])(?![א-ת])/g)) {
            const day = DAY_LETTERS[m[1]];
            if (day) takeoutDays.add(day);
          }
        }
        for (const takeoutDay of takeoutDays) {
          rows.push({
            street_name: street.StreetName.trim(),
            collection_day: dayAfter(takeoutDay),
            takeout_day: takeoutDay,
            lat: null,
            lng: null,
          });
        }
      } catch { failures++; }
      return rows;
    });

    // A high failure rate means we were being throttled/blocked — bail out rather than let the
    // stale-row cleanup in syncCity treat every unfetched street as "removed from the source".
    if (failures > streets.length * 0.1) {
      throw new Error(`Rishon LeZion: ${failures}/${streets.length} street fetches failed — aborting to avoid data loss`);
    }
    return perStreet.flat();
  },
};
