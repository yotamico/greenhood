"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace("/welcome");
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/welcome");
    });

    return () => subscription.unsubscribe();
  }, [router]);

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
