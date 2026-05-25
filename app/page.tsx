"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { NES_ZIONA_STREETS, Street } from "@/lib/nes-ziona-streets";
import { getReports, deleteReport, updateReport, Report, getCurrentUser, signOut, logActivity } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { ReportPanel } from "@/components/Report/ReportPanel";

type LatLng = [number, number];
type Tab = "map" | "history";

const MapComponent = dynamic(() => import("@/components/Map/MapContainer"), {
  ssr: false,
  loading: () => (
    <div className="map-skeleton">
      <div className="skeleton-pulse" />
      <span className="skeleton-label">טוען מפה...</span>
    </div>
  ),
});

const FILTER_OPTIONS = [
  { key: "all",      label: "הכל",       emoji: "" },
  { key: "גזם",      label: "גזם",       emoji: "🌿" },
  { key: "גרוטאות", label: "גרוטאות",   emoji: "🔧" },
  { key: "ריהוט",   label: "ריהוט",     emoji: "🛋️" },
];

const HEBREW_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const todayHebrew = HEBREW_DAYS[new Date().getDay()];

function timeAgo(iso: string): string {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1)  return "פחות משעה";
  if (h < 24) return `לפני ${h} ש'`;
  return `לפני ${Math.floor(h / 24)} ימים`;
}

const EDIT_CATEGORIES = [
  { key: "ריהוט",   emoji: "🛋️" },
  { key: "גרוטאות", emoji: "🔧" },
  { key: "גזם",     emoji: "🌿" },
];
const EDIT_CONDITIONS = ["טוב", "בינוני", "ישן / שבור"];

const ITEM_BG: Record<string, string> = {
  "גזם":      "#A8C496",
  "גרוטאות": "#F0DBC0",
  "ריהוט":   "#F0D5CB",
  "אחר":     "#EDE6D2",
};
const ITEM_EMOJI: Record<string, string> = {
  "גזם": "🌿", "גרוטאות": "🔧", "ריהוט": "🛋️", "אחר": "📦",
};

const ADMIN_EMAIL = "yotamico@gmail.com";

export default function HomePage() {
  const router = useRouter();
  const [currentUser,   setCurrentUser]   = useState<User | null>(null);
  const [authReady,     setAuthReady]     = useState(false);
  const [activeTab,     setActiveTab]     = useState<Tab>("map");
  const [showReport,    setShowReport]    = useState(false);
  const [filterType,    setFilterType]    = useState("all");
  const [reports,       setReports]       = useState<Report[]>([]);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [editType,      setEditType]      = useState("");
  const [editCategory,  setEditCategory]  = useState("");
  const [editCondition, setEditCondition] = useState("");
  const [editNotes,     setEditNotes]     = useState("");
  const [editIsTaken,   setEditIsTaken]   = useState(false);
  const [editSaving,    setEditSaving]    = useState(false);
  const [userPos,       setUserPos]       = useState<LatLng | null>(null);
  const sheetRef   = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);

  function onHandleTouchStart(e: React.TouchEvent) {
    dragStartY.current = e.touches[0].clientY;
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  }

  function onHandleTouchMove(e: React.TouchEvent) {
    if (dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${dy}px)`;
    }
  }

  function onHandleTouchEnd(e: React.TouchEvent) {
    if (dragStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - dragStartY.current;
    dragStartY.current = null;
    if (dy > 80) {
      setShowReport(false);
    } else if (sheetRef.current) {
      sheetRef.current.style.transition = "";
      sheetRef.current.style.transform  = "";
    }
  }



  // ── בדיקת auth ──
  useEffect(() => {
    getCurrentUser().then(user => {
      if (!user) { router.replace("/login"); return; }
      setCurrentUser(user);
      setAuthReady(true);
      loadReports();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadReports() {
    const data = await getReports();
    setReports(data);
  }


  function openEdit(r: Report) {
    setEditingReport(r);
    setEditType(r.item_type);
    setEditCategory(r.category ?? "");
    setEditCondition(r.item_condition ?? "");
    setEditNotes(r.notes ?? "");
    setEditIsTaken(r.is_taken ?? false);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("למחוק את הדיווח הזה?")) return;
    await deleteReport(id);
    setReports(prev => prev.filter(r => r.id !== id));
  }

  async function handleSaveEdit() {
    if (!editingReport) return;
    setEditSaving(true);
    await updateReport(editingReport.id, {
      item_type:      editType.trim(),
      category:       editCategory || null,
      item_condition: editCondition || null,
      notes:          editNotes.trim() || null,
      is_taken:       editIsTaken,
    });
    setEditSaving(false);
    setEditingReport(null);
    loadReports();
  }

  const handleUserPos = useCallback((pos: LatLng) => setUserPos(pos), []);


  if (!authReady) {
    return (
      <div style={{ minHeight: "100dvh", background: "#0f1117", display: "flex",
        alignItems: "center", justifyContent: "center", color: "#7880a0",
        fontFamily: "'Heebo', sans-serif", fontSize: 16 }}>
        טוען...
      </div>
    );
  }

  return (
    <>
      <style>{globalStyles}</style>
      <div className="shell" dir="rtl">

        {/* ── מסך מפה (תמיד מרונדר, נסתר בהיסטוריה) ── */}
        <div className="map-area" style={{ display: activeTab === "history" ? "none" : "block" }}>

          {/* שכבת מפה */}
          <div className="map-layer">
            <MapComponent
              filterType={filterType}
              reports={reports}
              onUserPos={handleUserPos}
            />
          </div>


          {/* פילטרים */}
          <div className="filter-overlay">
            {FILTER_OPTIONS.map(f => (
              <button
                key={f.key}
                className={`filter-chip${filterType === f.key ? " active" : ""}`}
                onClick={() => setFilterType(f.key)}
              >
                {f.emoji} {f.label}
              </button>
            ))}
          </div>

          {/* ── כפתור דיווח מרחף — סגנון Waze ── */}
          {!showReport && (
            <button
              className="fab-report"
              onClick={() => setShowReport(true)}
              title="דווח על פריט"
              aria-label="דווח על פריט"
            >
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
                <path d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
                  stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="fab-label">דווח</span>
            </button>
          )}

          {/* ── פאנל דיווח — Bottom-sheet על המפה ── */}
          {showReport && (
            <div className="report-sheet" ref={sheetRef} dir="rtl">
              <div
                className="sheet-handle"
                onTouchStart={onHandleTouchStart}
                onTouchMove={onHandleTouchMove}
                onTouchEnd={onHandleTouchEnd}
              />
              <ReportPanel
                userPos={userPos}
                userId={currentUser?.id}
                userEmail={currentUser?.email}
                onClose={() => setShowReport(false)}
                onSubmitted={() => { loadReports(); setShowReport(false); }}
              />
            </div>
          )}
        </div>

        {/* ── מסך היסטוריה ── */}
        {activeTab === "history" && (
          <div className="panel-area" dir="rtl">
            <div className="history-header">
              <h2 className="history-title">📋 דיווחים אחרונים</h2>
              <button className="history-refresh" onClick={loadReports}>↻ רענן</button>
            </div>
            {reports.length === 0 ? (
              <div className="history-empty">
                <p style={{ fontSize: 40 }}>📭</p>
                <p>אין דיווחים עדיין</p>
                <p style={{ color: "#7880a0", fontSize: 13, marginTop: 4 }}>
                  לחץ על "דיווח" כדי להוסיף את הפריט הראשון
                </p>
              </div>
            ) : (
              <div className="history-list">
                {reports.map(r => (
                  <div key={r.id} className="history-card">
                    <div
                      className="history-badge"
                      style={{ background: ITEM_BG[r.category ?? r.item_type] ?? "#1f2937" }}
                    >
                      {ITEM_EMOJI[r.category ?? r.item_type] ?? "📦"}
                    </div>
                    <div className="history-info">
                      <p className="history-street">{r.street_name}</p>
                      <p className="history-meta">
                        {r.item_type}{r.category ? ` · ${r.category}` : ""} · {timeAgo(r.created_at)}
                      </p>
                    </div>
                    <div className="history-actions">
                      <button className="card-btn edit-btn" onClick={() => openEdit(r)}>✏️</button>
                      <button className="card-btn del-btn"  onClick={() => handleDelete(r.id)}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── מודל עריכה ── */}
        {editingReport && (
          <div className="edit-overlay" onClick={e => { if (e.target === e.currentTarget) setEditingReport(null); }}>
            <div className="edit-sheet" dir="rtl">
              <div className="edit-header">
                <button className="edit-cancel" onClick={() => setEditingReport(null)}>ביטול</button>
                <span className="edit-title">עריכת דיווח</span>
                <button className="edit-save" onClick={handleSaveEdit} disabled={editSaving}>
                  {editSaving ? "שומר..." : "שמור"}
                </button>
              </div>
              <div className="edit-body">
                <label className="edit-label">סוג החפץ</label>
                <input
                  className="edit-input"
                  value={editType}
                  onChange={e => setEditType(e.target.value)}
                />
                <label className="edit-label">קטגוריה</label>
                <div className="edit-chips">
                  {EDIT_CATEGORIES.map(c => (
                    <button
                      key={c.key}
                      className={`edit-chip${editCategory === c.key ? " selected" : ""}`}
                      onClick={() => setEditCategory(editCategory === c.key ? "" : c.key)}
                    >
                      {c.emoji} {c.key}
                    </button>
                  ))}
                </div>
                <label className="edit-label">מצב הפריט</label>
                <div className="edit-chips">
                  {EDIT_CONDITIONS.map(c => (
                    <button
                      key={c}
                      className={`edit-chip${editCondition === c ? " selected" : ""}`}
                      onClick={() => setEditCondition(editCondition === c ? "" : c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <label className="edit-label">הערות</label>
                <textarea
                  className="edit-input"
                  rows={3}
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  style={{ resize: "none", lineHeight: 1.5 }}
                />
                <label className="edit-taken">
                  <input
                    type="checkbox"
                    checked={editIsTaken}
                    onChange={e => setEditIsTaken(e.target.checked)}
                    style={{ accentColor: "#1a73e8", width: 18, height: 18 }}
                  />
                  <span>סמן אם נלקח</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* ── טאב-בר תחתי ── */}
        <nav className="tab-bar">
          {([
            { key: "map",     icon: mapIcon,     label: "מפה" },
            { key: "history", icon: historyIcon, label: "דיווחים" },
          ] as { key: Tab; icon: string; label: string }[]).map(t => (
            <button
              key={t.key}
              className={`tab-btn${activeTab === t.key ? " active" : ""}`}
              onClick={() => setActiveTab(t.key)}
              dangerouslySetInnerHTML={{ __html: `${t.icon}<span class="tab-label">${t.label}</span>` }}
            />
          ))}
          {currentUser?.email === ADMIN_EMAIL && (
            <button className="tab-btn" onClick={() => router.push("/admin")}
              dangerouslySetInnerHTML={{ __html: `${adminIcon}<span class="tab-label">ניהול</span>` }}
            />
          )}
          <button className="tab-btn" onClick={async () => { await signOut(); router.replace("/login"); }}
            dangerouslySetInnerHTML={{ __html: `${logoutIcon}<span class="tab-label">יציאה</span>` }}
          />
        </nav>

      </div>
    </>
  );
}

// ── SVG אייקונים ──
const mapIcon = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none">
  <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 9m0 8V9m0 0L9 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
</svg>`;

const reportIcon = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none">
  <path d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
</svg>`;

const historyIcon = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none">
  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
</svg>`;

const adminIcon = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none">
  <path d="M9 17v-2m3 2v-4m3 4v-6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
</svg>`;

const logoutIcon = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none">
  <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
</svg>`;

// ── סגנונות גלובליים — GreenHOOD · Sage Calm ──
const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700;800;900&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    /* GreenHOOD · Sage Calm tokens */
    --paper:         #F5F2E8;
    --paper-2:       #EDE6D2;
    --surface:       #FFFFFF;
    --ink:           #2D2A24;
    --ink-soft:      #4A4536;
    --muted:         #7A7363;
    --muted-2:       #B0A892;
    --shadow-ink:    rgba(45,42,36,0.18);
    --primary:       #6B9956;
    --primary-dark:  #2D4A2B;
    --primary-light: #A8C496;
    --primary-tint:  #DDE7CC;
    --accent:        #C97464;
    --accent-dark:   #8E4A3D;
    --accent-tint:   #F0D5CB;
    --warning:       #D9A574;
    --warning-tint:  #F0DBC0;
    --info:          #6B8FA8;
    --info-tint:     #C9D8E2;
    /* compat aliases */
    --bg:         var(--paper);
    --text:       var(--ink);
    --text-muted: var(--muted);
    --border:     rgba(45,42,36,0.22);
    --blue:       var(--primary);
    --radius:     14px;
    --font:       'Rubik', 'Heebo', system-ui, sans-serif;
    --tab-h:      62px;
  }

  html, body { height: 100%; background: var(--paper); color: var(--ink); font-family: var(--font); overflow: hidden; -webkit-font-smoothing: antialiased; }

  .shell { display: flex; flex-direction: column; height: 100dvh; overflow: hidden; background: var(--paper); }

  /* ── מפה ── */
  .map-area  { flex: 1; position: relative; overflow: hidden; }
  .map-layer { position: absolute; inset: 0; }
  .map-layer .leaflet-container { width: 100%; height: 100%; background: var(--paper-2); }

  /* ── פילטרים (sticker chips) ── */
  .filter-overlay {
    position: absolute; top: 12px; left: 12px; right: 12px; z-index: 1000;
    display: flex; gap: 7px; overflow-x: auto; scrollbar-width: none;
  }
  .filter-overlay::-webkit-scrollbar { display: none; }
  .filter-chip {
    flex-shrink: 0; white-space: nowrap;
    padding: 7px 14px; height: 34px; border-radius: 999px;
    background: var(--surface); color: var(--ink);
    border: 1.5px solid var(--ink);
    font-size: 13px; font-weight: 700; font-family: var(--font);
    cursor: pointer; transition: all 0.12s;
    box-shadow: 1.5px 1.5px 0 var(--shadow-ink);
  }
  .filter-chip.active {
    background: var(--ink); color: var(--paper);
    box-shadow: 2px 2px 0 var(--shadow-ink);
  }
  .filter-chip:active { transform: translate(1px,1px); box-shadow: none; }

  /* ── פאנל ── */
  .panel-area { flex: 1; overflow: hidden; display: flex; flex-direction: column; background: var(--paper); }

  /* ── היסטוריה ── */
  .history-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px; border-bottom: 2px solid var(--ink);
    background: var(--surface); flex-shrink: 0;
  }
  .history-title   { font-size: 18px; font-weight: 800; color: var(--ink); }
  .history-refresh {
    background: var(--surface); border: 1.5px solid var(--ink); color: var(--ink);
    border-radius: 8px; padding: 5px 10px; font-size: 13px; cursor: pointer;
    font-family: var(--font); box-shadow: 1.5px 1.5px 0 var(--shadow-ink);
  }
  .history-empty {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 8px; color: var(--ink); text-align: center; padding: 40px;
  }
  .history-list { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
  .history-card {
    display: flex; align-items: center; gap: 14px;
    background: var(--surface); border: 2px solid var(--ink);
    border-radius: 16px; padding: 14px;
    box-shadow: 3px 3px 0 var(--shadow-ink);
  }
  .history-badge {
    width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; font-size: 22px;
    border: 1.5px solid var(--ink);
  }
  .history-info   { flex: 1; min-width: 0; }
  .history-street { font-size: 15px; font-weight: 700; color: var(--ink); margin: 0; }
  .history-meta   { font-size: 12px; color: var(--muted); margin: 3px 0 0; }
  .history-actions { display: flex; gap: 6px; flex-shrink: 0; }
  .card-btn {
    background: var(--paper-2); border: 1.5px solid var(--ink);
    border-radius: 8px; width: 34px; height: 34px;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; cursor: pointer;
    box-shadow: 1.5px 1.5px 0 var(--shadow-ink);
  }
  .del-btn:hover  { border-color: var(--accent); background: var(--accent-tint); }
  .edit-btn:hover { border-color: var(--primary); background: var(--primary-tint); }

  /* ── מודל עריכה ── */
  .edit-overlay { position: fixed; inset: 0; z-index: 2000; background: rgba(45,42,36,0.5); display: flex; align-items: flex-end; }
  .edit-sheet {
    width: 100%; background: var(--paper);
    border-radius: 20px 20px 0 0; border: 2px solid var(--ink); border-bottom: none;
    box-shadow: 0 -4px 0 var(--ink);
    max-height: 85dvh; display: flex; flex-direction: column;
    animation: slideUp 0.25s cubic-bezier(0.32,0.72,0,1);
  }
  .edit-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px; border-bottom: 2px solid var(--ink);
    background: var(--surface); border-radius: 20px 20px 0 0;
  }
  .edit-title  { font-size: 16px; font-weight: 800; color: var(--ink); }
  .edit-cancel { background: none; border: none; color: var(--muted); font-size: 14px; font-family: var(--font); cursor: pointer; padding: 4px 8px; }
  .edit-save {
    background: var(--primary); border: 2px solid var(--ink); color: var(--ink);
    border-radius: 8px; padding: 6px 14px; font-size: 14px; font-weight: 700;
    font-family: var(--font); cursor: pointer; box-shadow: 2px 2px 0 var(--shadow-ink);
  }
  .edit-save:disabled { opacity: 0.5; }
  .edit-body  { overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
  .edit-label { font-size: 13px; font-weight: 700; color: var(--ink-soft); }
  .edit-input {
    width: 100%; background: var(--surface); border: 2px solid var(--ink);
    border-radius: 10px; padding: 11px 14px; font-size: 15px; color: var(--ink);
    font-family: var(--font); outline: none; box-sizing: border-box; direction: rtl;
  }
  .edit-chips { display: flex; gap: 8px; flex-wrap: wrap; }
  .edit-chip {
    padding: 7px 14px; border-radius: 999px;
    background: var(--paper-2); border: 1.5px solid var(--ink);
    color: var(--ink); font-size: 13px; font-weight: 600;
    cursor: pointer; font-family: var(--font); transition: all 0.15s;
    box-shadow: 1.5px 1.5px 0 var(--shadow-ink);
  }
  .edit-chip.selected { background: var(--primary); color: var(--ink); box-shadow: 2px 2px 0 var(--shadow-ink); }
  .edit-taken { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 600; color: var(--ink-soft); cursor: pointer; }

  /* ── טאב-בר ── */
  .tab-bar {
    height: var(--tab-h); flex-shrink: 0;
    display: flex; align-items: stretch;
    background: var(--surface); border-top: 2px solid var(--ink);
  }
  .tab-btn {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 4px;
    background: none; border: none; color: var(--muted);
    cursor: pointer; transition: color 0.15s; padding: 8px 0; font-family: var(--font);
  }
  .tab-btn.active { color: var(--primary-dark); }
  .tab-label { font-size: 11px; font-weight: 700; }

  /* ── FAB דיווח (sticker) ── */
  .fab-report {
    position: absolute; bottom: 76px; right: 16px; z-index: 1001;
    width: 58px; height: 58px; border-radius: 50%;
    background: var(--primary); color: var(--ink);
    border: 2.5px solid var(--ink); cursor: pointer;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    box-shadow: 4px 4px 0 var(--shadow-ink);
    transition: transform 0.12s;
  }
  .fab-report:hover  { transform: translate(-1px,-1px); }
  .fab-report:active { transform: translate(2px,2px); box-shadow: 1px 1px 0 var(--shadow-ink); }
  .fab-label { font-size: 10px; font-weight: 800; font-family: var(--font); line-height: 1; color: var(--ink); }

  /* ── Bottom sheet דיווח ── */
  .report-sheet {
    position: absolute; bottom: 0; left: 0; right: 0; height: 72%; z-index: 1002;
    border-radius: 20px 20px 0 0; overflow: hidden;
    border: 2px solid var(--ink); border-bottom: none;
    box-shadow: 0 -4px 0 var(--ink);
    animation: slideUp 0.28s cubic-bezier(0.32, 0.72, 0, 1);
    display: flex; flex-direction: column;
  }
  .sheet-handle {
    position: absolute; top: 0; left: 0; right: 0; height: 28px; z-index: 10;
    cursor: grab; display: flex; align-items: center; justify-content: center;
  }
  .sheet-handle::after { content: ''; width: 36px; height: 4px; border-radius: 2px; background: rgba(45,42,36,0.3); }

  @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

  /* ── skeleton ── */
  .map-skeleton {
    width: 100%; height: 100%;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 12px; background: var(--paper-2);
  }
  .skeleton-pulse { width: 60px; height: 60px; border-radius: 50%; background: var(--muted-2); animation: skeletonPulse 1.5s ease-in-out infinite; }
  @keyframes skeletonPulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.7; } }
  .skeleton-label { color: var(--muted); font-size: 13px; }
`;
