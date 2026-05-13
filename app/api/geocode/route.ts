export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  if (!lat || !lng) return Response.json({ error: "missing" }, { status: 400 });

  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=he`,
    { headers: { "User-Agent": "eco-navigation/1.0 (https://eco-navigation.vercel.app)" } }
  );
  const data = await res.json();
  return Response.json(data);
}
