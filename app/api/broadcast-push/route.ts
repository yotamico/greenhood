import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  webpush.setVapidDetails(
    (process.env.VAPID_SUBJECT ?? "").trim(),
    (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim(),
    (process.env.VAPID_PRIVATE_KEY ?? "").trim()
  );

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { item_title, item_address, item_lat, item_lng, sender_id } = await req.json();
  if (!item_title) return NextResponse.json({ ok: false });

  const lat  = typeof item_lat  === "number" ? item_lat  : null;
  const lng  = typeof item_lng  === "number" ? item_lng  : null;

  // Use SECURITY DEFINER function to read subscriptions nearby (bypasses RLS)
  const { data: subs, error } = lat && lng
    ? await supabase.rpc("get_push_subscriptions_nearby", { item_lat: lat, item_lng: lng, radius_km: 5 })
    : await supabase.rpc("get_push_subscriptions_nearby", { item_lat: 31.9297, item_lng: 34.8307, radius_km: 50 });

  if (error || !subs?.length) return NextResponse.json({ ok: true, sent: 0 });

  const payload = JSON.stringify({
    title: `🌿 ${item_title}`,
    body: item_address ? `פריט חדש ב${item_address}` : "פריט חדש ממתין לך ברחוב",
    url: "/feed",
  });

  const targets = (subs as { user_id: string; subscription: webpush.PushSubscription }[])
    .filter(s => s.user_id !== sender_id);

  const results = await Promise.allSettled(
    targets.map(s => webpush.sendNotification(s.subscription, payload))
  );

  const sent = results.filter(r => r.status === "fulfilled").length;
  return NextResponse.json({ ok: true, sent });
}
