import { NextRequest, NextResponse } from "next/server";

// Default box covers the Nes Ziona area — kept as the fallback when no lat/lng is given,
// so existing callers/cache entries without those params keep working unchanged.
const DEFAULT_BBOX = "31.88,34.76,31.97,34.88";
const BBOX_MARGIN_DEG = 0.06;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = parseFloat(searchParams.get("lat") ?? "");
    const lng = parseFloat(searchParams.get("lng") ?? "");
    const bbox = Number.isFinite(lat) && Number.isFinite(lng)
      ? `${lat - BBOX_MARGIN_DEG},${lng - BBOX_MARGIN_DEG},${lat + BBOX_MARGIN_DEG},${lng + BBOX_MARGIN_DEG}`
      : DEFAULT_BBOX;
    const OVERPASS_QUERY = `[out:json][timeout:60];way["highway"]["name"](${bbox});out geom;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(OVERPASS_QUERY)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "GreenHOOD-App/1.0" },
      // Vercel caches this response for 24 h — Overpass is only hit once per day per edge region
      next: { revalidate: 86400 },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `overpass ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
