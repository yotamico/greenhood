import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VALID_CATEGORIES = ["furniture","books","lighting","plants","sports","electronics","kitchen","kids"];

export async function POST(req: NextRequest) {
  const { imageBase64, mediaType } = await req.json().catch(() => ({}));
  if (!imageBase64) return NextResponse.json({ error: "missing image" }, { status: 400 });

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
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
    if (!jsonMatch) {
      console.error("[AI-ERR] parse-error raw:", raw.slice(0, 200));
      return NextResponse.json({ error: "parse error" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as { title: string; category: string; confidence: number };
    if (!VALID_CATEGORIES.includes(parsed.category)) parsed.category = "furniture";

    return NextResponse.json({
      title:      parsed.title,
      category:   parsed.category,
      confidence: parsed.confidence ?? 0.5,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string; error?: { type?: string; message?: string } };
    const detail = `status=${err.status} msg="${err.message}" type="${err.error?.type}" errMsg="${err.error?.message}"`;
    console.error("[AI-ERR]", detail);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
