"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, getCurrentUser, signOut } from "@/lib/supabase";

const ADMIN_EMAIL = "yotamico@gmail.com";

type Tab = "overview" | "moderation" | "items" | "users";

interface Profile {
  id: string;
  name: string | null;
  avatar_color: string | null;
  xp: number | null;
  created_at: string;
}

interface Item {
  id: string;
  title: string;
  category: string | null;
  condition: string | null;
  address: string;
  status: string;
  moderation_status: "pending" | "approved" | "rejected";
  created_at: string;
  reporter_id: string;
  item_images: { url: string; is_primary: boolean }[];
}

function timeAgo(iso: string): string {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1)  return "פחות משעה";
  if (h < 24) return `לפני ${h} ש'`;
  return `לפני ${Math.floor(h / 24)} ימים`;
}

const MODERATION_LABEL: Record<Item["moderation_status"], string> = {
  pending:  "⏳ ממתין",
  approved: "✅ אושר",
  rejected: "❌ נדחה",
};

export default function AdminPage() {
  const router = useRouter();
  const [ready,    setReady]    = useState(false);
  const [tab,      setTab]      = useState<Tab>("overview");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [items,    setItems]    = useState<Item[]>([]);

  useEffect(() => {
    getCurrentUser().then(user => {
      if (!user || user.email !== ADMIN_EMAIL) {
        router.replace("/");
        return;
      }
      setReady(true);
      loadAll();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    const [{ data: p }, { data: i }] = await Promise.all([
      supabase.from("profiles").select("id,name,avatar_color,xp,created_at").order("created_at", { ascending: false }),
      supabase.from("items")
        .select("id,title,category,condition,address,status,moderation_status,created_at,reporter_id,item_images(url,is_primary)")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    setProfiles((p ?? []) as Profile[]);
    setItems((i ?? []) as unknown as Item[]);
  }

  async function moderate(id: string, decision: "approved" | "rejected") {
    const reason = decision === "rejected" ? window.prompt("סיבת דחייה (יוצג למדווח):") : null;
    if (decision === "rejected" && reason === null) return; // cancelled
    await supabase.from("items").update({
      moderation_status: decision,
      moderation_reason: decision === "rejected" ? reason : null,
    }).eq("id", id);
    setItems(prev => prev.map(it => it.id === id ? { ...it, moderation_status: decision } : it));
  }

  if (!ready) {
    return (
      <div style={{ minHeight: "100dvh", background: "#0f1117", display: "flex",
        alignItems: "center", justifyContent: "center", color: "#7880a0",
        fontFamily: "'Heebo', sans-serif", fontSize: 16 }}>
        טוען...
      </div>
    );
  }

  const pending      = items.filter(i => i.moderation_status === "pending");
  const activeCount  = items.filter(i => i.status === "active" && i.moderation_status === "approved").length;
  const todayItems   = items.filter(i => new Date(i.created_at).toDateString() === new Date().toDateString()).length;

  const itemsByUser: Record<string, number> = {};
  items.forEach(i => { itemsByUser[i.reporter_id] = (itemsByUser[i.reporter_id] ?? 0) + 1; });

  return (
    <div style={s.root} dir="rtl">
      {/* header */}
      <div style={s.header}>
        <span style={s.headerTitle}>🛠 דשבורד ניהול</span>
        <button style={s.logoutBtn} onClick={async () => { await signOut(); router.replace("/login"); }}>
          יציאה
        </button>
      </div>

      {/* tabs */}
      <div style={s.tabBar}>
        {(["overview", "moderation", "items", "users"] as Tab[]).map(t => (
          <button
            key={t}
            style={{ ...s.tabBtn, ...(tab === t ? s.tabBtnActive : {}) }}
            onClick={() => setTab(t)}
          >
            {{ overview: "סקירה", moderation: `מודרציה${pending.length ? ` (${pending.length})` : ""}`, items: "פריטים", users: "משתמשים" }[t]}
          </button>
        ))}
      </div>

      <div style={s.body}>

        {/* ── סקירה ── */}
        {tab === "overview" && (
          <div style={s.grid}>
            <StatCard emoji="👥" label="משתמשים רשומים" value={profiles.length} />
            <StatCard emoji="📦" label="דיווחים היום"     value={todayItems} />
            <StatCard emoji="✅" label="פריטים פעילים"    value={activeCount} />
            <StatCard emoji="⏳" label="ממתינים למודרציה" value={pending.length} />

            <div style={{ ...s.card, gridColumn: "1 / -1" }}>
              <p style={s.cardTitle}>דיווחים אחרונים</p>
              {items.length === 0 && <p style={s.empty}>אין דיווחים עדיין</p>}
              {items.slice(0, 8).map(i => (
                <div key={i.id} style={s.logRow}>
                  <span style={s.logAction}>{MODERATION_LABEL[i.moderation_status]}</span>
                  <span style={s.logEmail}>{i.title}</span>
                  <span style={s.logTime}>{timeAgo(i.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── מודרציה ── */}
        {tab === "moderation" && (
          <div style={s.list}>
            {pending.length === 0 && <p style={s.empty}>אין פריטים הממתינים למודרציה 🎉</p>}
            {pending.map(i => {
              const img = i.item_images?.find(im => im.is_primary) ?? i.item_images?.[0];
              return (
                <div key={i.id} style={s.card}>
                  <div style={s.modRow}>
                    {img && <img src={img.url} alt="" style={s.modThumb} />}
                    <div style={{ flex: 1 }}>
                      <p style={s.reportType}>{i.title}{i.category ? ` · ${i.category}` : ""}</p>
                      <p style={s.reportStreet}>{i.address}</p>
                      <p style={s.reportMeta}>{timeAgo(i.created_at)}</p>
                    </div>
                  </div>
                  <div style={s.modActions}>
                    <button style={s.approveBtn} onClick={() => moderate(i.id, "approved")}>✅ אשר</button>
                    <button style={s.rejectBtn} onClick={() => moderate(i.id, "rejected")}>❌ דחה</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── פריטים ── */}
        {tab === "items" && (
          <div style={s.list}>
            {items.length === 0 && <p style={s.empty}>אין פריטים עדיין</p>}
            {items.map(i => (
              <div key={i.id} style={s.card} onClick={() => router.push(`/items/${i.id}`)}>
                <p style={s.reportType}>{i.title}{i.category ? ` · ${i.category}` : ""}</p>
                <p style={s.reportStreet}>{i.address}</p>
                <p style={s.reportMeta}>
                  {MODERATION_LABEL[i.moderation_status]} · {i.status} · {timeAgo(i.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── משתמשים ── */}
        {tab === "users" && (
          <div style={s.list}>
            {profiles.length === 0 && <p style={s.empty}>אין משתמשים עדיין</p>}
            {profiles.map(u => (
              <div key={u.id} style={s.card}>
                <div style={s.userRow}>
                  <div style={{ ...s.avatar, background: u.avatar_color ?? "#1a73e8" }}>
                    {(u.name ?? "?")[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={s.userEmail}>{u.name ?? "ללא שם"}</p>
                    <p style={s.userMeta}>נרשם {timeAgo(u.created_at)} · {u.xp ?? 0} XP</p>
                  </div>
                  <div style={s.userStats}>
                    <span style={s.statBadge}>📦 {itemsByUser[u.id] ?? 0}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

function StatCard({ emoji, label, value }: { emoji: string; label: string; value: number }) {
  return (
    <div style={s.card}>
      <span style={{ fontSize: 28 }}>{emoji}</span>
      <span style={s.statValue}>{value}</span>
      <span style={s.statLabel}>{label}</span>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100dvh",
    background: "#0f1117",
    fontFamily: "'Heebo', sans-serif",
    color: "#e8eaf2",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    background: "#1a1d27",
    borderBottom: "1px solid #2e3348",
    flexShrink: 0,
  },
  headerTitle: { fontSize: 18, fontWeight: 900 },
  logoutBtn: {
    background: "none",
    border: "1px solid #2e3348",
    color: "#7880a0",
    borderRadius: 8,
    padding: "5px 12px",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "'Heebo', sans-serif",
  },
  tabBar: {
    display: "flex",
    background: "#1a1d27",
    borderBottom: "1px solid #2e3348",
    flexShrink: 0,
  },
  tabBtn: {
    flex: 1,
    padding: "11px 0",
    background: "none",
    border: "none",
    color: "#7880a0",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Heebo', sans-serif",
    borderBottom: "2px solid transparent",
    transition: "all 0.15s",
  },
  tabBtnActive: {
    color: "#1a73e8",
    borderBottomColor: "#1a73e8",
  },
  body: {
    flex: 1,
    overflowY: "auto",
    padding: 16,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 12,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  card: {
    background: "#1a1d27",
    border: "1px solid #2e3348",
    borderRadius: 14,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    cursor: "default",
  },
  modRow: { display: "flex", alignItems: "center", gap: 12 },
  modThumb: { width: 56, height: 56, borderRadius: 10, objectFit: "cover", flexShrink: 0 },
  modActions: { display: "flex", gap: 8, marginTop: 4 },
  approveBtn: {
    flex: 1, background: "#1f4d2e", color: "#7cf59a", border: "1px solid #2e6b41",
    borderRadius: 8, padding: "8px 0", fontSize: 13, fontWeight: 700, cursor: "pointer",
    fontFamily: "'Heebo', sans-serif",
  },
  rejectBtn: {
    flex: 1, background: "#4d1f1f", color: "#f59c9c", border: "1px solid #6b2e2e",
    borderRadius: 8, padding: "8px 0", fontSize: 13, fontWeight: 700, cursor: "pointer",
    fontFamily: "'Heebo', sans-serif",
  },
  cardTitle: { fontSize: 14, fontWeight: 700, color: "#b0b8d4", margin: "0 0 8px" },
  statValue: { fontSize: 32, fontWeight: 900, color: "#e8eaf2", lineHeight: 1 },
  statLabel: { fontSize: 12, color: "#7880a0" },
  logRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 0",
    borderBottom: "1px solid #2e3348",
  },
  logAction: { fontSize: 13, fontWeight: 600, color: "#e8eaf2", flexShrink: 0, minWidth: 80 },
  logEmail:  { fontSize: 12, color: "#7880a0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  logTime:   { fontSize: 11, color: "#4a5070", flexShrink: 0 },
  empty:     { color: "#7880a0", textAlign: "center", padding: 40, fontSize: 15 },
  userRow:   { display: "flex", alignItems: "center", gap: 12 },
  avatar: {
    width: 40, height: 40, borderRadius: "50%",
    color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 16, fontWeight: 800, flexShrink: 0,
  },
  userEmail: { fontSize: 14, fontWeight: 700, color: "#e8eaf2", margin: 0 },
  userMeta:  { fontSize: 12, color: "#7880a0", margin: "3px 0 0" },
  userStats: { display: "flex", gap: 6 },
  statBadge: {
    background: "#22263a",
    border: "1px solid #2e3348",
    borderRadius: 6,
    padding: "3px 8px",
    fontSize: 12,
    color: "#b0b8d4",
  },
  reportType:   { fontSize: 15, fontWeight: 700, color: "#e8eaf2", margin: 0 },
  reportStreet: { fontSize: 13, color: "#b0b8d4", margin: 0 },
  reportMeta:   { fontSize: 12, color: "#7880a0", margin: 0 },
};
