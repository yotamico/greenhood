import { NextResponse } from "next/server";

async function attempt(url: string): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "GreenHOOD-App/1.0" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`osrm http ${res.status}`);
    return res;
  } finally {
    clearTimeout(t);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const oLat = searchParams.get("oLat");
  const oLng = searchParams.get("oLng");
  const dLat = searchParams.get("dLat");
  const dLng = searchParams.get("dLng");
  if (!oLat || !oLng || !dLat || !dLng) {
    return NextResponse.json({ error: "missing" }, { status: 400 });
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${oLng},${oLat};${dLng},${dLat}?overview=full&geometries=geojson&steps=true`;

  try {
    let res: Response;
    try {
      res = await attempt(url);
    } catch {
      res = await attempt(url);
    }
    return NextResponse.json(await res.json());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
