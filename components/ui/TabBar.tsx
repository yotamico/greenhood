"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

async function fetchHasUnread(userId: string): Promise<boolean> {
  // My items that have messages newer than my last_read_at
  const { data: myItems } = await supabase
    .from("items").select("id").eq("reporter_id", userId).eq("status", "active");
  if (!myItems?.length) return false;

  const itemIds = myItems.map(i => i.id);

  // Get last_read_at for each of my items
  const { data: reads } = await supabase
    .from("message_reads").select("item_id,last_read_at").eq("user_id", userId).in("item_id", itemIds);
  const readMap = new Map((reads ?? []).map(r => [r.item_id, r.last_read_at]));

  // Check if any item has messages newer than last_read (or no read record at all)
  for (const itemId of itemIds) {
    const lastRead = readMap.get(itemId) ?? "1970-01-01T00:00:00Z";
    const { count } = await supabase
      .from("messages").select("*", { count: "exact", head: true })
      .eq("item_id", itemId).gt("created_at", lastRead).neq("sender_id", userId);
    if ((count ?? 0) > 0) return true;
  }
  return false;
}

const TABS = [
  {
    id: "map",
    href: "/map",
    label: "מפה",
    icon: (active: boolean) => (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={active ? 2.2 : 1.7}
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z"/>
        <path d="M9 4v16M15 6v16"/>
      </svg>
    ),
  },
  {
    id: "feed",
    href: "/feed",
    label: "פיד",
    icon: (active: boolean) => (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={active ? 2.2 : 1.7}
        strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l9 5-9 5-9-5 9-5z"/>
        <path d="M3 13l9 5 9-5M3 18l9 5 9-5"/>
      </svg>
    ),
  },
  {
    id: "me",
    href: "/me",
    label: "אני",
    icon: (active: boolean) => (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={active ? 2.2 : 1.7}
        strokeLinecap="round" strokeLinejoin="round">
        <circle cx={12} cy={8} r={4}/>
        <path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>
      </svg>
    ),
  },
];

export function TabBar() {
  const router   = useRouter();
  const pathname = usePathname();
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      const userId = session.user.id;
      fetchHasUnread(userId).then(setHasUnread);

      // Silently register push subscription if permission already granted
      if (
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        Notification.permission === "granted"
      ) {
        navigator.serviceWorker.register("/sw.js").then(async reg => {
          try {
            const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
            const padding = "=".repeat((4 - (vapidKey.length % 4)) % 4);
            const raw = atob((vapidKey + padding).replace(/-/g, "+").replace(/_/g, "/"));
            const key = Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
            const sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: key as unknown as ArrayBuffer,
            });
            let lat: number | null = null, lng: number | null = null;
            try {
              const pos = await new Promise<GeolocationPosition>((res, rej) =>
                navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000 })
              );
              lat = pos.coords.latitude; lng = pos.coords.longitude;
            } catch { /* optional */ }
            await supabase.from("push_subscriptions").upsert(
              { user_id: userId, endpoint: sub.endpoint, subscription: sub.toJSON(), lat, lng },
              { onConflict: "user_id,endpoint" }
            );
          } catch { /* ignore */ }
        }).catch(() => {});
      }

      // Re-check when a new message arrives on any of my items
      channel = supabase
        .channel(`tabbar-messages-${userId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
          fetchHasUnread(userId).then(setHasUnread);
        })
        .subscribe();
    });

    return () => { if (channel) supabase.removeChannel(channel); };
  }, [pathname]); // re-check when navigating (e.g. returning from chat marks read)

  return (
    <div style={{
      position: "fixed",
      bottom: 0, left: 0, right: 0,
      height: 72,
      background: "var(--surface)",
      borderTop: "2px solid var(--ink)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-around",
      zIndex: 50,
      paddingBottom: "env(safe-area-inset-bottom)",
    }}>
      {TABS.map(tab => {
        const active = pathname.startsWith(tab.href);
        const showDot = tab.id === "me" && hasUnread;
        return (
          <button
            key={tab.id}
            onClick={() => router.push(tab.href)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "4px 20px",
              fontFamily: "var(--font-sans)",
              position: "relative",
            }}
          >
            <div style={{
              width: 44, height: 32,
              borderRadius: 999,
              background: active ? "var(--primary)" : "transparent",
              border: active ? "2px solid var(--ink)" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--ink)",
              transition: "background 200ms",
              position: "relative",
            }}>
              {tab.icon(active)}
              {showDot && (
                <div style={{
                  position: "absolute", top: -2, right: -2,
                  width: 9, height: 9, borderRadius: "50%",
                  background: "#E53E3E",
                  border: "2px solid var(--surface)",
                }}/>
              )}
            </div>
            <span style={{
              fontSize: 11,
              fontWeight: active ? 800 : 600,
              color: active ? "var(--ink)" : "var(--muted)",
            }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
