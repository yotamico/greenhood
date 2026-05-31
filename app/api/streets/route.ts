import { NextResponse } from "next/server";

const OVERPASS_QUERY =
  '[out:json][timeout:60];way["highway"]["name"](31.88,34.76,31.97,34.88);out geom;';

export async function GET() {
  try {
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
