import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, approve } = await req.json();
  if (!userId || typeof approve !== "boolean") {
    return NextResponse.json({ ok: false, error: "בקשה לא תקינה" }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error("[confirm-taken] SUPABASE_SERVICE_ROLE_KEY is not set");
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("id,reporter_id,pending_taken_by")
    .eq("id", id)
    .single();
  if (itemErr || !item) return NextResponse.json({ ok: false, error: "פריט לא נמצא" }, { status: 404 });

  if (item.reporter_id !== userId) {
    return NextResponse.json({ ok: false, error: "רק הבעלים יכול לאשר" }, { status: 403 });
  }
  if (!item.pending_taken_by) {
    return NextResponse.json({ ok: false, error: "אין בקשה הממתינה לאישור" }, { status: 400 });
  }

  const update = approve
    ? {
        status: "taken",
        taken_at: new Date().toISOString(),
        closed_by: item.pending_taken_by,
        pending_taken_by: null,
        pending_taken_at: null,
        pending_reminder_sent_at: null,
      }
    : {
        pending_taken_by: null,
        pending_taken_at: null,
        pending_reminder_sent_at: null,
      };

  const { error: updateErr } = await supabase.from("items").update(update).eq("id", id);
  if (updateErr) return NextResponse.json({ ok: false, error: "שגיאה בשמירה" }, { status: 500 });

  return NextResponse.json({ ok: true, status: approve ? "taken" : "active" });
}
