"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallback() {
  const router  = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handle() {
      /* ── 1. Error from Supabase in query string ── */
      const qp = new URLSearchParams(window.location.search);
      const qErr = qp.get("error");
      if (qErr) {
        setError(qp.get("error_description") ?? qErr);
        return;
      }

      /* ── 2. Implicit flow — token arrives in URL hash ── */
      const hash = window.location.hash.replace(/^#/, "");
      if (hash) {
        const hp = new URLSearchParams(hash);
        const accessToken  = hp.get("access_token");
        const refreshToken = hp.get("refresh_token");

        if (accessToken && refreshToken) {
          const { data, error: sessErr } = await supabase.auth.setSession({
            access_token:  accessToken,
            refresh_token: refreshToken,
          });
          if (sessErr) { setError(sessErr.message); return; }
          if (data.session) { await redirect(data.session.user.id); return; }
        }
      }

      /* ── 3. PKCE flow — code arrives in query string ── */
      const code = qp.get("code");
      if (code) {
        const { data, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exErr) { setError(exErr.message); return; }
        if (data.session) { await redirect(data.session.user.id); return; }
      }

      /* ── 4. Already have a session (page refresh) ── */
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { await redirect(session.user.id); return; }

      setError("לא הצלחנו לאמת את הכניסה. נסה שוב.");
    }

    async function redirect(userId: string) {
      const { data: profile } = await supabase
        .from("profiles").select("onboarded").eq("id", userId).single();
      router.replace(profile?.onboarded ? "/map" : "/welcome");
    }

    handle();
  }, [router]);

  if (error) {
    return (
      <div style={{
        minHeight:"100dvh", background:"var(--paper)",
        display:"flex", alignItems:"center", justifyContent:"center",
        flexDirection:"column", gap:16,
        fontFamily:"var(--font-sans)", padding:"0 24px", textAlign:"center",
      }}>
        <div style={{fontSize:48}}>😕</div>
        <div style={{fontFamily:"var(--font-display)",fontWeight:900,fontSize:20}}>הכניסה נכשלה</div>
        <div style={{fontSize:14,color:"var(--muted)",fontWeight:500,maxWidth:300,lineHeight:1.5}}>
          {error}
        </div>
        <button
          onClick={() => router.replace("/login")}
          style={{
            marginTop:8, padding:"12px 28px",
            background:"var(--ink)", color:"var(--paper)",
            border:"2px solid var(--ink)", borderRadius:14,
            fontFamily:"var(--font-sans)", fontWeight:800,
            fontSize:15, cursor:"pointer",
            boxShadow:"3px 3px 0 var(--primary)",
          }}
        >← חזרה לכניסה</button>
      </div>
    );
  }

  return (
    <div style={{
      minHeight:"100dvh", background:"var(--paper)",
      display:"flex", alignItems:"center", justifyContent:"center",
      flexDirection:"column", gap:16, fontFamily:"var(--font-sans)",
    }}>
      <div style={{
        width:56, height:56, borderRadius:"50%",
        background:"var(--primary)", border:"2px solid var(--ink)",
        boxShadow:"3px 3px 0 var(--shadow-ink)",
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:28, animation:"floatY 1.4s ease-in-out infinite",
      }}>🌿</div>
      <p style={{color:"var(--muted)",fontWeight:600,fontSize:15}}>מתחבר…</p>
    </div>
  );
}
