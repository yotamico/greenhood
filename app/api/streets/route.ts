import { NextRequest, NextResponse } from "next/server";

// Default box covers the Nes Ziona area — kept as the fallback when no lat/lng is given,
// so existing callers/cache entries without those params keep working unchanged.
const DEFAULT_BBOX = "31.88,34.76,31.97,34.88";
const BBOX_MARGIN_DEG = 0.06;
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Our street_schedules.city spelling doesn't always match OSM's boundary name — e.g. OSM has
// "קרית עקרון" (defective spelling) where our data uses "קריית עקרון" (full spelling), so an
// exact-name area lookup finds nothing and falls back to the box unnecessarily. Add an entry
// here whenever a city's boundary query turns up empty despite the city genuinely being in OSM.
const CITY_NAME_ALIASES: Record<string, string> = {
  "קריית עקרון": "קרית עקרון",
};

type OverpassResult = { elements?: unknown[] };

async function runOverpass(query: string): Promise<OverpassResult> {
  const res = await fetch(`${OVERPASS_URL}?data=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": "GreenHOOD-App/1.0" },
    // Vercel caches this response for 24 h. City queries have the same URL for every user in
    // the city, so Overpass is hit about once per city per day (a lat/lng-keyed URL was unique
    // per user and effectively never shared).
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`overpass ${res.status}`);
  return res.json();
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const city = (searchParams.get("city") ?? "").trim();
    const lat = parseFloat(searchParams.get("lat") ?? "");
    const lng = parseFloat(searchParams.get("lng") ?? "");
    const bbox = Number.isFinite(lat) && Number.isFinite(lng)
      ? `${lat - BBOX_MARGIN_DEG},${lng - BBOX_MARGIN_DEG},${lat + BBOX_MARGIN_DEG},${lng + BBOX_MARGIN_DEG}`
      : DEFAULT_BBOX;

    // Streets inside the city's administrative boundary only: a plain box around the user also
    // covers neighbouring cities, whose same-named streets (הרצל, בן גוריון…) then got highlighted
    // as if they were in this city (measured: 54-67% of highlighted ways were outside it).
    // If the boundary isn't found the response is empty and the client asks for a box instead.
    const data = city
      ? city.length > 60
        ? { elements: [] }
        : await runOverpass(
            `[out:json][timeout:60];area["name"="${(CITY_NAME_ALIASES[city] ?? city).replace(/[\\"]/g, "")}"]["boundary"="administrative"]->.a;way["highway"]["name"](area.a);out geom;`
          )
      : await runOverpass(`[out:json][timeout:60];way["highway"]["name"](${bbox});out geom;`);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
