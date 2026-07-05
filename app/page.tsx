"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

/* ──────────────────────────────────────────────────────────
   Root page — auth guard
   • Not logged in  → /login
   • Logged in, not onboarded → /welcome
   • Logged in + onboarded → /map
────────────────────────────────────────────────────────── */
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    async function check() {
      /* Validate the JWT server-side — getSession() reads localStorage and
         can return a stale session whose JWT is expired or from a partial
         OAuth flow. getUser() hits /auth/v1/user and rejects invalid tokens. */
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        await supabase.auth.signOut(); // clear any stale localStorage
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarded")
        .eq("id", user.id)
        .single();

      router.replace(profile?.onboarded ? "/map" : "/welcome");
    }
    check();
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
      }}>🌿</div>
      <p style={{ color: "var(--muted)", fontWeight: 600, fontSize: 15, margin: 0 }}>
        טוען…
      </p>
    </div>
  );
}
