export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  if (!lat || !lng) return Response.json({ error: "missing" }, { status: 400 });

  // Round to ~11m (4 decimal places) before querying: a street/city name never changes at that
  // scale, and it turns nearby callers (a street-mode city lookup, an item detail page repeatedly
  // reverse-geocoding the same saved item location) into cache hits on the same Nominatim query
  // instead of separate live calls — this app had zero caching or rate limiting on this endpoint,
  // hitting Nominatim's live API on every single request.
  const latR = parseFloat(lat).toFixed(4);
  const lngR = parseFloat(lng).toFixed(4);

  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${latR}&lon=${lngR}&format=json&accept-language=he`,
    {
      headers: { "User-Agent": "eco-navigation/1.0 (https://eco-navigation.vercel.app)" },
      next: { revalidate: 86400 },
    }
  );
  const data = await res.json();
  return Response.json(data, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" },
  });
}
