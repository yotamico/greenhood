import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { APPEAL_WINDOW_MS } from "@/lib/geoClose";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ ok: false, error: "חסר משתמש" }, { status: 400 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error("[dispute] SUPABASE_SERVICE_ROLE_KEY is not set");
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("id,status,taken_at")
    .eq("id", id)
    .single();
  if (itemErr || !item) return NextResponse.json({ ok: false, error: "פריט לא נמצא" }, { status: 404 });

  if (item.status !== "taken" || !item.taken_at) {
    return NextResponse.json({ ok: false, error: "הפריט אינו סגור כרגע" }, { status: 400 });
  }
  if (Date.now() - new Date(item.taken_at).getTime() > APPEAL_WINDOW_MS) {
    return NextResponse.json({ ok: false, error: "חלון הערעור נסגר" }, { status: 400 });
  }

  const { error: insertErr } = await supabase
    .from("item_dispute_reports")
    .insert([{ item_id: id, user_id: userId }]);
  if (insertErr && insertErr.code !== "23505") {
    return NextResponse.json({ ok: false, error: "שגיאה בשמירה" }, { status: 500 });
  }

  const { count } = await supabase
    .from("item_dispute_reports")
    .select("id", { count: "exact", head: true })
    .eq("item_id", id);

  let reopened = false;
  if ((count ?? 0) >= 2) {
    await supabase
      .from("items")
      .update({ status: "active", taken_at: null, closed_by: null })
      .eq("id", id);
    await supabase.from("item_dispute_reports").delete().eq("item_id", id);
    reopened = true;
  }

  return NextResponse.json({ ok: true, reopened });
}
