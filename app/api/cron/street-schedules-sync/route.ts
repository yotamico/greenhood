import { NextRequest, NextResponse } from "next/server";
import { syncNextCity } from "@/lib/streetSchedules/sync";

// Per-street sources need one HTTP request per street (Rehovot ~605, Rishon ~1000+), so a
// single run can take minutes — needs the extended execution window, and the daily schedule
// refreshes one city per day round-robin instead of all cities at once.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "לא מורשה" }, { status: 401 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[street-schedules-sync] SUPABASE_SERVICE_ROLE_KEY is not set");
    return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  }

  try {
    const result = await syncNextCity();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
