import { CityAdapter, RawStreetRow } from "../types";
import { dayAfter } from "../hebrewDays";
import { mapLimit } from "../mapLimit";

const BASE_URL = "https://www.tel-aviv.gov.il";
const USER_AGENT = "eco-navigation-sync/1.0 (https://eco-navigation.vercel.app)";
const CONCURRENCY = 5;
const MAX_FAILURE_RATIO = 0.1;

// SharePoint list identifiers behind the street lookup on
// /Residents/Environment/Pages/StreetsCleaning.aspx — fixed per site, embedded in that page's
// gezemCtrl ng-init. If the sync ever starts failing with empty results, re-extract them there.
const LIST_DS = {
  Fields: null,
  ItemdIds: null,
  ListContentTypes: ["פריט", "תיקיה"],
  ListId: "199ef16a-f4ae-455c-86ba-e605b9d2d4f1",
  SiteId: "24aa409e-01ed-482e-b0ed-1956972addb1",
  ViewId: "36e06a6c-84a8-4b21-b9e4-b6d907944f03",
  WebId: "d14581a0-c790-4272-9c8d-7a1f3956c176",
};

const DAY_LETTERS: Record<string, string> = {
  "א": "ראשון", "ב": "שני", "ג": "שלישי", "ד": "רביעי", "ה": "חמישי", "ו": "שישי",
};

interface StreetEntry { captionField: string; idField: number }
interface GezemField { InternalName: string; Value: string }
interface GezemRow { Fields?: GezemField[] }

// TrimmingClear is a SharePoint MultiChoice like ";#א' ו-ג', 06:00 - 18:00;#". Day letters are
// the ones carrying a geresh (א', ג'); the "ו-" connector between them has none, so a plain
// geresh match can't mistake it for Friday (which would itself appear as "ו'").
function parseTakeoutDays(raw: string): string[] {
  const days = new Set<string>();
  for (const part of raw.split(";#")) {
    const entry = part.trim();
    if (!entry) continue;
    if (DAY_LETTERS[entry]) {
      days.add(DAY_LETTERS[entry]);
      continue;
    }
    for (const m of entry.matchAll(/([א-ו])['’]/g)) {
      const day = DAY_LETTERS[m[1]];
      if (day) days.add(day);
    }
  }
  return [...days];
}

function field(row: GezemRow, name: string): string {
  return row.Fields?.find((f) => f.InternalName === name)?.Value ?? "";
}

// The municipal page states the listed day is when residents PUT OUT bulky waste/gezem
// ("היום המצוין בטבלה הוא יום הוצאת הגזם... האיסוף יבוצע ביום שלמחרת"), so like Kiryat Ekron
// the source day is the takeout day and collection is derived as the following day.
// Street list: StreetDetails.ashx with an empty query returns every street (~2,650, including
// squares/alleys with no gezem rows — those are skipped, not failures). Schedule per street:
// the GetGezem WCF endpoint, one POST per street; a street can have several house-range
// segments but in practice all segments of a street share one of the two citywide zone
// patterns (א'+ג' or ב'+ד').
// The city string matches what Nominatim's reverse geocode returns for Tel Aviv coordinates
// (address.city, accept-language=he): "תל־אביב–יפו" with a maqaf (U+05BE) and an en dash
// (U+2013) — NOT plain spaces/hyphens. The app resolves the user's city via Nominatim and
// looks up street_schedules by exact string match, so this must stay byte-identical.
export const telAvivAdapter: CityAdapter = {
  city: "תל־אביב–יפו",
  async fetchStreets(): Promise<RawStreetRow[]> {
    const listRes = await fetch(`${BASE_URL}/_layouts/15/infrastructure/handlers/StreetDetails.ashx?k=streets&street=`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", "User-Agent": USER_AGENT },
    });
    if (!listRes.ok) throw new Error(`Tel Aviv street list returned ${listRes.status}`);
    const streets: StreetEntry[] = await listRes.json();
    const unique = new Map<string, StreetEntry>();
    for (const s of streets) {
      const name = s.captionField?.trim();
      if (name && s.idField != null && !unique.has(name)) unique.set(name, s);
    }
    if (!unique.size) throw new Error("Tel Aviv: street list is empty");

    let failures = 0;
    const perStreet = await mapLimit([...unique.values()], CONCURRENCY, async (street) => {
      const rows: RawStreetRow[] = [];
      try {
        const res = await fetch(`${BASE_URL}/_vti_bin/TlvSP2013PublicSite/TlvListUtils.svc/GetGezem`, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8", "User-Agent": USER_AGENT },
          body: JSON.stringify({ streetID: street.idField, ListDS: LIST_DS, numOfItems: 2, pageUrl: "/Pages/NewsPage.aspx" }),
        });
        if (!res.ok) { failures++; return rows; }
        const segments: GezemRow[] = await res.json();

        const takeoutDays = new Set<string>();
        let lat: number | null = null;
        let lng: number | null = null;
        for (const segment of segments) {
          for (const day of parseTakeoutDays(field(segment, "TrimmingClear"))) takeoutDays.add(day);
          // Some segments carry real coordinates, others "-1"/empty — keep the first real pair.
          if (lat == null) {
            const segLat = parseFloat(field(segment, "streetName_LAT"));
            const segLng = parseFloat(field(segment, "streetName_LON"));
            if (segLat > 0 && segLng > 0) { lat = segLat; lng = segLng; }
          }
        }
        for (const takeoutDay of takeoutDays) {
          rows.push({
            street_name: street.captionField.trim(),
            collection_day: dayAfter(takeoutDay),
            takeout_day: takeoutDay,
            lat,
            lng,
          });
        }
      } catch { failures++; }
      return rows;
    });

    // A high failure rate means we were being throttled/blocked — bail out rather than let the
    // stale-row cleanup in syncCity treat every unfetched street as "removed from the source".
    if (failures > unique.size * MAX_FAILURE_RATIO) {
      throw new Error(`Tel Aviv: ${failures}/${unique.size} street fetches failed — aborting to avoid data loss`);
    }
    return perStreet.flat();
  },
};
