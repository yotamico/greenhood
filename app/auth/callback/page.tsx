"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let done = false;

    /* ── Error forwarded by Supabase in query string ── */
    const qp = new URLSearchParams(window.location.search);
    const qErr = qp.get("error");
    if (qErr) {
      setError(qp.get("error_description") ?? qErr);
      return;
    }

    async function go(session: Session | null) {
      if (done || !session) return;
      done = true;
      try {
        const { data: profile } = await supabase
          .from("profiles").select("onboarded").eq("id", session.user.id).single();
        router.replace(profile?.onboarded ? "/map" : "/welcome");
      } catch {
        router.replace("/map");
      }
    }

    /* SDK handles both implicit (#access_token) and PKCE (?code) automatically */
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      go(session);
    });

    /* Immediate check — covers the page-refresh case */
    supabase.auth.getSession().then(({ data: { session } }) => go(session));

    /* Explicit PKCE exchange — in case SDK doesn't pick up ?code= automatically */
    const code = qp.get("code");
    if (code) {
      supabase.auth.exchangeCodeForSession(code)
        .then(({ data, error: e }) => {
          if (e && !done) setError(e.message);
          else go(data.session);
        })
        .catch(e => { if (!done) setError(String(e?.message ?? e)); });
    }

    /* Diagnostic timeout — shows URL shape to help debug */
    const t = setTimeout(() => {
      if (!done) {
        const hashLen   = window.location.hash.length;
        const hasCode   = qp.has("code");
        const hasToken  = window.location.hash.includes("access_token");
        setError(
          `הכניסה לא הושלמה (timeout).\n` +
          `hash:${hashLen > 1 ? "yes" : "no"} access_token:${hasToken ? "yes" : "no"} code:${hasCode ? "yes" : "no"}`
        );
      }
    }, 12_000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(t);
    };
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
        <div style={{
          fontSize:13, color:"var(--muted)", fontWeight:500,
          maxWidth:320, lineHeight:1.6,
          whiteSpace:"pre-wrap", wordBreak:"break-all",
          background:"var(--paper-2)", padding:"10px 14px",
          borderRadius:10, border:"1.5px solid var(--ink)",
        }}>
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
