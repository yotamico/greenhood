"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { NES_ZIONA_STREETS, Street } from "@/lib/nes-ziona-streets";
import { getReports, Report } from "@/lib/supabase";
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

function timeAgo(iso: string): string {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1)  return "פחות משעה";
  if (h < 24) return `לפני ${h} ש'`;
  return `לפני ${Math.floor(h / 24)} ימים`;
}

const ITEM_BG: Record<string, string> = {
  "גזם":      "#14532d",
  "גרוטאות": "#7c2d12",
  "ריהוט":   "#3b0764",
  "אחר":     "#1f2937",
};
const ITEM_EMOJI: Record<string, string> = {
  "גזם": "🌿", "גרוטאות": "🔧", "ריהוט": "🛋️", "אחר": "📦",
};

export default function HomePage() {
  const [activeTab,     setActiveTab]     = useState<Tab>("map");
  const [showReport,    setShowReport]    = useState(false);
  const [filterType,    setFilterType]    = useState("all");
  const [reports,       setReports]       = useState<Report[]>([]);
  const [userPos,       setUserPos]       = useState<LatLng | null>(null);
  const [targetStreet,  setTargetStreet]  = useState<Street | null>(null);
  const [searchQ,       setSearchQ]       = useState("");
  const [searchOpen,    setSearchOpen]    = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const searchResults = searchQ.length >= 2
    ? NES_ZIONA_STREETS.filter(s => s.name.includes(searchQ)).slice(0, 6)
    : [];

  async function loadReports() {
    const data = await getReports();
    setReports(data);
  }

  useEffect(() => { loadReports(); }, []);

  // סגירת חיפוש בלחיצה מחוץ
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleUserPos = useCallback((pos: LatLng) => setUserPos(pos), []);

  function selectStreet(s: Street) {
    setTargetStreet(s);
    setSearchQ(s.name);
    setSearchOpen(false);
    setActiveTab("map");
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
              targetStreet={targetStreet}
              onUserPos={handleUserPos}
            />
          </div>

          {/* סרגל חיפוש */}
          <div className="search-overlay" ref={searchRef}>
            <div className="search-box">
              <svg className="search-icon" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
                <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input
                className="search-input"
                placeholder="חפש רחוב..."
                value={searchQ}
                onChange={e => { setSearchQ(e.target.value); setSearchOpen(true); }}
                onFocus={() => searchQ.length >= 2 && setSearchOpen(true)}
              />
              {searchQ && (
                <button className="search-clear" onClick={() => { setSearchQ(""); setSearchOpen(false); setTargetStreet(null); }}>✕</button>
              )}
            </div>
            {searchOpen && searchResults.length > 0 && (
              <div className="search-dropdown">
                {searchResults.map(s => (
                  <div key={s.name} className="search-result" onClick={() => selectStreet(s)}>
                    <span className="result-name">{s.name}</span>
                    <span className="result-day">הוצאה: {s.takeout_day}</span>
                  </div>
                ))}
              </div>
            )}
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
            <div className="report-sheet" dir="rtl">
              <div className="sheet-handle" />
              <ReportPanel
                userPos={userPos}
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
                      style={{ background: ITEM_BG[r.item_type] ?? "#1f2937" }}
                    >
                      {ITEM_EMOJI[r.item_type] ?? "📦"}
                    </div>
                    <div className="history-info">
                      <p className="history-street">{r.street_name}</p>
                      <p className="history-meta">
                        {r.item_type} · פינוי: {r.collection_day ?? "—"} · {timeAgo(r.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
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

// ── סגנונות גלובליים ──
const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700;900&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:         #0f1117;
    --surface:    #1a1d27;
    --surface2:   #22263a;
    --border:     #2e3348;
    --text:       #e8eaf2;
    --text-muted: #7880a0;
    --accent:     #38e07b;
    --blue:       #1a73e8;
    --radius:     12px;
    --font:       'Heebo', sans-serif;
    --tab-h:      62px;
  }
  html, body { height: 100%; background: var(--bg); color: var(--text); font-family: var(--font); overflow: hidden; }

  .shell {
    display: flex; flex-direction: column;
    height: 100dvh; overflow: hidden;
    background: var(--bg);
  }

  /* ── מפה ── */
  .map-area {
    flex: 1; position: relative; overflow: hidden;
  }
  .map-layer {
    position: absolute; inset: 0;
  }
  .map-layer .leaflet-container { width: 100%; height: 100%; background: #1a1d27; }

  /* ── חיפוש ── */
  .search-overlay {
    position: absolute; top: 12px; left: 12px; right: 12px; z-index: 1000;
  }
  .search-box {
    display: flex; align-items: center; gap: 8px;
    background: #1a1d27ee; border: 1px solid var(--border);
    border-radius: 14px; padding: 0 14px;
    backdrop-filter: blur(10px);
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  }
  .search-icon { color: var(--text-muted); flex-shrink: 0; width: 18px; height: 18px; }
  .search-input {
    flex: 1; background: none; border: none; outline: none;
    color: var(--text); font-family: var(--font); font-size: 15px;
    padding: 12px 0; direction: rtl;
  }
  .search-input::placeholder { color: var(--text-muted); }
  .search-clear {
    background: none; border: none; color: var(--text-muted);
    cursor: pointer; font-size: 16px; padding: 4px; line-height: 1;
  }
  .search-dropdown {
    margin-top: 6px; background: var(--surface);
    border: 1px solid var(--border); border-radius: 14px;
    overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }
  .search-result {
    display: flex; align-items: center; justify-content: space-between;
    padding: 11px 16px; cursor: pointer; gap: 12px;
    border-bottom: 1px solid var(--border);
    transition: background 0.1s;
  }
  .search-result:last-child { border-bottom: none; }
  .search-result:hover { background: var(--surface2); }
  .result-name { font-size: 14px; font-weight: 600; color: var(--text); }
  .result-day  { font-size: 12px; color: var(--text-muted); white-space: nowrap; }

  /* ── פילטרים ── */
  .filter-overlay {
    position: absolute; top: 68px; left: 12px; right: 12px; z-index: 1000;
    display: flex; gap: 7px; overflow-x: auto;
    scrollbar-width: none;
  }
  .filter-overlay::-webkit-scrollbar { display: none; }
  .filter-chip {
    flex-shrink: 0;
    padding: 6px 13px; border-radius: 20px;
    background: #1a1d27ee; border: 1px solid var(--border);
    color: var(--text-muted); font-size: 13px; font-weight: 600;
    cursor: pointer; font-family: var(--font);
    backdrop-filter: blur(8px); transition: all 0.15s;
    white-space: nowrap;
  }
  .filter-chip.active {
    background: var(--blue); border-color: var(--blue); color: #fff;
  }

  /* ── פאנל (דיווח / היסטוריה) ── */
  .panel-area {
    flex: 1; overflow: hidden; display: flex; flex-direction: column;
    background: var(--bg);
  }

  /* ── היסטוריה ── */
  .history-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px; border-bottom: 1px solid var(--border);
    background: var(--surface); flex-shrink: 0;
  }
  .history-title { font-size: 18px; font-weight: 900; color: var(--text); }
  .history-refresh {
    background: none; border: 1px solid var(--border); color: var(--text-muted);
    border-radius: 8px; padding: 5px 10px; font-size: 13px; cursor: pointer;
    font-family: var(--font);
  }
  .history-empty {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 8px; color: var(--text); text-align: center;
    padding: 40px;
  }
  .history-list { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
  .history-card {
    display: flex; align-items: center; gap: 14px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 14px; padding: 14px;
  }
  .history-badge {
    width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; font-size: 22px;
  }
  .history-info { flex: 1; min-width: 0; }
  .history-street { font-size: 15px; font-weight: 700; color: var(--text); margin: 0; }
  .history-meta   { font-size: 12px; color: var(--text-muted); margin: 3px 0 0; }

  /* ── טאב-בר ── */
  .tab-bar {
    height: var(--tab-h); flex-shrink: 0;
    display: flex; align-items: stretch;
    background: var(--surface); border-top: 1px solid var(--border);
  }
  .tab-btn {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 4px;
    background: none; border: none; color: var(--text-muted);
    cursor: pointer; transition: color 0.15s; padding: 8px 0;
    font-family: var(--font);
  }
  .tab-btn.active { color: var(--blue); }
  .tab-label { font-size: 11px; font-weight: 600; }

  /* ── כפתור דיווח מרחף (Waze FAB) ── */
  .fab-report {
    position: absolute;
    bottom: 76px; right: 16px;
    z-index: 1001;
    width: 58px; height: 58px;
    border-radius: 50%;
    background: #f97316;
    border: none; cursor: pointer;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 2px;
    box-shadow: 0 4px 20px rgba(249,115,22,0.55), 0 2px 8px rgba(0,0,0,0.3);
    transition: transform 0.15s, box-shadow 0.15s;
    color: white;
  }
  .fab-report:hover  { transform: scale(1.08); box-shadow: 0 6px 28px rgba(249,115,22,0.7); }
  .fab-report:active { transform: scale(0.95); }
  .fab-label { font-size: 10px; font-weight: 700; font-family: var(--font); line-height: 1; }

  /* ── Bottom sheet דיווח ── */
  .report-sheet {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 72%;
    z-index: 1002;
    border-radius: 20px 20px 0 0;
    overflow: hidden;
    box-shadow: 0 -8px 40px rgba(0,0,0,0.6);
    animation: slideUp 0.28s cubic-bezier(0.32, 0.72, 0, 1);
    display: flex; flex-direction: column;
  }
  .sheet-handle {
    position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
    width: 36px; height: 4px; border-radius: 2px;
    background: #2e3348; z-index: 1;
  }
  @keyframes slideUp {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }

  /* ── skeleton ── */
  .map-skeleton {
    width: 100%; height: 100%;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 12px; background: var(--surface);
  }
  .skeleton-pulse {
    width: 60px; height: 60px; border-radius: 50%; background: var(--border);
    animation: skeletonPulse 1.5s ease-in-out infinite;
  }
  @keyframes skeletonPulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.7; } }
  .skeleton-label { color: var(--text-muted); font-size: 13px; }
`;
