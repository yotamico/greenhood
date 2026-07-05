export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  if (!q) return Response.json({ error: "missing" }, { status: 400 });

  const limit = searchParams.get("limit") ?? "5";
  const addressdetails = searchParams.get("addressdetails") ?? "0";

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=${limit}&addressdetails=${addressdetails}&accept-language=he&countrycodes=il`,
    { headers: { "User-Agent": "eco-navigation/1.0 (https://eco-navigation.vercel.app)" } }
  );
  const data = await res.json();
  return Response.json(data);
}
