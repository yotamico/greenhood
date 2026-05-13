"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, getUserProfiles, getActivityLogs, getReports, signOut } from "@/lib/supabase";
import type { UserProfile, ActivityLog, Report } from "@/lib/supabase";

const ADMIN_EMAIL = "yotamico@gmail.com";

type Tab = "overview" | "users" | "logs" | "reports";

function timeAgo(iso: string): string {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1)  return "פחות משעה";
  if (h < 24) return `לפני ${h} ש'`;
  return `לפני ${Math.floor(h / 24)} ימים`;
}

const ACTION_LABEL: Record<string, string> = {
  login:    "🔑 כניסה",
  signup:   "✨ הרשמה",
  report:   "📦 דיווח",
  navigate: "🧭 ניווט",
};

export default function AdminPage() {
  const router = useRouter();
  const [ready,    setReady]    = useState(false);
  const [tab,      setTab]      = useState<Tab>("overview");
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [logs,     setLogs]     = useState<ActivityLog[]>([]);
  const [reports,  setReports]  = useState<Report[]>([]);

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
    const [p, l, r] = await Promise.all([getUserProfiles(), getActivityLogs(), getReports()]);
    setProfiles(p);
    setLogs(l);
    setReports(r);
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

  const uniqueUsers   = new Set(logs.map(l => l.user_email)).size;
  const todayLogins   = logs.filter(l => l.action === "login" &&
    new Date(l.created_at).toDateString() === new Date().toDateString()).length;
  const totalReports  = reports.length;
  const totalNavs     = logs.filter(l => l.action === "navigate").length;

  // reports per user
  const reportsByUser: Record<string, number> = {};
  reports.forEach(r => {
    if (r.user_email) reportsByUser[r.user_email] = (reportsByUser[r.user_email] ?? 0) + 1;
  });

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
        {(["overview", "users", "logs", "reports"] as Tab[]).map(t => (
          <button
            key={t}
            style={{ ...s.tabBtn, ...(tab === t ? s.tabBtnActive : {}) }}
            onClick={() => setTab(t)}
          >
            {{ overview: "סקירה", users: "משתמשים", logs: "פעילות", reports: "דיווחים" }[t]}
          </button>
        ))}
      </div>

      <div style={s.body}>

        {/* ── סקירה ── */}
        {tab === "overview" && (
          <div style={s.grid}>
            <StatCard emoji="👥" label="משתמשים רשומים" value={profiles.length} />
            <StatCard emoji="🔑" label="כניסות היום"     value={todayLogins} />
            <StatCard emoji="📦" label="סה״כ דיווחים"    value={totalReports} />
            <StatCard emoji="🧭" label="ניווטים"          value={totalNavs} />

            <div style={{ ...s.card, gridColumn: "1 / -1" }}>
              <p style={s.cardTitle}>כניסות אחרונות</p>
              {logs.filter(l => l.action === "login" || l.action === "signup").slice(0, 8).map(l => (
                <div key={l.id} style={s.logRow}>
                  <span style={s.logAction}>{ACTION_LABEL[l.action] ?? l.action}</span>
                  <span style={s.logEmail}>{l.user_email}</span>
                  <span style={s.logTime}>{timeAgo(l.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── משתמשים ── */}
        {tab === "users" && (
          <div style={s.list}>
            {profiles.length === 0 && <p style={s.empty}>אין משתמשים עדיין</p>}
            {profiles.map(u => (
              <div key={u.id} style={s.card}>
                <div style={s.userRow}>
                  <div style={s.avatar}>{u.email[0].toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <p style={s.userEmail}>{u.email}</p>
                    <p style={s.userMeta}>נרשם {timeAgo(u.created_at)}</p>
                  </div>
                  <div style={s.userStats}>
                    <span style={s.statBadge}>📦 {reportsByUser[u.email] ?? 0}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── לוג פעילות ── */}
        {tab === "logs" && (
          <div style={s.list}>
            {logs.length === 0 && <p style={s.empty}>אין פעילות עדיין</p>}
            {logs.map(l => (
              <div key={l.id} style={s.logCard}>
                <span style={s.logAction}>{ACTION_LABEL[l.action] ?? l.action}</span>
                <span style={s.logEmail}>{l.user_email}</span>
                <span style={s.logTime}>{timeAgo(l.created_at)}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── דיווחים ── */}
        {tab === "reports" && (
          <div style={s.list}>
            {reports.length === 0 && <p style={s.empty}>אין דיווחים עדיין</p>}
            {reports.map(r => (
              <div key={r.id} style={s.card}>
                <p style={s.reportType}>{r.item_type}{r.category ? ` · ${r.category}` : ""}</p>
                <p style={s.reportStreet}>{r.street_name}</p>
                <p style={s.reportMeta}>
                  {r.user_email ?? "אנונימי"} · {timeAgo(r.created_at)}
                </p>
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
  logCard: {
    background: "#1a1d27",
    border: "1px solid #2e3348",
    borderRadius: 10,
    padding: "10px 14px",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  logAction: { fontSize: 13, fontWeight: 600, color: "#e8eaf2", flexShrink: 0, minWidth: 80 },
  logEmail:  { fontSize: 12, color: "#7880a0", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  logTime:   { fontSize: 11, color: "#4a5070", flexShrink: 0 },
  empty:     { color: "#7880a0", textAlign: "center", padding: 40, fontSize: 15 },
  userRow:   { display: "flex", alignItems: "center", gap: 12 },
  avatar: {
    width: 40, height: 40, borderRadius: "50%",
    background: "#1a73e8", color: "#fff",
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
