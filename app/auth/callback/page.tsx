"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallback() {
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // Error in query string (e.g. provider disabled)
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get("error");
    if (urlError) {
      setErrorMsg(params.get("error_description") ?? urlError);
      return;
    }

    async function redirect(userId: string) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarded")
        .eq("id", userId)
        .single();
      router.replace(profile?.onboarded ? "/map" : "/welcome");
    }

    // ── Implicit flow: token arrives in URL hash (#access_token=…) ──
    // Supabase SDK auto-detects the hash and fires SIGNED_IN.
    // Listen first, then also check for an existing session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session) {
          subscription.unsubscribe();
          clearTimeout(timer);
          await redirect(session.user.id);
        }
      }
    );

    // ── PKCE flow: code arrives as query param ──
    const code = params.get("code");
    if (code) {
      supabase.auth.exchangeCodeForSession(code)
        .then(({ error }) => { if (error) setErrorMsg(error.message); })
        .catch(() => {});
    }

    // ── Already have a session (e.g. page refresh) ──
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        subscription.unsubscribe();
        clearTimeout(timer);
        redirect(session.user.id);
      }
    });

    // ── Timeout: if nothing resolves in 12 s show error ──
    const timer = setTimeout(() => {
      subscription.unsubscribe();
      setErrorMsg("הכניסה פגה תוקף. נסה שוב.");
    }, 12000);

    return () => { subscription.unsubscribe(); clearTimeout(timer); };
  }, [router]);

  if (errorMsg) {
    return (
      <div style={{
        minHeight: "100dvh", background: "var(--paper)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 16,
        fontFamily: "var(--font-sans)", padding: "0 24px", textAlign: "center",
      }}>
        <div style={{ fontSize: 48 }}>😕</div>
        <div style={{
          fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 20,
        }}>הכניסה נכשלה</div>
        <div style={{
          fontSize: 14, color: "var(--muted)",
          fontWeight: 500, maxWidth: 300, lineHeight: 1.5,
        }}>{errorMsg}</div>
        <button
          onClick={() => router.replace("/login")}
          style={{
            marginTop: 8, padding: "12px 28px",
            background: "var(--ink)", color: "var(--paper)",
            border: "2px solid var(--ink)", borderRadius: 14,
            fontFamily: "var(--font-sans)", fontWeight: 800,
            fontSize: 15, cursor: "pointer",
            boxShadow: "3px 3px 0 var(--primary)",
          }}
        >← חזרה לכניסה</button>
      </div>
    );
  }

  return (
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
      <p style={{ color: "var(--muted)", fontWeight: 600, fontSize: 15 }}>מתחבר…</p>
    </div>
  );
}
