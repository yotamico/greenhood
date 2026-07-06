"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { TabBar } from "@/components/ui/TabBar";

const OPEN_THRESHOLD = 90; // px dragged inward (rightward) to trigger open

const CATEGORIES = [
  { id: "improve", label: "שיפור", emoji: "💡", color: "var(--primary)" },
  { id: "keep",    label: "לשמר",  emoji: "💚", color: "var(--info)" },
  { id: "bug",     label: "תקלה",  emoji: "🐞", color: "var(--accent)" },
  { id: "idea",    label: "רעיון", emoji: "✨", color: "var(--warning)" },
] as const;

const AREAS = ["כללי", "מפה", "דיווח חפץ", "צ׳אט", "פרופיל"];

// Screens where a logged-out or out-of-context user shouldn't see the tab
const HIDDEN_PREFIXES = ["/login", "/welcome", "/auth", "/admin"];

export function FeedbackWidget() {
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUserId(session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const hidden = pathname === "/" || HIDDEN_PREFIXES.some(p => pathname.startsWith(p));
  if (!userId || hidden) return null;

  return (
    <>
      {!open && <DraggableTab onOpen={() => setOpen(true)} />}
      {open && <FeedbackPanel userId={userId} onClose={() => setOpen(false)} />}
    </>
  );
}

/* ── Draggable edge tab — flush to the left, drag up/down to reposition, drag inward to open ── */
function DraggableTab({ onOpen }: { onOpen: () => void }) {
  const [top, setTop] = useState(() => (typeof window !== "undefined" ? window.innerHeight * 0.44 : 360));
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; top: number } | null>(null);
  const dxRef = useRef(0); // live pull distance, read at release time to avoid stale state

  const armed = dx > OPEN_THRESHOLD;

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, top };
    setDragging(true);
  }
  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!start.current) return;
    const pull = Math.max(0, e.clientX - start.current.x);
    dxRef.current = pull;
    setDx(pull);
    const ny = start.current.top + (e.clientY - start.current.y);
    setTop(Math.min(window.innerHeight - 150, Math.max(70, ny)));
  }
  function onPointerUp() {
    if (dxRef.current > OPEN_THRESHOLD) onOpen();
    reset();
  }
  // Mobile browsers fire pointercancel (not pointerup) when the gesture is interrupted —
  // e.g. the map underneath claims the touch. Without this, dx got stuck mid-drag forever,
  // leaving the peek panel visibly frozen open.
  function reset() {
    dxRef.current = 0;
    setDx(0);
    setDragging(false);
    start.current = null;
  }

  return (
    <>
      {/* peek of the feedback panel revealed as the tab is pulled inward */}
      <div style={{
        position: "fixed", left: 0, top: 0, bottom: 0,
        width: Math.min(dx * 1.6, 300),
        background: "var(--primary-tint)",
        borderRight: dx > 4 ? "2px solid var(--ink)" : "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity: Math.min(dx / 80, 1), pointerEvents: "none",
        transition: dragging ? "none" : "all var(--d-base) var(--ease)",
        zIndex: 59,
      }}>
        {armed && <span style={{ fontWeight: 800, fontSize: 13, color: "var(--ink)", whiteSpace: "nowrap" }}>שחררו לפתיחה →</span>}
      </div>

      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={reset}
        onLostPointerCapture={reset}
        aria-label="שליחת משוב"
        style={{
          position: "fixed", left: 0, top,
          transform: `translateX(${dx}px)`,
          background: armed ? "var(--primary)" : "var(--ink)",
          color: armed ? "var(--ink)" : "var(--paper)",
          border: "2.5px solid var(--ink)", borderLeft: "none",
          borderRadius: "0 16px 16px 0",
          boxShadow: "3px 3px 0 var(--shadow-ink)",
          padding: "14px 9px", cursor: dragging ? "grabbing" : "grab",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          fontFamily: "var(--font-sans)", touchAction: "none",
          transition: dragging ? "none" : "transform var(--d-base) var(--ease), background var(--d-fast) var(--ease)",
          zIndex: 60,
        }}
      >
        <span style={{ display: "flex", flexDirection: "column", gap: 2, opacity: 0.55 }}>
          {[0, 1].map(r => (
            <span key={r} style={{ display: "flex", gap: 2 }}>
              {[0, 1].map(c => <span key={c} style={{ width: 3, height: 3, borderRadius: 9, background: "currentColor" }} />)}
            </span>
          ))}
        </span>
        <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontWeight: 800, fontSize: 13, letterSpacing: "0.06em" }}>
          Feedback
        </span>
      </button>
    </>
  );
}

/* ── Full feedback screen ── */
function FeedbackPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [cat, setCat] = useState<typeof CATEGORIES[number]["id"]>("improve");
  const [area, setArea] = useState(AREAS[0]);
  const [text, setText] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      let screenshot_url: string | null = null;
      if (screenshot) {
        const ext = screenshot.name.split(".").pop() ?? "jpg";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("feedback-screenshots").upload(path, screenshot);
        if (!upErr) {
          screenshot_url = supabase.storage.from("feedback-screenshots").getPublicUrl(path).data.publicUrl;
        }
      }
      const { error } = await supabase.from("feedback").insert([{
        user_id: userId, category: cat, area, message: text.trim(), screenshot_url,
      }]);
      if (error) { alert("שגיאה בשליחת המשוב"); return; }
      try { await supabase.rpc("increment_xp" as never, { user_id: userId, amount: 5 } as never); } catch { /* best-effort */ }
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div style={overlayStyle}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
          <div style={{
            width: 96, height: 96, borderRadius: "50%",
            background: "var(--primary)", border: "2.5px solid var(--ink)",
            boxShadow: "5px 5px 0 var(--shadow-ink)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 46, marginBottom: 24,
          }}>💚</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 24, marginBottom: 8 }}>תודה על ההצעה!</div>
          <div style={{ fontSize: 14, color: "var(--muted)", fontWeight: 500, lineHeight: 1.5, maxWidth: 260, marginBottom: 20 }}>
            קיבלנו את המשוב שלך. אם נאמץ אותו — נעדכן אותך ותקבלו 30 XP 🎉
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 28,
            padding: "5px 12px", borderRadius: 999,
            background: "var(--warning-tint)", border: "1.5px solid var(--ink)",
            fontSize: 12, fontWeight: 800,
          }}>
            <IconStar size={14} /> +5 XP על השיתוף
          </div>
          <button
            onClick={() => { setSent(false); setText(""); setScreenshot(null); }}
            style={{
              padding: "10px 20px", background: "var(--surface)",
              border: "2px solid var(--ink)", borderRadius: 12,
              boxShadow: "2px 2px 0 var(--shadow-ink)", cursor: "pointer",
              fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 14,
            }}
          >שליחת הצעה נוספת</button>
        </div>
        <TabBar />
        <CloseButton onClose={onClose} />
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      {/* HEADER */}
      <div style={{
        padding: "10px 16px 14px",
        background: "var(--primary-tint)",
        borderBottom: "2px solid var(--ink)",
        display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 19, lineHeight: 1 }}>הצעות ושיפורים</div>
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, marginTop: 3 }}>
            עוזרים לנו לבנות שכונה טובה יותר
          </div>
        </div>
        <div style={{ fontSize: 26 }}>📣</div>
      </div>

      {/* CONTENT */}
      <div className="no-scrollbar" style={{ flex: 1, overflow: "auto", padding: "16px 16px 24px" }}>

        {/* CATEGORY */}
        <div style={{ marginBottom: 18 }}>
          <FieldLabel>על מה תרצו לספר?</FieldLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {CATEGORIES.map(c => {
              const active = c.id === cat;
              return (
                <button key={c.id} onClick={() => setCat(c.id)} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "12px 12px",
                  background: active ? c.color : "var(--surface)",
                  color: active && c.id === "bug" ? "white" : "var(--ink)",
                  border: "2px solid var(--ink)", borderRadius: 12,
                  boxShadow: active ? "3px 3px 0 var(--shadow-ink)" : "2px 2px 0 var(--shadow-ink)",
                  cursor: "pointer", fontFamily: "var(--font-sans)",
                  fontWeight: 800, fontSize: 14,
                  transform: active ? "translate(-1px,-1px)" : "none",
                  transition: "all var(--d-fast) var(--ease)",
                }}>
                  <span style={{ fontSize: 18 }}>{c.emoji}</span>
                  {c.label}
                  {active && <IconCheck size={16} style={{ marginRight: "auto" }} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* AREA */}
        <div style={{ marginBottom: 18 }}>
          <FieldLabel>איפה באפליקציה?</FieldLabel>
          <div className="no-scrollbar" style={{ display: "flex", gap: 8, overflowX: "auto", marginInline: -16, padding: "0 16px" }}>
            {AREAS.map(a => {
              const active = a === area;
              return (
                <button key={a} onClick={() => setArea(a)} style={{
                  flexShrink: 0, padding: "8px 14px", height: 34,
                  background: active ? "var(--ink)" : "var(--surface)",
                  color: active ? "var(--paper)" : "var(--ink)",
                  border: "1.5px solid var(--ink)", borderRadius: 999,
                  boxShadow: active ? "2px 2px 0 var(--shadow-ink)" : "none",
                  cursor: "pointer", fontFamily: "var(--font-sans)",
                  fontWeight: 700, fontSize: 13, whiteSpace: "nowrap",
                }}>{a}</button>
              );
            })}
          </div>
        </div>

        {/* TEXTAREA */}
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>ההצעה שלכם</FieldLabel>
          <div style={{
            background: "var(--surface)", border: "2px solid var(--ink)",
            borderRadius: 14, boxShadow: "3px 3px 0 var(--shadow-ink)",
            padding: 14,
          }}>
            <textarea
              value={text}
              onChange={e => setText(e.target.value.slice(0, 500))}
              placeholder="למשל: הייתי שמח שאפשר לסמן חפץ כ׳נלקח׳ ישירות מהמפה…"
              rows={5}
              maxLength={500}
              style={{
                width: "100%", border: 0, outline: 0, resize: "none",
                background: "transparent", fontFamily: "var(--font-sans)",
                fontSize: 14, color: "var(--ink)", lineHeight: 1.5,
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, borderTop: "1.5px dashed var(--line)", paddingTop: 10 }}>
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  display: "flex", alignItems: "center", gap: 6, maxWidth: 180,
                  background: "var(--paper-2)", border: "1.5px solid var(--ink)",
                  borderRadius: 999, padding: "6px 12px", cursor: "pointer",
                  fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 12, color: "var(--ink)",
                }}
              >
                <IconImage size={15} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {screenshot ? screenshot.name : "צרפו צילום מסך"}
                </span>
              </button>
              <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{text.length}/500</span>
            </div>
            {screenshot && (
              <button
                onClick={() => { setScreenshot(null); if (fileRef.current) fileRef.current.value = ""; }}
                style={{
                  marginTop: 8, background: "transparent", border: "none", padding: 0,
                  color: "var(--accent-dark)", fontFamily: "var(--font-sans)", fontWeight: 700,
                  fontSize: 11, cursor: "pointer",
                }}
              >הסר צילום מסך ✕</button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={e => setScreenshot(e.target.files?.[0] ?? null)}
              style={{ display: "none" }}
            />
          </div>
        </div>

        {/* SUBMIT */}
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || sending}
          style={{
            width: "100%", height: 52,
            background: text.trim() ? "var(--primary)" : "var(--primary-tint)",
            color: "var(--ink)", border: "2px solid var(--ink)", borderRadius: "var(--r-md)",
            fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 16,
            cursor: text.trim() && !sending ? "pointer" : "not-allowed",
            boxShadow: text.trim() ? "var(--sh-md)" : "none",
            opacity: text.trim() ? 1 : 0.5,
            transition: "opacity 200ms, background 200ms",
          }}
        >
          {sending ? "שולח…" : "שליחת המשוב →"}
        </button>
        <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500, textAlign: "center", marginTop: 10, lineHeight: 1.5 }}>
          כל הצעה נקראת על ידי הצוות. הצעות שנאמצות מזכות אתכם ב־XP 💚
        </div>
      </div>

      <TabBar />
      <CloseButton onClose={onClose} />
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 500,
  background: "var(--paper)",
  display: "flex", flexDirection: "column", overflow: "hidden",
  animation: "feedbackSlideIn var(--d-base) var(--ease)",
};

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button onClick={onClose} aria-label="סגירה" style={{
      position: "absolute", top: 62, left: 14, zIndex: 510,
      width: 34, height: 34, borderRadius: 9,
      background: "var(--surface)", border: "2px solid var(--ink)",
      boxShadow: "2px 2px 0 var(--shadow-ink)", cursor: "pointer",
      fontWeight: 900, fontSize: 15, lineHeight: 1,
    }}>✕</button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ink)", marginBottom: 9 }}>{children}</div>;
}

function IconCheck({ size = 16, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}
      stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconImage({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function IconStar({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z" />
    </svg>
  );
}
