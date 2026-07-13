import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const VALID_CATEGORIES = ["furniture","books","lighting","plants","sports","electronics","kitchen","kids"];

// The client already resizes photos to ~800px JPEG before sending — a legitimate
// payload never gets close to this. Anything bigger is someone bypassing the app.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_REQUESTS_PER_HOUR = 5;

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const { imageBase64, mediaType } = await req.json().catch(() => ({}));
  if (!imageBase64) return NextResponse.json({ error: "missing image" }, { status: 400 });
  if (imageBase64.length * 0.75 > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "image too large" }, { status: 413 });
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("ai_analyze_requests")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", oneHourAgo);
  if ((count ?? 0) >= MAX_REQUESTS_PER_HOUR) {
    return NextResponse.json({ error: "rate limit exceeded — try again later" }, { status: 429 });
  }
  await supabaseAdmin.from("ai_analyze_requests").insert({ user_id: user.id });

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: (mediaType ?? "image/jpeg") as "image/jpeg", data: imageBase64 },
          },
          {
            type: "text",
            text: `אתה מזהה חפצים שנמצאים ברחוב לאיסוף חינם בישראל.
זהה את החפץ הראשי בתמונה והחזר JSON בלבד (ללא טקסט נוסף):
{
  "title": "שם החפץ בעברית (2-4 מילים, תיאורי)",
  "category": "אחת מ: furniture/books/lighting/plants/sports/electronics/kitchen/kids",
  "confidence": 0.0-1.0
}
אם לא ניתן לזהות חפץ ברור, החזר confidence נמוך מ-0.4.`,
          },
        ],
      }],
    });

    const raw = (msg.content[0] as { type: string; text: string }).text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: "parse error" }, { status: 500 });

    const parsed = JSON.parse(jsonMatch[0]) as { title: string; category: string; confidence: number };
    if (!VALID_CATEGORIES.includes(parsed.category)) parsed.category = "furniture";

    return NextResponse.json({
      title:      parsed.title,
      category:   parsed.category,
      confidence: parsed.confidence ?? 0.5,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    console.error("[analyze-image]", err.status, err.message?.slice(0, 120));
    return NextResponse.json({ error: "analysis failed" }, { status: 500 });
  }
}
