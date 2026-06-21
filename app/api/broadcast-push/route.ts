import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const pubKey  = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
  const privKey = (process.env.VAPID_PRIVATE_KEY ?? "").trim();
  const subject = (process.env.VAPID_SUBJECT ?? "").trim();
  if (!pubKey || !privKey || !subject) {
    return NextResponse.json({ ok: false, error: "VAPID keys not configured" }, { status: 500 });
  }
  webpush.setVapidDetails(subject, pubKey, privKey);

  // Use service role key so RLS doesn't block reading subscriptions
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  );

  const { item_title, item_address, item_lat, item_lng, sender_id } = await req.json();
  if (!item_title) return NextResponse.json({ ok: false });

  const lat = typeof item_lat === "number" ? item_lat : null;
  const lng = typeof item_lng === "number" ? item_lng : null;

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

  // Remove expired/invalid subscriptions (410 Gone)
  const expired = results
    .map((r, i) => ({ r, target: targets[i] }))
    .filter(({ r }) => r.status === "rejected" && (r as PromiseRejectedResult).reason?.statusCode === 410);
  if (expired.length) {
    await Promise.allSettled(
      expired.map(({ target }) =>
        supabase.from("push_subscriptions")
          .delete()
          .eq("endpoint", (target.subscription as unknown as { endpoint: string }).endpoint)
      )
    );
  }

  const sent = results.filter(r => r.status === "fulfilled").length;
  return NextResponse.json({ ok: true, sent });
}
