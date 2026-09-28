export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  if (!q) return Response.json({ error: "missing" }, { status: 400 });

  const limit = searchParams.get("limit") ?? "5";
  const addressdetails = searchParams.get("addressdetails") ?? "0";

  // No caching or rate limiting existed on this endpoint at all — every keystroke in the report
  // page's address autocomplete (debounced client-side, but that doesn't help once there's more
  // than one concurrent user) and every "navigate to this item" tap hit Nominatim live. Caching
  // repeated exact queries (the common case: the same saved item address looked up by every
  // viewer, or a user re-typing an address they already searched) cuts most of that traffic
  // without needing cross-request rate-limiting infrastructure.
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=${limit}&addressdetails=${addressdetails}&accept-language=he&countrycodes=il`,
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
