import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { configureVapid, pushToUser } from "@/lib/pushToUser";
import { PENDING_REMINDER_MS } from "@/lib/geoClose";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "לא מורשה" }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error("[pending-reminders] SUPABASE_SERVICE_ROLE_KEY is not set");
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const cutoff = new Date(Date.now() - PENDING_REMINDER_MS).toISOString();
  const { data: pending, error } = await supabase
    .from("items")
    .select("id,title,reporter_id")
    .not("pending_taken_by", "is", null)
    .is("pending_reminder_sent_at", null)
    .lt("pending_taken_at", cutoff);

  if (error) return NextResponse.json({ ok: false, error: "שגיאה בשליפה" }, { status: 500 });
  if (!pending?.length) return NextResponse.json({ ok: true, notified: 0 });

  const hasVapid = configureVapid();
  let notified = 0;
  for (const item of pending) {
    if (hasVapid) {
      await pushToUser(supabase, item.reporter_id, {
        title: "🌿 האם החפץ נלקח?",
        body: `${item.title} — מישהו דיווח לפני יממה שהוא נלקח. יש לאשר או לדחות.`,
        url: `/items/${item.id}`,
      });
    }
    await supabase.from("items").update({ pending_reminder_sent_at: new Date().toISOString() }).eq("id", item.id);
    notified++;
  }

  return NextResponse.json({ ok: true, notified });
}
