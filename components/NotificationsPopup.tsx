"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function NotificationsPopup({ visible, onClose }: Props) {
  const [granted, setGranted] = useState(false);

  async function handleAllow() {
    if (!("Notification" in window)) {
      setGranted(true);
      setTimeout(onClose, 900);
      return;
    }
    if ("serviceWorker" in navigator) {
      try { await navigator.serviceWorker.register("/sw.js"); } catch { /* ignore */ }
    }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      setGranted(true);
      try {
        const reg = await navigator.serviceWorker.ready;
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
        const padding = "=".repeat((4 - (vapidKey.length % 4)) % 4);
        const raw = atob((vapidKey + padding).replace(/-/g, "+").replace(/_/g, "/"));
        const key = Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key as unknown as ArrayBuffer,
        });
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          let lat: number | null = null, lng: number | null = null;
          try {
            const pos = await new Promise<GeolocationPosition>((res, rej) =>
              navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
            );
            lat = pos.coords.latitude; lng = pos.coords.longitude;
          } catch { /* optional */ }
          await supabase.from("push_subscriptions").upsert(
            { user_id: session.user.id, endpoint: sub.endpoint, subscription: sub.toJSON(), lat, lng },
            { onConflict: "user_id,endpoint" }
          );
        }
      } catch { /* ignore */ }
    }
    setTimeout(onClose, 900);
  }

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(45,42,36,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-sans)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 300,
          background: "var(--paper)",
          borderRadius: 22,
          border: "2px solid var(--ink)",
          padding: "28px 24px 24px",
          display: "flex", flexDirection: "column", alignItems: "center",
          position: "relative",
          boxShadow: "5px 5px 0 var(--shadow-ink)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 12, right: 12,
            width: 28, height: 28, borderRadius: "50%",
            background: "var(--paper-2)", border: "1.5px solid var(--ink)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
            color: "var(--ink)", fontFamily: "var(--font-sans)",
          }}
        >✕</button>

        {/* Icon */}
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: "var(--primary)", border: "2px solid var(--ink)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, marginBottom: 14,
          boxShadow: "3px 3px 0 var(--shadow-ink)",
        }}>🌿</div>

        {/* Title */}
        <div style={{
          fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 20,
          letterSpacing: "-0.02em", color: "var(--ink)",
          textAlign: "center", marginBottom: 6,
        }}>אל תחמיץ שנייה</div>

        {/* Subtitle */}
        <div style={{
          fontSize: 13, fontWeight: 500, color: "var(--muted)",
          textAlign: "center", lineHeight: 1.6, marginBottom: 20,
        }}>
          GreenHOOD רוצה לשלוח לך<br />התראות על חפצים קרובים
        </div>

        {/* Allow */}
        <button
          onClick={handleAllow}
          style={{
            width: "100%", height: 48,
            background: granted ? "var(--primary-tint)" : "var(--primary)",
            color: "var(--ink)", border: "2px solid var(--ink)",
            borderRadius: 12, fontFamily: "var(--font-sans)",
            fontWeight: 700, fontSize: 15, cursor: "pointer",
            boxShadow: "3px 3px 0 var(--shadow-ink)",
            marginBottom: 10,
          }}
        >
          {granted ? "התראות אופשרו ✓" : "אפשר התראות"}
        </button>

        {/* Skip */}
        <button
          onClick={onClose}
          style={{
            background: "transparent", border: "none",
            fontFamily: "var(--font-sans)", fontSize: 13,
            fontWeight: 600, color: "var(--muted)",
            cursor: "pointer", padding: "8px 0",
          }}
        >אולי אחר כך</button>
      </div>
    </div>
  );
}
