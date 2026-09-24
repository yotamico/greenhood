import { NextRequest, NextResponse } from "next/server";
import { syncCitiesWithinBudget } from "@/lib/streetSchedules/sync";

// Per-street sources need one HTTP request per street (Rehovot ~605, Rishon ~1000+), so a
// single run can take minutes — needs the extended execution window. Each run works through
// cities in priority order until its time budget is spent (see syncCitiesWithinBudget).
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
    const results = await syncCitiesWithinBudget();
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
