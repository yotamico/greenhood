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

  // Use service role key so RLS doesn't block reading other users' subscriptions
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  );

  const { item_id, sender_id, content, item_title } = await req.json();
  if (!item_id || !sender_id) return NextResponse.json({ ok: false });

  const { data: item } = await supabaseAdmin
    .from("items").select("reporter_id").eq("id", item_id).single();
  if (!item) return NextResponse.json({ ok: false });

  const recipient_id = item.reporter_id === sender_id ? null : item.reporter_id;
  if (!recipient_id) return NextResponse.json({ ok: true, skipped: true });

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions").select("subscription").eq("user_id", recipient_id);
  if (!subs?.length) return NextResponse.json({ ok: true, no_sub: true });

  const payload = JSON.stringify({
    title: `💬 ${item_title ?? "פריט"}`,
    body: content.length > 80 ? content.slice(0, 80) + "…" : content,
    url: `/items/${item_id}`,
  });

  const results = await Promise.allSettled(
    subs.map(({ subscription }) =>
      webpush.sendNotification(subscription as webpush.PushSubscription, payload)
    )
  );

  // Remove expired/invalid subscriptions (410 Gone)
  const expired = results
    .map((r, i) => ({ r, sub: subs[i] }))
    .filter(({ r }) => r.status === "rejected" && (r as PromiseRejectedResult).reason?.statusCode === 410);
  if (expired.length) {
    await Promise.allSettled(
      expired.map(({ sub }) =>
        supabaseAdmin.from("push_subscriptions")
          .delete()
          .eq("endpoint", (sub.subscription as { endpoint: string }).endpoint)
      )
    );
  }

  const sent = results.filter(r => r.status === "fulfilled").length;
  return NextResponse.json({ ok: true, sent });
}
