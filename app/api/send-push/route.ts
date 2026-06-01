import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { item_id, sender_id, content, item_title } = await req.json();
  if (!item_id || !sender_id) return NextResponse.json({ ok: false });

  // Find who to notify: the item reporter (if they're not the sender)
  const { data: item } = await supabaseAdmin
    .from("items").select("reporter_id").eq("id", item_id).single();
  if (!item) return NextResponse.json({ ok: false });

  const recipient_id = item.reporter_id === sender_id ? null : item.reporter_id;
  // Only notify reporter for now (they own the item and want to know about interest)
  if (!recipient_id) return NextResponse.json({ ok: true, skipped: true });

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions").select("subscription").eq("user_id", recipient_id);
  if (!subs?.length) return NextResponse.json({ ok: true, no_sub: true });

  const payload = JSON.stringify({
    title: `💬 ${item_title ?? "פריט"}`,
    body: content.length > 80 ? content.slice(0, 80) + "…" : content,
    url: `/chat/${item_id}`,
  });

  await Promise.allSettled(
    subs.map(({ subscription }) =>
      webpush.sendNotification(subscription as webpush.PushSubscription, payload)
    )
  );

  return NextResponse.json({ ok: true });
}
