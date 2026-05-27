"use client";

import { useRouter, usePathname } from "next/navigation";

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
            }}>
              {tab.icon(active)}
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
