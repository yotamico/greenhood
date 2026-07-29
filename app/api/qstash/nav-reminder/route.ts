import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { configureVapid, pushToUser } from "@/lib/pushToUser";

// Called by QStash (via the delayed message scheduled in /api/nav-intent) roughly when the
// user should have arrived at the item they navigated to. Auth is a shared secret forwarded
// by QStash as `Upstash-Forward-Authorization` (see NAV_REMINDER_SECRET), not QStash's own
// request-signing — simpler, and this endpoint does nothing sensitive besides send one push.
export async function POST(req: NextRequest) {
  const secret = process.env.NAV_REMINDER_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "לא מורשה" }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error("[nav-reminder] SUPABASE_SERVICE_ROLE_KEY is not set");
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const { intentId } = await req.json();
  if (!intentId) return NextResponse.json({ ok: false, error: "missing intentId" }, { status: 400 });

  const { data: intent } = await supabase
    .from("nav_intents")
    .select("user_id,item_id,title,notified_at")
    .eq("id", intentId)
    .single();
  if (!intent || intent.notified_at) return NextResponse.json({ ok: true, skipped: true });

  const { data: item } = await supabase
    .from("items")
    .select("status")
    .eq("id", intent.item_id)
    .single();

  // already closed (by this user or someone else) — nothing to nudge about
  if (!item || item.status !== "active") {
    await supabase.from("nav_intents").update({ notified_at: new Date().toISOString() }).eq("id", intentId);
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (configureVapid()) {
    await pushToUser(supabase, intent.user_id, {
      title: "🌿 הגעת?",
      body: `${intent.title} — אם לקחת אותו, אפשר לדווח שנלקח`,
      url: `/items/${intent.item_id}`,
    });
  }
  await supabase.from("nav_intents").update({ notified_at: new Date().toISOString() }).eq("id", intentId);

  return NextResponse.json({ ok: true });
}
