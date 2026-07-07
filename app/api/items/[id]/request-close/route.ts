import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { configureVapid, pushToUser } from "@/lib/pushToUser";
import { CLOSE_PROXIMITY_M, CLOSE_REQUESTS_PER_HOUR, h3Cell, haversineMeters } from "@/lib/geoClose";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, lat, lng } = await req.json();
  if (!userId || typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ ok: false, error: "חסרים פרטי מיקום" }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error("[request-close] SUPABASE_SERVICE_ROLE_KEY is not set");
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("id,title,reporter_id,status,pickup_day,lat,lng,pending_taken_by")
    .eq("id", id)
    .single();
  if (itemErr || !item) return NextResponse.json({ ok: false, error: "פריט לא נמצא" }, { status: 404 });

  if (item.pickup_day !== null) {
    return NextResponse.json({ ok: false, error: "פריט עם פינוי מתוזמן מתפנה אוטומטית — אין צורך לדווח" }, { status: 400 });
  }
  if (item.status !== "active") {
    return NextResponse.json({ ok: false, error: "הפריט כבר אינו זמין" }, { status: 400 });
  }
  if (item.reporter_id === userId) {
    return NextResponse.json({ ok: false, error: "אתה הבעלים — השתמש בכפתור 'סמן כנלקח'" }, { status: 400 });
  }
  if (item.pending_taken_by) {
    return NextResponse.json({ ok: false, error: "כבר קיימת בקשה הממתינה לאישור הבעלים" }, { status: 409 });
  }
  if (item.lat == null || item.lng == null) {
    return NextResponse.json({ ok: false, error: "לא ניתן לאמת מיקום עבור פריט זה" }, { status: 400 });
  }

  const distance = haversineMeters(lat, lng, item.lat, item.lng);
  if (distance > CLOSE_PROXIMITY_M) {
    return NextResponse.json({ ok: false, error: "אתה לא נמצא בקרבת הפריט" }, { status: 403 });
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentRequests } = await supabase
    .from("item_close_requests")
    .select("lat,lng")
    .eq("user_id", userId)
    .gte("created_at", oneHourAgo);

  const targetCell = h3Cell(item.lat, item.lng);
  const sameAreaCount = (recentRequests ?? []).filter(
    r => r.lat != null && r.lng != null && h3Cell(r.lat, r.lng) === targetCell
  ).length;
  if (sameAreaCount >= CLOSE_REQUESTS_PER_HOUR) {
    return NextResponse.json({ ok: false, error: "הגעת למגבלת הדיווחים לשעה באזור זה" }, { status: 429 });
  }

  await supabase.from("item_close_requests").insert([{ item_id: id, user_id: userId, lat, lng }]);

  const { error: updateErr } = await supabase
    .from("items")
    .update({ pending_taken_by: userId, pending_taken_at: new Date().toISOString() })
    .eq("id", id);
  if (updateErr) return NextResponse.json({ ok: false, error: "שגיאה בשמירה" }, { status: 500 });

  if (configureVapid()) {
    await pushToUser(supabase, item.reporter_id, {
      title: "🌿 מישהו דיווח שהפריט שלך נלקח",
      body: `${item.title} — מאשר את המסירה?`,
      url: `/items/${id}`,
    });
  }

  return NextResponse.json({ ok: true });
}
