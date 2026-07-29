import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyUser } from "@/lib/verifyUser";

const WALK_SPEED_MPS = 1.2; // ~4.3 km/h, rough on-foot estimate
const MIN_ETA_S = 3 * 60;
const MAX_ETA_S = 60 * 60;
const DEFAULT_DISTANCE_M = 800; // used only if we don't know the user's origin

function haversine([lat1, lng1]: [number, number], [lat2, lng2]: [number, number]): number {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// records that a user has set off (via Waze/Google Maps) towards an item, and — best
// effort — schedules a delayed QStash callback that nudges them to report it taken once
// they should plausibly have arrived. QStash failure is non-fatal: the intent row itself
// is what the proximity check (on the user's next app open) relies on.
export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const user = await verifyUser(req, supabase);
  if (!user) return NextResponse.json({ ok: false, error: "לא מחובר" }, { status: 401 });

  const { itemId, lat, lng, title, originLat, originLng } = await req.json();
  if (!itemId || lat == null || lng == null || !title) {
    return NextResponse.json({ ok: false, error: "missing" }, { status: 400 });
  }

  const { data: intent, error } = await supabase
    .from("nav_intents")
    .insert({ user_id: user.id, item_id: itemId, title, lat, lng })
    .select("id")
    .single();
  if (error || !intent) {
    return NextResponse.json({ ok: false, error: "insert failed" }, { status: 500 });
  }

  const qstashUrl = process.env.QSTASH_URL;
  const qstashToken = process.env.QSTASH_TOKEN;
  const reminderSecret = process.env.NAV_REMINDER_SECRET;
  if (qstashUrl && qstashToken && reminderSecret) {
    const distanceM = (originLat != null && originLng != null)
      ? haversine([originLat, originLng], [lat, lng])
      : DEFAULT_DISTANCE_M;
    const etaS = Math.min(MAX_ETA_S, Math.max(MIN_ETA_S, Math.round(distanceM / WALK_SPEED_MPS)));
    const base = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://eco-navigation.vercel.app";
    try {
      const res = await fetch(`${qstashUrl}/v2/publish/${base}/api/qstash/nav-reminder`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${qstashToken}`,
          "Content-Type": "application/json",
          "Upstash-Delay": `${etaS}s`,
          "Upstash-Forward-Authorization": `Bearer ${reminderSecret}`,
        },
        body: JSON.stringify({ intentId: intent.id }),
      });
      if (res.ok) {
        const data: { messageId?: string } = await res.json();
        if (data.messageId) {
          await supabase.from("nav_intents").update({ qstash_message_id: data.messageId }).eq("id", intent.id);
        }
      }
    } catch {
      // non-fatal — the proximity check on the next app open still covers this
    }
  }

  return NextResponse.json({ ok: true, intentId: intent.id });
}
