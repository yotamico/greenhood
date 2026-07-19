import { CityAdapter, RawStreetRow } from "../types";

const ADDRESSES_URL = "https://services9.arcgis.com/tfeLX7LFVABzD11G/arcgis/rest/services/Addresses/FeatureServer/1";
const ZONES_URL = "https://services9.arcgis.com/tfeLX7LFVABzD11G/arcgis/rest/services/%D7%90%D7%96%D7%95%D7%A8%D7%99_%D7%A4%D7%99%D7%A0%D7%95%D7%99_%D7%92%D7%96%D7%9D/FeatureServer/19";
const PAGE_SIZE = 2000;

const DAY_LETTERS: Record<string, string> = {
  "א": "ראשון", "ב": "שני", "ג": "שלישי", "ד": "רביעי", "ה": "חמישי", "ו": "שישי",
};

interface ZoneRow { attributes: { ZoneName: string; day: string; OUT: string } }
interface AddressRow { attributes: { STREET_NAM: string | null; ENV_EvacName: string | null } }

// Backend of the "ימי פינוי הוצאת פסולת קשיחה וגזם" ArcGIS Web AppBuilder map
// (petah-tikva.maps.arcgis.com/apps/webappviewer, app id 7a9d75c704...). Unlike every other
// city here, this isn't a per-street lookup site: it's two ArcGIS Feature Services queried
// directly over their standard REST API.
//   - "אזורי פינוי גזם" (10 polygons): ZoneName + day ("פינוי ביום ה") + OUT ("הוצאת גזם ביום ד").
//   - "Addresses" (~16.8k rows, one per building): STREET_NAM + ENV_EvacName, where
//     ENV_EvacName is an exact-string match against a zone's ZoneName - the zone join is
//     already precomputed server-side, no point-in-polygon math needed on our end.
// A street can span more than one zone (different house-number ranges), so every distinct
// collection day resolved for a street becomes its own row, deduped on street+day (not
// street+zone: two different zones can share the same day, which would otherwise emit two
// rows with an identical (city, street_name, collection_day) key and make the upsert fail with
// "ON CONFLICT DO UPDATE command cannot affect row a second time" - observed live). Same
// "keep every day" tradeoff as Rishon LeZion/Ramat Gan. The Addresses layer has no day field
// of its own - days come only from the zone lookup, joined by exact ZoneName/ENV_EvacName
// string match.
export const petahTikvaAdapter: CityAdapter = {
  city: "פתח תקווה",
  async fetchStreets(): Promise<RawStreetRow[]> {
    const zonesRes = await fetch(`${ZONES_URL}/query?where=1%3D1&outFields=ZoneName,day,OUT&f=json`);
    if (!zonesRes.ok) throw new Error(`Petah Tikva zones layer returned ${zonesRes.status}`);
    const zonesData: { features?: ZoneRow[] } = await zonesRes.json();
    const zoneDays = new Map<string, { collection: string; takeout: string }>();
    for (const { attributes } of zonesData.features ?? []) {
      const name = attributes.ZoneName?.trim();
      const collection = DAY_LETTERS[attributes.day?.match(/יום\s*([א-ו])$/)?.[1] ?? ""];
      const takeout = DAY_LETTERS[attributes.OUT?.match(/יום\s*([א-ו])$/)?.[1] ?? ""];
      if (name && collection && takeout) zoneDays.set(name, { collection, takeout });
    }
    if (!zoneDays.size) throw new Error("Petah Tikva: gezem zones layer returned no usable rows");

    const seenStreetDays = new Set<string>();
    const rows: RawStreetRow[] = [];
    let offset = 0;
    for (;;) {
      const q = new URLSearchParams({
        where: "STREET_NAM IS NOT NULL AND ENV_EvacName IS NOT NULL",
        outFields: "STREET_NAM,ENV_EvacName",
        returnGeometry: "false",
        resultOffset: String(offset),
        resultRecordCount: String(PAGE_SIZE),
        f: "json",
      });
      const res = await fetch(`${ADDRESSES_URL}/query?${q.toString()}`);
      if (!res.ok) throw new Error(`Petah Tikva addresses layer returned ${res.status} at offset ${offset}`);
      const data: { features?: AddressRow[] } = await res.json();
      const features = data.features ?? [];

      for (const { attributes } of features) {
        const streetName = attributes.STREET_NAM ? attributes.STREET_NAM.trim() : "";
        const zoneName = attributes.ENV_EvacName ? attributes.ENV_EvacName.trim() : "";
        if (!streetName || !zoneName) continue;

        const days = zoneDays.get(zoneName);
        if (!days) continue; // address's zone text didn't match any of the 10 known zones

        const dayKey = streetName + "|" + days.collection;
        if (seenStreetDays.has(dayKey)) continue;
        seenStreetDays.add(dayKey);

        rows.push({
          street_name: streetName,
          collection_day: days.collection,
          takeout_day: days.takeout,
          lat: null,
          lng: null,
        });
      }

      if (features.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    if (!rows.length) throw new Error("Petah Tikva: no street/zone pairs resolved");
    return rows;
  },
};
