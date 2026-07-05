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

  // Service role key is required so RLS doesn't block reading the other user's subscriptions.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error("[send-push] SUPABASE_SERVICE_ROLE_KEY is not set — cannot read push_subscriptions across users");
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const { item_id, sender_id, content, item_title } = await req.json();
  if (!item_id || !sender_id || !content) return NextResponse.json({ ok: false });

  const { data: item } = await supabase
    .from("items")
    .select("reporter_id")
    .eq("id", item_id)
    .single();
  if (!item) return NextResponse.json({ ok: true, sent: 0 });

  // 1:1 chat per item — recipient is the reporter, unless the reporter is the sender,
  // in which case it's whoever else has posted in this thread.
  let recipientId: string | null = item.reporter_id !== sender_id ? item.reporter_id : null;
  if (!recipientId) {
    const { data: other } = await supabase
      .from("messages")
      .select("sender_id")
      .eq("item_id", item_id)
      .neq("sender_id", sender_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    recipientId = other?.sender_id ?? null;
  }
  if (!recipientId) return NextResponse.json({ ok: true, sent: 0 });

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint,subscription")
    .eq("user_id", recipientId);
  if (error || !subs?.length) return NextResponse.json({ ok: true, sent: 0 });

  const payload = JSON.stringify({
    title: `💬 ${item_title ?? "הודעה חדשה"}`,
    body: content,
    url: `/chat/${item_id}`,
  });

  const results = await Promise.allSettled(
    (subs as { endpoint: string; subscription: webpush.PushSubscription }[])
      .map(s => webpush.sendNotification(s.subscription, payload))
  );

  // Remove expired/invalid subscriptions (410 Gone)
  const expired = results
    .map((r, i) => ({ r, target: subs[i] }))
    .filter(({ r }) => r.status === "rejected" && (r as PromiseRejectedResult).reason?.statusCode === 410);
  if (expired.length) {
    await Promise.allSettled(
      expired.map(({ target }) =>
        supabase.from("push_subscriptions").delete().eq("endpoint", target.endpoint)
      )
    );
  }

  const sent = results.filter(r => r.status === "fulfilled").length;
  return NextResponse.json({ ok: true, sent });
}
