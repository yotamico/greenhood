"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/* ──────────────────────────────────────────────────────────
   Root page — auth guard
   • Not logged in  → /login
   • Logged in, not onboarded → /welcome
   • Logged in + onboarded → /map  (coming soon — shows placeholder)
────────────────────────────────────────────────────────── */
export default function RootPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function check() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      // Check onboarding status
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarded")
        .eq("id", session.user.id)
        .single();

      if (!profile?.onboarded) {
        router.replace("/welcome");
      } else {
        router.replace("/map"); // fully onboarded → map home
      }
    }
    check();
  }, [router]);

  if (checking) {
    return (
      <div style={{
        minHeight: "100dvh",
        background: "var(--paper)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 16,
        fontFamily: "var(--font-sans)",
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "var(--primary)",
          border: "2px solid var(--ink)",
          boxShadow: "3px 3px 0 var(--shadow-ink)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28,
        }}>🌿</div>
        <p style={{ color: "var(--muted)", fontWeight: 600, fontSize: 15, margin: 0 }}>
          טוען…
        </p>
      </div>
    );
  }

  // Map placeholder — will be replaced with the full map screen
  return (
    <div style={{
      minHeight: "100dvh",
      background: "var(--paper)",
      display: "flex",
      flexDirection: "column",
      fontFamily: "var(--font-sans)",
    }}>
      <div style={{
        padding: "20px 20px 12px",
        borderBottom: "2px solid var(--ink)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "var(--surface)",
      }}>
        <span style={{
          fontFamily: "var(--font-display)",
          fontSize: 28, fontWeight: 900,
          letterSpacing: "-0.035em",
          color: "var(--ink)",
        }}>
          Green<span style={{ color: "var(--primary-dark)" }}>HOOD</span>
        </span>
        <button
          onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}
          style={{
            background: "var(--paper-2)",
            border: "1.5px solid var(--ink)",
            borderRadius: "var(--r-md)",
            padding: "8px 16px",
            fontWeight: 700, fontSize: 13,
            cursor: "pointer", fontFamily: "var(--font-sans)",
            boxShadow: "var(--sh-sm)",
          }}
        >
          יציאה
        </button>
      </div>

      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 40,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 64 }}>🗺️</div>
        <h2 style={{
          fontFamily: "var(--font-display)",
          fontSize: 28, fontWeight: 900,
          letterSpacing: "-0.02em",
          margin: 0,
        }}>
          מפה בבנייה
        </h2>
        <p style={{ color: "var(--muted)", fontSize: 15, fontWeight: 500, maxWidth: 280, lineHeight: 1.55 }}>
          מסך המפה הראשי מגיע בקרוב. ה-auth וה-onboarding עובדים!
        </p>
        <div style={{
          display: "inline-flex",
          gap: 8,
          padding: "10px 18px",
          background: "var(--primary-tint)",
          border: "2px solid var(--ink)",
          borderRadius: "var(--r-md)",
          boxShadow: "var(--sh-md)",
          fontSize: 13, fontWeight: 700,
        }}>
          ✅ Auth • ✅ Onboarding • 🔜 Map
        </div>
      </div>
    </div>
  );
}
