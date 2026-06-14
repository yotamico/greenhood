"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
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

      {/* Map container — flex:1 fills remaining space, button floats inside */}
      <div style={{
        flex: 1, minHeight: 160,
        background: "var(--paper-2)",
        borderRadius: 16,
        border: "2px solid var(--ink)",
        boxShadow: "4px 4px 0 var(--shadow-ink)",
        overflow: "hidden",
        marginBottom: 12,
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
        {/* roads + buildings */}
        <svg width="100%" height="100%" viewBox="0 0 360 400" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0 }} aria-hidden="true">
          <g stroke="white" strokeWidth="22" fill="none" strokeLinecap="round">
            <path d="M-10,120 Q100,110 200,130 T370,120" />
            <path d="M140,-10 Q137,130 128,410" />
            <path d="M260,-10 Q263,130 266,410" />
            <path d="M-10,260 Q100,253 210,268 T370,258" />
          </g>
          <g stroke="rgba(45,42,36,0.15)" strokeWidth="1" fill="none">
            <path d="M-10,120 Q100,110 200,130 T370,120" />
            <path d="M140,-10 Q137,130 128,410" />
            <path d="M260,-10 Q263,130 266,410" />
            <path d="M-10,260 Q100,253 210,268 T370,258" />
          </g>
          <rect x="22" y="22" width="90" height="66" rx="9" fill="#DDE7CC" stroke="rgba(45,42,36,0.15)" strokeWidth="1.5" />
          <rect x="162" y="148" width="70" height="54" rx="8" fill="#F5F2E8" stroke="rgba(45,42,36,0.12)" strokeWidth="1.5" />
          <rect x="280" y="28" width="62" height="52" rx="8" fill="#DDE7CC" stroke="rgba(45,42,36,0.12)" strokeWidth="1.5" />
          <rect x="22" y="285" width="96" height="60" rx="9" fill="#DDE7CC" stroke="rgba(45,42,36,0.12)" strokeWidth="1.5" />
          <rect x="172" y="280" width="68" height="50" rx="8" fill="#F5F2E8" stroke="rgba(45,42,36,0.12)" strokeWidth="1.5" />
        </svg>

        {/* found item */}
        <div style={{ position: "absolute", top: "32%", left: "48%", fontSize: 30,
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.15))" }}>📦</div>

        {/* user location dot */}
        <div style={{ position: "absolute", top: "50%", left: "64%", transform: "translate(-50%,-50%)" }}>
          <div style={{ width: 14, height: 14, borderRadius: "50%",
            background: "#E05A45", border: "2.5px solid white",
            boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }} />
          <div style={{ position: "absolute", bottom: -7, left: "50%", transform: "translateX(-50%)",
            width: 2, height: 7, background: "#E05A45", borderRadius: 1 }} />
        </div>

        {/* address pill — above the button */}
        <div style={{
          position: "absolute", bottom: 72, left: 10, right: 10,
          textAlign: "center", fontSize: 12, color: "var(--ink)", fontWeight: 700,
          background: "var(--surface)", borderRadius: 999,
          border: "1.5px solid var(--ink)", padding: "6px 12px",
        }}>
          מחפש מיקום...
        </div>

        {/* allow button — floats inside map at bottom */}
        <div style={{ position: "absolute", bottom: 12, left: 12, right: 12 }}>
          <button
            onClick={requestLocation}
            style={{
              width: "100%", height: 48,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: locGranted ? "var(--primary-tint)" : "var(--primary)",
              color: "var(--ink)",
              border: "2px solid var(--ink)", borderRadius: 12,
              fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 15,
              cursor: "pointer", boxShadow: "3px 3px 0 var(--shadow-ink)",
            }}
          >
            {locGranted ? <>✓ גישה אושרה</> : <>📍 אפשר גישה</>}
          </button>
        </div>
      </div>

      {/* skip button — outside map */}
      <button
        onClick={() => setLocGranted(true)}
        style={{
          width: "100%", padding: "12px", marginBottom: 8,
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
function WelcomePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPreview = searchParams.get("preview") === "1";
  const [guardDone, setGuardDone] = useState(isPreview);
  const [step, setStep]           = useState(0);
  const [personas, setPersonas]   = useState<Persona[]>([]);
  const [locGranted, setLocGranted] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /* Guard: skip onboarding if already done, redirect to login if not authed.
     ?preview=1 bypasses this check for design review. */
  useEffect(() => {
    if (isPreview) return;
    async function guard() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const { data: profile } = await supabase
        .from("profiles").select("onboarded").eq("id", user.id).single();
      if (profile?.onboarded) { router.replace("/map"); return; }
      setGuardDone(true);
    }
    guard();
  }, [router, isPreview]);

  const TOTAL = 3;

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
    sessionStorage.setItem("pendingNotifRequest", "true");
    router.replace("/map");
  }

  function handleNext() {
    if (step < TOTAL - 1) { setStep(step + 1); }
    else { finish(); }
  }

  const ctaLabel =
    step === 0 ? "בוא נצא לציד ←" :
    step === 1 ? (personas.length > 0 ? `המשך עם ${personas.length} בחירות ←` : "המשך ←") :
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
      </div>

      {/* CTA */}
      <div style={{
        padding: "16px 20px 32px",
        background: "var(--paper)",
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

export default function WelcomePage() {
  return (
    <Suspense>
      <WelcomePageInner />
    </Suspense>
  );
}
