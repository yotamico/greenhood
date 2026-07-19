import { CityAdapter, RawStreetRow } from "../types";
import { mapLimit } from "../mapLimit";

const BASE_URL = "https://www.herzliya.muni.il/content/";
const USER_AGENT = "eco-navigation-sync/1.0 (https://eco-navigation.vercel.app)";
const PER_REQUEST_DELAY_MS = 40;
const MAX_FAILURE_RATIO = 0.1;
const PAGE_CAP = 20; // pinuy_streets.php silently truncates at 20 results
// A 2-char prefix splits any single-letter bucket into 27 sub-buckets — more than enough to
// get every real bucket under PAGE_CAP for a city this size. Depth is capped (not just relied
// on to naturally shrink) because a previous version recursed unboundedly whenever a prefix
// came back "full": if the API's matching isn't a strict prefix match, a long prefix can still
// return >=20 (wrong) results forever, and the search never terminates. MAX_DISCOVERY_REQUESTS
// is a second, independent safety net for the same failure mode.
const MAX_PREFIX_LENGTH = 2;
const MAX_DISCOVERY_REQUESTS = 800;

const DAY_LETTERS: Record<string, string> = {
  "א": "ראשון", "ב": "שני", "ג": "שלישי", "ד": "רביעי", "ה": "חמישי", "ו": "שישי",
};
const HEBREW_LETTERS = "אבגדהוזחטיכלמנסעפצקרשת".split("");

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

// Same site vendor as Rehovot (pinuy_streets.php / pinuy_data.php behind /403/), with two
// differences: the street list is capped at 20 results per query (so the full list is
// enumerated by drilling into longer prefixes whenever a prefix comes back full), and
// pinuy_data.php returns one row PER ADDRESS with an explicit free-text schedule
// "גזם: יום הוצאה: יום א , ימי פינוי: יום ב" — both days stated, no derivation needed.
// Streets can straddle zones (בן גוריון is split א/ב) so all distinct day pairs are kept.
// Like Rehovot, requests run sequentially: the shared Cloudflare front drops responses
// under concurrent load.
export const herzliyaAdapter: CityAdapter = {
  city: "הרצליה",
  async fetchStreets(): Promise<RawStreetRow[]> {
    const streets = new Set<string>();
    const visitedPrefixes = new Set<string>();
    let discoveryRequests = 0;
    let truncatedBuckets = 0;

    const expandPrefix = async (prefix: string): Promise<void> => {
      if (visitedPrefixes.has(prefix) || discoveryRequests >= MAX_DISCOVERY_REQUESTS) return;
      visitedPrefixes.add(prefix);
      discoveryRequests++;

      await new Promise((resolve) => setTimeout(resolve, PER_REQUEST_DELAY_MS));
      const names = await fetchJson<string[]>(
        `${BASE_URL}pinuy_streets.php?phrase=${encodeURIComponent(prefix)}&format=json`
      );
      for (const n of names) { if (n.trim()) streets.add(n.trim()); }
      // A full page means truncation — recurse into every longer prefix that can match more,
      // up to MAX_PREFIX_LENGTH. A bucket still full at that depth is reported, not chased
      // further: some of its streets are silently missed rather than risking runaway recursion.
      if (names.length >= PAGE_CAP) {
        if (prefix.length >= MAX_PREFIX_LENGTH) { truncatedBuckets++; return; }
        for (const letter of [...HEBREW_LETTERS, " ", "'", '"']) {
          await expandPrefix(prefix + letter);
        }
      }
    };
    for (const letter of HEBREW_LETTERS) await expandPrefix(letter);
    if (!streets.size) throw new Error("Herzliya: street list is empty");
    if (truncatedBuckets > 0) {
      console.warn(`[herzliya] ${truncatedBuckets} prefix bucket(s) still at the ${PAGE_CAP}-result cap at max depth — some streets may be missing`);
    }

    const names = [...streets];
    let failures = 0;
    const perStreet = await mapLimit(names, 1, async (name) => {
      await new Promise((resolve) => setTimeout(resolve, PER_REQUEST_DELAY_MS));
      const rows: RawStreetRow[] = [];
      try {
        const data = await fetchJson<{ Cell?: { Data?: string }[] }[]>(
          `${BASE_URL}pinuy_data.php?phrase=${encodeURIComponent(name)}&format=json&v=3`
        );
        // collection day -> takeout day, unioned across the street's per-address rows.
        const days = new Map<string, string>();
        for (const row of data ?? []) {
          if (row.Cell?.[0]?.Data?.trim() !== name) continue;
          const info = row.Cell?.[2]?.Data ?? "";
          if (!info.startsWith("גזם")) continue;
          const takeout = DAY_LETTERS[info.match(/יום הוצאה:\s*יום\s*([א-ו])/)?.[1] ?? ""];
          const collection = DAY_LETTERS[info.match(/ימי פינוי:\s*יום\s*([א-ו])/)?.[1] ?? ""];
          if (collection && takeout && !days.has(collection)) days.set(collection, takeout);
        }
        for (const [collectionDay, takeoutDay] of days) {
          rows.push({ street_name: name, collection_day: collectionDay, takeout_day: takeoutDay, lat: null, lng: null });
        }
      } catch { failures++; }
      return rows;
    });

    // A high failure rate means we were being throttled/blocked — bail out rather than let the
    // stale-row cleanup in syncCity treat every unfetched street as "removed from the source".
    if (failures > names.length * MAX_FAILURE_RATIO) {
      throw new Error(`Herzliya: ${failures}/${names.length} street fetches failed — aborting to avoid data loss`);
    }
    return perStreet.flat();
  },
};
