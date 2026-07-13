import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { configureVapid, pushToUser } from "@/lib/pushToUser";

// Called by a Postgres trigger (net.http_post) whenever items.moderation_status
// changes to 'approved' or 'rejected' — see supabase_moderation_push_notify.sql.
// Authenticated with the service role key as a shared secret, since the caller
// is the database itself, not a logged-in user.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error("[moderation-webhook] SUPABASE_SERVICE_ROLE_KEY is not set");
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${serviceKey}`) {
    return NextResponse.json({ ok: false, error: "לא מורשה" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const { data: item, error } = await supabase
    .from("items")
    .select("id,title,reporter_id,moderation_status,moderation_reason")
    .eq("id", id)
    .single();
  if (error || !item) return NextResponse.json({ ok: false, error: "פריט לא נמצא" }, { status: 404 });

  if (!configureVapid()) return NextResponse.json({ ok: true, sent: 0 });

  if (item.moderation_status === "approved") {
    const sent = await pushToUser(supabase, item.reporter_id, {
      title: "✅ הפריט שלך אושר",
      body: `${item.title} אושר ומוצג עכשיו במפה ובפיד`,
      url: `/items/${id}`,
    });
    return NextResponse.json({ ok: true, sent });
  }

  if (item.moderation_status === "rejected") {
    const sent = await pushToUser(supabase, item.reporter_id, {
      title: "❌ הפריט שלך לא אושר",
      body: item.moderation_reason ? `${item.title} — ${item.moderation_reason}` : `${item.title} לא עמד בכללי הקהילה`,
      url: `/items/${id}`,
    });
    return NextResponse.json({ ok: true, sent });
  }

  return NextResponse.json({ ok: true, sent: 0 });
}
