import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { configureVapid, pushToUser } from "@/lib/pushToUser";

const ADMIN_DASHBOARD_URL = "https://greenhood-admin.vercel.app/dashboard";

// Called by a Postgres trigger (net.http_post) when a new item lands as moderation_status
// 'pending' — see supabase_pending_item_notify.sql. The trigger passes the admin user ids in
// the body (single source of truth: the same email is_admin() checks), and authenticates with
// the service role key as a shared secret since the caller is the database itself.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error("[pending-webhook] SUPABASE_SERVICE_ROLE_KEY is not set");
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${serviceKey}`) {
    return NextResponse.json({ ok: false, error: "לא מורשה" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const adminIds: string[] = Array.isArray(body?.admin_ids)
    ? body.admin_ids.filter((v: unknown): v is string => typeof v === "string")
    : [];
  if (!adminIds.length) return NextResponse.json({ ok: true, sent: 0 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
  const { data: item, error } = await supabase
    .from("items")
    .select("id,title,address,moderation_status")
    .eq("id", id)
    .single();
  if (error || !item) return NextResponse.json({ ok: false, error: "פריט לא נמצא" }, { status: 404 });
  if (item.moderation_status !== "pending") return NextResponse.json({ ok: true, sent: 0 });

  if (!configureVapid()) return NextResponse.json({ ok: true, sent: 0 });

  const counts = await Promise.all(adminIds.map(adminId =>
    pushToUser(supabase, adminId, {
      title: "🆕 פריט חדש ממתין לאישור",
      body: item.address ? `${item.title} — ${item.address}` : item.title,
      url: ADMIN_DASHBOARD_URL,
    })
  ));
  return NextResponse.json({ ok: true, sent: counts.reduce((a, b) => a + b, 0) });
}
