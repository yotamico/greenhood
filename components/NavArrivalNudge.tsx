"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const PROXIMITY_M = 150;
const STALE_HOURS = 3;

interface Candidate { id: string; itemId: string; title: string; lat: number; lng: number; }

function haversine([lat1, lng1]: [number,number], [lat2, lng2]: [number,number]): number {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function dismissedKey(intentId: string) {
  return `navNudgeDismissed:${intentId}`;
}

/* Nudges the user, next time they reopen the app after navigating externally (Waze/Google
   Maps), to report an item taken — a best-effort substitute for the "arrived" detection a
   website can't get in the background (see eco-navigation-live-nav memory / CLAUDE.md for
   why). Mount alongside <TabBar/> so it re-checks on every authenticated page. */
export default function NavArrivalNudge() {
  const router = useRouter();
  const [candidate, setCandidate] = useState<Candidate | null>(null);

  const check = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const cutoff = new Date(Date.now() - STALE_HOURS * 3600_000).toISOString();
    const { data: intents } = await supabase
      .from("nav_intents")
      .select("id,item_id,title,lat,lng,started_at,items(status)")
      .eq("user_id", session.user.id)
      .gte("started_at", cutoff)
      .order("started_at", { ascending: false })
      .limit(5);
    if (!intents?.length) return;

    const active = intents.find(i => {
      const item = i.items as unknown as { status: string } | { status: string }[] | null;
      const status = Array.isArray(item) ? item[0]?.status : item?.status;
      return status === "active" && !localStorage.getItem(dismissedKey(i.id));
    });
    if (!active) return;

    navigator.geolocation.getCurrentPosition(
      pos => {
        const dist = haversine([pos.coords.latitude, pos.coords.longitude], [active.lat, active.lng]);
        if (dist <= PROXIMITY_M) {
          setCandidate({ id: active.id, itemId: active.item_id, title: active.title, lat: active.lat, lng: active.lng });
        }
      },
      () => {},
      { maximumAge: 60_000, timeout: 8000 },
    );
  }, []);

  useEffect(() => {
    check();
    function onVisible() {
      if (document.visibilityState === "visible") check();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [check]);

  const dismiss = () => {
    if (candidate) localStorage.setItem(dismissedKey(candidate.id), "1");
    setCandidate(null);
  };

  const report = () => {
    if (!candidate) return;
    localStorage.setItem(dismissedKey(candidate.id), "1");
    router.push(`/items/${candidate.itemId}`);
    setCandidate(null);
  };

  if (!candidate) return null;

  return (
    <div style={{
      position: "fixed", left: 12, right: 12, bottom: 84, zIndex: 60,
      background: "var(--ink)", color: "var(--paper)",
      border: "2px solid var(--ink)", borderRadius: 16,
      boxShadow: "var(--sh-md)", padding: "12px 14px",
      display: "flex", alignItems: "center", gap: 10, direction: "rtl",
    }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>🌿</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>נראה שהגעת ל{candidate.title}</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>לדווח שהחפץ נלקח?</div>
      </div>
      <button onClick={dismiss} style={{
        background: "transparent", border: "1.5px solid rgba(255,255,255,0.4)",
        color: "var(--paper)", borderRadius: 10, padding: "8px 10px",
        fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0,
      }}>לא עכשיו</button>
      <button onClick={report} style={{
        background: "var(--primary)", color: "var(--ink)", border: "1.5px solid var(--ink)",
        borderRadius: 10, padding: "8px 12px",
        fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0,
      }}>דווח</button>
    </div>
  );
}
