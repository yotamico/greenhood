"use client";

import { useEffect, useState } from "react";
import SponsoredCard from "@/components/SponsoredCard";
import { getAdsPersonalized, setAdsPersonalized } from "@/lib/ads";

// Profile-page block: offers from local businesses based on items the user collected in the
// last 30 days, plus the opt-out switch for personalized ads (stored in ad_preferences).
export default function AdsForYou({ userId }: { userId: string }) {
  const [personalized, setPersonalized] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { getAdsPersonalized(userId).then(setPersonalized); }, [userId]);

  async function toggle() {
    if (personalized == null || saving) return;
    const next = !personalized;
    setSaving(true);
    const { error } = await setAdsPersonalized(userId, next);
    setSaving(false);
    if (!error) setPersonalized(next);
  }

  if (personalized == null) return null;

  return (
    <div style={{ padding:"16px 20px 8px", display:"flex", flexDirection:"column", gap:10 }}>
      {personalized && <SponsoredCard placement="me" limit={2} title="הצעות בשבילך" />}
      <button
        onClick={toggle}
        disabled={saving}
        role="switch"
        aria-checked={personalized}
        style={{
          display:"flex", alignItems:"center", justifyContent:"space-between", gap:10,
          padding:"10px 14px", background:"var(--surface)", border:"1.5px solid var(--line-strong)",
          borderRadius:12, cursor: saving ? "wait" : "pointer", fontFamily:"var(--font-sans)", textAlign:"right",
        }}
      >
        <span>
          <span style={{ display:"block", fontWeight:700, fontSize:13, color:"var(--ink)" }}>הצעות מעסקים לפי מה שאספתי</span>
          <span style={{ display:"block", fontSize:11, color:"var(--muted)", marginTop:2 }}>עסקים לא מקבלים שום מידע עליך, רק כמה פעמים הפרסומת הוצגה.</span>
        </span>
        <span style={{
          width:42, height:24, borderRadius:999, flexShrink:0, position:"relative",
          background: personalized ? "var(--primary)" : "var(--paper-2)", border:"1.5px solid var(--ink)",
          transition:"background 150ms",
        }}>
          <span style={{
            position:"absolute", top:2, width:17, height:17, borderRadius:"50%", background:"var(--surface)",
            border:"1.5px solid var(--ink)", transition:"right 150ms", right: personalized ? 2 : 20,
          }}/>
        </span>
      </button>
    </div>
  );
}
