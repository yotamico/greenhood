// Server-side counterpart to app/api/geocode/search/route.ts, for bulk/background jobs
// (street-schedule sync) that need geocoding without an internal HTTP hop.
// Keeps the same User-Agent + countrycodes=il convention, and adds throttling since
// Nominatim's usage policy caps requests at ~1/sec and bulk jobs can otherwise burst.

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "eco-navigation-sync/1.0 (https://eco-navigation.vercel.app)";
const MIN_INTERVAL_MS = 1100;

let lastRequestAt = 0;

async function throttle() {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

export async function geocodeStreet(city: string, streetName: string): Promise<{ lat: number; lng: number } | null> {
  await throttle();
  const q = `${streetName}, ${city}, ישראל`;
  const res = await fetch(
    `${NOMINATIM_URL}?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=il`,
    { headers: { "User-Agent": USER_AGENT } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const first = data?.[0];
  if (!first) return null;
  const lat = parseFloat(first.lat);
  const lng = parseFloat(first.lon);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}
