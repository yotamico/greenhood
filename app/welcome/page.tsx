"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/* ──────────────────────────────────────────────────────────
   Types
────────────────────────────────────────────────────────── */
type Persona = "hunter" | "upcycler" | "vintage" | "reporter" | "org";

const PERSONAS: {
  id: Persona; label: string; sub: string; emoji: string; color: string;
}[] = [
  { id: "hunter",   label: "ציייד מציאות",   sub: "מחפש אוצרות",        emoji: "🎯", color: "var(--accent-tint)"   },
  { id: "upcycler", label: "משפץ / מייקר",   sub: "נותן חיים חדשים",    emoji: "🔧", color: "var(--warning-tint)"  },
  { id: "vintage",  label: "חובב וינטג׳",    sub: "אוסף פריטים נדירים", emoji: "🪑", color: "var(--info-tint)"     },
  { id: "reporter", label: "מוסר חפצים",     sub: "מפנה מהבית",         emoji: "📦", color: "var(--primary-light)" },
  { id: "org",      label: "ארגון / צדקה",   sub: "אוסף לקהילה",        emoji: "♻️", color: "var(--paper-2)"       },
];

/* ──────────────────────────────────────────────────────────
   Floating sticker
────────────────────────────────────────────────────────── */
function FloatSticker({
  emoji, color,
  top, right, bottom, left,
  delay, visualRotation, orbitOrigin,
}: {
  emoji: string; color: string;
  top?: number; right?: number; bottom?: number; left?: number;
  delay: string; visualRotation: string; orbitOrigin: string;
}) {
  return (
    <div style={{
      position: "absolute",
      width: 56, height: 56,
      top, right, bottom, left,
      animation: "floatOrbit 2.8s ease-in-out infinite",
      animationDelay: delay,
      transformOrigin: orbitOrigin,
    }}>
      <div style={{
        width: "100%", height: "100%",
        background: color,
        borderRadius: 14,
        border: "2px solid var(--ink)",
        boxShadow: "3px 3px 0 var(--shadow-ink)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 28,
        transform: visualRotation,
      }}>{emoji}</div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Progress dots
────────────────────────────────────────────────────────── */
function ProgressDots({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 8,
            width: i === step ? 28 : 8,
            borderRadius: 999,
            background: i <= step ? "var(--ink)" : "var(--paper-2)",
            border: "1.5px solid var(--ink)",
            transition: "width 200ms ease",
          }}
        />
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Step 0 – Welcome
────────────────────────────────────────────────────────── */
function StepWelcome() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
      {/* Illustration */}
      <div style={{ position: "relative", width: 240, height: 240, margin: "24px auto 32px", flexShrink: 0 }}>
        <div style={{
          position: "absolute", inset: 0,
          background: "var(--primary-tint)",
          borderRadius: "50%",
          border: "2.5px solid var(--ink)",
          boxShadow: "5px 5px 0 var(--shadow-ink)",
        }} />
        <FloatSticker emoji="🪑" color="var(--warning-tint)" top={20}    right={-10} delay="0s"   visualRotation="rotate(-8deg)"  orbitOrigin="-74px 100px" />
        <FloatSticker emoji="📚" color="var(--accent-tint)"  top={50}    left={-8}   delay="0.4s" visualRotation="rotate(12deg)"  orbitOrigin="128px 70px"  />
        <FloatSticker emoji="💡" color="var(--info-tint)"    bottom={32} left={10}   delay="0.8s" visualRotation="rotate(-15deg)" orbitOrigin="110px -32px" />
        <FloatSticker emoji="🌿" color="var(--primary-light)" bottom={12} right={14} delay="1.2s" visualRotation="rotate(8deg)"   orbitOrigin="-50px -52px" />

        {/* center pin */}
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>
          <div style={{
            width: 70, height: 70,
            borderRadius: "50% 50% 50% 0",
            background: "var(--accent)",
            border: "3px solid var(--ink)",
            transform: "rotate(-45deg)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "4px 4px 0 var(--shadow-ink)",
          }}>
            <span style={{ transform: "rotate(45deg)", fontSize: 32 }}>📍</span>
          </div>
        </div>
      </div>

      {/* Text */}
      <span style={{
        fontFamily: "var(--font-display)",
        fontSize: 38, fontWeight: 900,
        letterSpacing: "-0.035em", lineHeight: 1,
        color: "var(--ink)",
        marginBottom: 14,
      }}>
        Green<span style={{ color: "var(--primary-dark)" }}>HOOD</span>
      </span>

      <h1 style={{
        fontFamily: "var(--font-display)",
        fontSize: 28, fontWeight: 900,
        lineHeight: 1.1, letterSpacing: "-0.02em",
        color: "var(--ink)",
        textAlign: "center",
        margin: "0 0 12px",
      }}>
        הרחוב שלך מלא אוצרות!
      </h1>

      <p style={{
        fontSize: 15, color: "var(--ink-soft)", fontWeight: 500,
        lineHeight: 1.55, textAlign: "center",
        maxWidth: 320, margin: 0,
      }}>
        ימי פינוי הופכים למפת ציד חיה. שכנים מדווחים, אתה מוצא, החפץ ניצל.
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Step 1 – Persona
────────────────────────────────────────────────────────── */
function StepPersona({
  personas, setPersonas,
}: {
  personas: Persona[]; setPersonas: (p: Persona[]) => void;
}) {
  function toggle(id: Persona) {
    setPersonas(
      personas.includes(id)
        ? personas.filter(p => p !== id)
        : [...personas, id],
    );
  }

  return (
    <div>
      <h2 style={{
        fontFamily: "var(--font-display)",
        fontSize: 30, fontWeight: 900, lineHeight: 1.1,
        letterSpacing: "-0.02em", margin: "0 0 8px",
      }}>
        מי את/ה כאן?
      </h2>
      <p style={{ fontSize: 14, color: "var(--muted)", fontWeight: 500, margin: "0 0 24px" }}>
        בחר/י אחד או יותר — נתאים את הפיד.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {PERSONAS.map(p => {
          const active = personas.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: 14, textAlign: "right", width: "100%",
                background: active ? p.color : "var(--surface)",
                border: "2px solid var(--ink)",
                borderRadius: 14,
                boxShadow: active ? "4px 4px 0 var(--shadow-ink)" : "1.5px 1.5px 0 var(--shadow-ink)",
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
                transform: active ? "translate(-1px,-1px)" : "none",
                transition: "all 120ms",
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: "var(--surface)", border: "2px solid var(--ink)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 24, flexShrink: 0,
              }}>{p.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16 }}>{p.label}</div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", fontWeight: 500, marginTop: 2 }}>{p.sub}</div>
              </div>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                background: active ? "var(--ink)" : "transparent",
                border: "2px solid var(--ink)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, fontSize: 14, color: "var(--paper)",
                fontWeight: 800,
              }}>
                {active ? "✓" : ""}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Step 3 – Push Notifications
────────────────────────────────────────────────────────── */
function StepPush({
  pushGranted, setPushGranted,
}: {
  pushGranted: boolean; setPushGranted: (v: boolean) => void;
}) {
  async function requestPush() {
    if (!("Notification" in window)) { setPushGranted(true); return; }
    if ("serviceWorker" in navigator) {
      try { await navigator.serviceWorker.register("/sw.js"); } catch { /* ignore */ }
    }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      setPushGranted(true);
      try {
        const reg = await navigator.serviceWorker.ready;
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
        const padding = "=".repeat((4 - (vapidKey.length % 4)) % 4);
        const raw = atob((vapidKey + padding).replace(/-/g, "+").replace(/_/g, "/"));
        const key = Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key as unknown as ArrayBuffer,
        });
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          let lat: number | null = null, lng: number | null = null;
          try {
            const pos = await new Promise<GeolocationPosition>((res, rej) =>
              navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
            );
            lat = pos.coords.latitude; lng = pos.coords.longitude;
          } catch { /* optional */ }
          await supabase.from("push_subscriptions").upsert(
            { user_id: session.user.id, endpoint: sub.endpoint, subscription: sub.toJSON(), lat, lng },
            { onConflict: "user_id,endpoint" }
          );
        }
      } catch { /* ignore */ }
    }
  }

  return (
    <div>
      <h2 style={{
        fontFamily: "var(--font-display)",
        fontSize: 30, fontWeight: 900, lineHeight: 1.1,
        letterSpacing: "-0.02em", margin: "0 0 8px",
      }}>
        אל תחמיץ שנייה
      </h2>
      <p style={{ fontSize: 14, color: "var(--muted)", fontWeight: 500, margin: "0 0 20px" }}>
        נעדכן אותך כשחפץ מהרשימה שלך יצא לרחוב — לפני כולם.
      </p>

      {/* notification preview */}
      <div style={{
        background: "var(--surface)", borderRadius: 16,
        border: "2px solid var(--ink)", boxShadow: "4px 4px 0 var(--shadow-ink)",
        padding: "14px 16px", marginBottom: 16,
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 6,
              background: "var(--primary)", border: "1.5px solid var(--ink)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12,
            }}>🌿</div>
            <span style={{ fontWeight: 800, fontSize: 12 }}>GreenHOOD</span>
          </div>
          <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>עכשיו</span>
        </div>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 3, direction: "rtl" }}>
          מונסטרה גדולה – 80 מ׳ ממך!
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500, direction: "rtl" }}>
          מישהו הוציא לרחוב הרצל. מהר לפני כולם 🏃
        </div>
      </div>

      {/* permission card */}
      <div style={{
        background: "var(--warning-tint)", borderRadius: 16,
        border: "2px solid var(--ink)", boxShadow: "3px 3px 0 var(--shadow-ink)",
        padding: 16, marginBottom: 12,
      }}>
        <div style={{ display: "flex", gap: 12, alignItems: "start", marginBottom: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: "#E8A020", border: "2px solid var(--ink)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, flexShrink: 0,
          }}>🔔</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 3 }}>התראות Push</div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.5, fontWeight: 500 }}>
              רק על חפצים בסביבה קרובה. בלי ספאם.
            </div>
          </div>
        </div>
        <button
          onClick={requestPush}
          style={{
            width: "100%", height: 48,
            background: pushGranted ? "var(--primary-light)" : "var(--primary)",
            color: "var(--ink)",
            border: "2px solid var(--ink)", borderRadius: "var(--r-md)",
            fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 15,
            cursor: "pointer", boxShadow: "var(--sh-md)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {pushGranted ? "✅ התראות אופשרו" : "אפשר התראות 🔔"}
        </button>
      </div>

      <button
        onClick={() => setPushGranted(true)}
        style={{
          width: "100%", padding: "12px",
          background: "transparent", border: "1.5px dashed var(--ink)",
          borderRadius: 12, cursor: "pointer",
          fontFamily: "var(--font-sans)", fontSize: 13,
          fontWeight: 600, color: "var(--ink-soft)",
        }}
      >
        אולי אחר כך
      </button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Step 2 – Location
────────────────────────────────────────────────────────── */
function StepLocation({
  locGranted, setLocGranted,
}: {
  locGranted: boolean; setLocGranted: (v: boolean) => void;
}) {
  function requestLocation() {
    if (!navigator.geolocation) { setLocGranted(true); return; }
    navigator.geolocation.getCurrentPosition(
      () => setLocGranted(true),
      () => setLocGranted(true), // allow skip on deny
    );
  }

  return (
    <div>
      <h2 style={{
        fontFamily: "var(--font-display)",
        fontSize: 30, fontWeight: 900, lineHeight: 1.1,
        letterSpacing: "-0.02em", margin: "0 0 8px",
      }}>
        איפה אתה/את?
      </h2>
      <p style={{ fontSize: 14, color: "var(--muted)", fontWeight: 500, margin: "0 0 20px" }}>
        כדי להציג מציאות קרובות. לא נשמור ללא רשות.
      </p>

      {/* Mini map preview */}
      <div style={{
        height: 190,
        background: "var(--paper-2)",
        borderRadius: 16,
        border: "2px solid var(--ink)",
        boxShadow: "4px 4px 0 var(--shadow-ink)",
        overflow: "hidden",
        marginBottom: 20,
        position: "relative",
      }}>
        {/* grid */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `
            linear-gradient(rgba(45,42,36,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(45,42,36,0.06) 1px, transparent 1px)
          `,
          backgroundSize: "28px 28px",
        }} />
        <svg width="100%" height="100%" viewBox="0 0 380 190" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0 }}>
          <g stroke="var(--paper)" strokeWidth="14" fill="none" strokeLinecap="round">
            <path d="M-10,70 Q120,65 200,80 T390,75" />
            <path d="M130,-10 Q135,90 125,200" />
            <path d="M260,-10 Q255,95 265,200" />
          </g>
          <g stroke="var(--ink)" strokeWidth="1" fill="none" opacity="0.4">
            <path d="M-10,70 Q120,65 200,80 T390,75" />
            <path d="M130,-10 Q135,90 125,200" />
            <path d="M260,-10 Q255,95 265,200" />
          </g>
          <rect x="20" y="15" width="65" height="40" rx="8" fill="var(--primary-tint)" stroke="var(--ink)" strokeWidth="1.5" />
          <rect x="158" y="100" width="55" height="50" rx="8" fill="var(--surface)" stroke="var(--ink)" strokeWidth="1.5" />
        </svg>

        {/* pins */}
        <div style={{ position: "absolute", top: 75, right: 95, fontSize: 22 }}>📍</div>
        <div style={{ position: "absolute", top: 50, right: 180, fontSize: 18 }}>📦</div>

        {/* me dot */}
        {locGranted && (
          <div style={{
            position: "absolute", top: 115, right: 155,
            width: 14, height: 14, borderRadius: "50%",
            background: "var(--info)", border: "2.5px solid var(--ink)",
            boxShadow: "0 0 0 3px white",
          }} />
        )}

        {/* label */}
        <div style={{
          position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)",
          background: "var(--surface)", borderRadius: 999,
          border: "1.5px solid var(--ink)",
          padding: "6px 14px",
          fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
        }}>
          {locGranted ? "✅ מיקום הופעל" : "📍 לחץ/י כדי להפעיל"}
        </div>
      </div>

      {/* permission card */}
      <div style={{
        background: "var(--primary-tint)", borderRadius: 16,
        border: "2px solid var(--ink)", boxShadow: "3px 3px 0 var(--shadow-ink)",
        padding: 16, marginBottom: 12,
      }}>
        <div style={{ display: "flex", gap: 12, alignItems: "start", marginBottom: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: "var(--primary)", border: "2px solid var(--ink)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, flexShrink: 0,
          }}>📍</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 3 }}>גישה למיקום</div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.5, fontWeight: 500 }}>
              כדי להציג מציאות בקרבתך ולנווט אליהן. תמיד ניתן לבטל.
            </div>
          </div>
        </div>
        <button
          onClick={requestLocation}
          style={{
            width: "100%", height: 48,
            background: locGranted ? "var(--primary-light)" : "var(--primary)",
            color: "var(--ink)",
            border: "2px solid var(--ink)",
            borderRadius: "var(--r-md)",
            fontFamily: "var(--font-sans)",
            fontWeight: 700, fontSize: 15,
            cursor: "pointer",
            boxShadow: "var(--sh-md)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {locGranted ? "✅ מיקום אושר" : "📍 אפשר מיקום"}
        </button>
      </div>

      <button
        onClick={() => setLocGranted(true)}
        style={{
          width: "100%", padding: "12px",
          background: "transparent",
          border: "1.5px dashed var(--ink)",
          borderRadius: 12,
          cursor: "pointer", fontFamily: "var(--font-sans)",
          fontSize: 13, fontWeight: 600, color: "var(--ink-soft)",
        }}
      >
        אדאג לזה אחר כך
      </button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Main onboarding page
────────────────────────────────────────────────────────── */
export default function WelcomePage() {
  const router = useRouter();
  const [guardDone, setGuardDone] = useState(false);
  const [step, setStep]           = useState(0);
  const [personas, setPersonas]   = useState<Persona[]>([]);
  const [locGranted, setLocGranted] = useState(false);
  const [pushGranted, setPushGranted] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /* Guard: skip onboarding if already done, redirect to login if not authed */
  useEffect(() => {
    async function guard() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const { data: profile } = await supabase
        .from("profiles").select("onboarded").eq("id", user.id).single();
      if (profile?.onboarded) { router.replace("/map"); return; }
      setGuardDone(true);
    }
    guard();
  }, [router]);

  const TOTAL = 4;

  async function finish() {
    setSaving(true);
    setSaveError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      await supabase.auth.signOut();
      router.replace("/login");
      return;
    }
    const { error } = await supabase.from("profiles").upsert({
      id: session.user.id,
      personas,
      onboarded: true,
    }, { onConflict: "id" });
    if (error) {
      setSaveError(error.message);
      setSaving(false);
      return;
    }
    router.replace("/map");
  }

  function handleNext() {
    if (step < TOTAL - 1) { setStep(step + 1); }
    else { finish(); }
  }

  const ctaLabel =
    step === 0 ? "בוא נצא לציד ←" :
    step === 1 ? (personas.length > 0 ? `המשך עם ${personas.length} בחירות ←` : "המשך ←") :
    step === 2 ? "המשך ←" :
    saving ? "שומר…" : "סיים והיכנס ✓";

  if (!guardDone) return (
    <div style={{
      minHeight: "100dvh", background: "var(--paper)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: 16, fontFamily: "var(--font-sans)",
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        background: "var(--primary)", border: "2px solid var(--ink)",
        boxShadow: "3px 3px 0 var(--shadow-ink)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 28, animation: "floatY 1.4s ease-in-out infinite",
      }}>🌿</div>
      <p style={{ color: "var(--muted)", fontWeight: 600, fontSize: 15 }}>טוען…</p>
    </div>
  );

  return (
    <div style={{
      minHeight: "100dvh",
      background: "var(--paper)",
      display: "flex",
      flexDirection: "column",
      fontFamily: "var(--font-sans)",
      maxWidth: 480,
      margin: "0 auto",
      padding: "0 0 env(safe-area-inset-bottom)",
    }}>
      {/* header */}
      <div style={{
        padding: "20px 20px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        {step > 0 ? (
          <button
            onClick={() => setStep(step - 1)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--ink)", fontWeight: 700, fontSize: 14,
              fontFamily: "var(--font-sans)", padding: 0,
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            → חזור
          </button>
        ) : <div style={{ width: 60 }} />}

        <ProgressDots step={step} total={TOTAL} />

        <button
          onClick={finish}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--muted)", fontWeight: 500, fontSize: 14,
            fontFamily: "var(--font-sans)", padding: 0,
          }}
        >
          דלג
        </button>
      </div>

      {/* content */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "0 20px",
        display: "flex",
        flexDirection: "column",
      }}>
        {step === 0 && <StepWelcome />}
        {step === 1 && <StepPersona personas={personas} setPersonas={setPersonas} />}
        {step === 2 && <StepLocation locGranted={locGranted} setLocGranted={setLocGranted} />}
        {step === 3 && <StepPush pushGranted={pushGranted} setPushGranted={setPushGranted} />}
      </div>

      {/* CTA */}
      <div style={{
        padding: "16px 20px 32px",
        background: "var(--surface)",
        flexShrink: 0,
      }}>
        {saveError && (
          <div style={{
            marginBottom: 12,
            padding: "10px 14px",
            background: "var(--paper-2)",
            border: "1.5px solid var(--ink)",
            borderRadius: 10,
            fontSize: 12, color: "var(--ink-soft)",
            fontWeight: 500, lineHeight: 1.5,
            wordBreak: "break-all",
          }}>
            שגיאה: {saveError}
          </div>
        )}
        <button
          onClick={handleNext}
          disabled={saving}
          style={{
            width: "100%", height: 56,
            background: saving ? "var(--primary-tint)" : "var(--primary)",
            color: "var(--ink)",
            border: "2px solid var(--ink)",
            borderRadius: "var(--r-md)",
            fontFamily: "var(--font-sans)",
            fontWeight: 700, fontSize: 17,
            cursor: saving ? "not-allowed" : "pointer",
            boxShadow: "var(--sh-md)",
            transition: "transform 120ms, box-shadow 120ms",
          }}
          onMouseDown={e => { if (!saving) { e.currentTarget.style.transform = "translate(2px,2px)"; e.currentTarget.style.boxShadow = "none"; }}}
          onMouseUp={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "var(--sh-md)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "var(--sh-md)"; }}
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
