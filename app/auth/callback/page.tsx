"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Suspense } from "react";

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function handleCallback() {
      // Check for error in URL params (e.g. provider not enabled, user denied)
      const error = searchParams.get("error");
      const errorDescription = searchParams.get("error_description");

      if (error) {
        setErrorMsg(errorDescription ?? error);
        return;
      }

      // PKCE flow — exchange the code for a session
      const code = searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setErrorMsg(exchangeError.message);
          return;
        }
      }

      // Check session and route accordingly
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setErrorMsg("לא הצלחנו לאמת את הכניסה. נסה שוב.");
        return;
      }

      // Check onboarding status
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarded")
        .eq("id", session.user.id)
        .single();

      if (profile?.onboarded) {
        router.replace("/map");
      } else {
        router.replace("/welcome");
      }
    }

    handleCallback();
  }, [router, searchParams]);

  if (errorMsg) {
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
        padding: "0 24px",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 48 }}>😕</div>
        <div style={{
          fontFamily: "var(--font-display)",
          fontWeight: 900, fontSize: 20,
        }}>הכניסה נכשלה</div>
        <div style={{
          fontSize: 14, color: "var(--muted)",
          fontWeight: 500, maxWidth: 300, lineHeight: 1.5,
        }}>{errorMsg}</div>
        <button
          onClick={() => router.replace("/login")}
          style={{
            marginTop: 8,
            padding: "12px 28px",
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
        animation: "floatY 1.4s ease-in-out infinite",
      }}>🌿</div>
      <p style={{ color: "var(--muted)", fontWeight: 600, fontSize: 15 }}>מתחבר…</p>
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: "100dvh", background: "var(--paper)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ fontSize: 32 }}>🌿</div>
      </div>
    }>
      <AuthCallbackInner />
    </Suspense>
  );
}
