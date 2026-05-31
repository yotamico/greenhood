"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { TabBar } from "@/components/ui/TabBar";

/* ── dynamic import — Leaflet needs window ── */
const GHMap = dynamic(() => import("@/components/Map/GHMapLeaflet"), {
  ssr: false,
  loading: () => (
    <div style={{
      position: "absolute", inset: 0,
      background: "var(--paper-2)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <span style={{ fontSize: 32, animation: "floatY 1.4s ease-in-out infinite" }}>🗺️</span>
    </div>
  ),
});

/* ── Category filter chips ── */
const CATS = [
  { key: "all",       label: "הכל" },
  { key: "furniture", label: "🪑 ריהוט" },
  { key: "books",     label: "📚 ספרים" },
  { key: "lighting",  label: "💡 תאורה" },
  { key: "plants",    label: "🌿 צמחים" },
  { key: "sports",    label: "⚽ ספורט" },
  { key: "kids",      label: "🧸 ילדים" },
];

/* ── Item data type ── */
interface Item {
  id: string;
  title: string;
  category: string;
  condition: string;
  address: string;
  created_at: string;
  status: string;
  lat: number | null;
  lng: number | null;
  pickup_day: string | null;
}

function dayLabel(dateStr: string): string {
  const t  = new Date().toISOString().split("T")[0];
  const tm = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  if (dateStr === t)  return "היום";
  if (dateStr === tm) return "מחר";
  return ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"][new Date(dateStr).getDay()];
}

/* ── Bottom-sheet snap points (% from top of screen) ── */
const FULL    = 10;   // sheet covers most of screen
const DEFAULT = 55;   // half-open
const HIDDEN  = 95;   // almost closed

function snapTo(pct: number) {
  if (pct < (FULL + DEFAULT) / 2)    return FULL;
  if (pct < (DEFAULT + HIDDEN) / 2)  return DEFAULT;
  return HIDDEN;
}

interface NavDest { lat: number; lng: number; title: string; }

function fmtDist(m: number) {
  return m < 1000 ? `${Math.round(m)} מ'` : `${(m / 1000).toFixed(1)} ק"מ`;
}
function fmtDur(s: number) {
  const m = Math.round(s / 60);
  return m < 60 ? `${m} דק'` : `${Math.floor(m / 60)} ש' ${m % 60} דק'`;
}

/* ─────────────────────────────────────────────────────────── */
function MapPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authed, setAuthed]       = useState(false);
  const [items,  setItems]        = useState<Item[]>([]);
  const [cat,    setCat]          = useState("all");
  const [search, setSearch]       = useState("");
  const [sheetPct, setSheetPct]   = useState(DEFAULT);
  const [dragging, setDragging]   = useState(false);
  const [userPos, setUserPos]     = useState<[number,number] | null>(null);
  const dragRef = useRef({ startY: 0, startPct: DEFAULT });

  const [centerTrigger, setCenterTrigger] = useState(0);

  /* ── auto-center refs ── */
  const hasInitialCentered  = useRef(false);
  const lastInteractTimeRef = useRef(0);
  const userPosRef          = useRef<[number,number] | null>(null);
  const navDestRef          = useRef<NavDest | null>(null);
  userPosRef.current  = userPos;

  /* initial auto-center — fires once when position first arrives */
  useEffect(() => {
    if (userPos && !hasInitialCentered.current) {
      hasInitialCentered.current = true;
      lastInteractTimeRef.current = Date.now();
      setCenterTrigger(t => t + 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos]);

  /* idle auto-center — re-centers after 5 s of no screen interaction */
  useEffect(() => {
    function onInteraction() {
      lastInteractTimeRef.current = Date.now();
    }
    document.addEventListener("touchstart", onInteraction, { passive: true });
    document.addEventListener("pointerdown", onInteraction, { passive: true });

    const iv = setInterval(() => {
      if (!hasInitialCentered.current) return;
      if (!userPosRef.current) return;
      if (navDestRef.current) return; // skip during active navigation
      if (Date.now() - lastInteractTimeRef.current >= 5000) {
        setCenterTrigger(t => t + 1);
        lastInteractTimeRef.current = Date.now(); // prevent continuous firing
      }
    }, 1000);

    return () => {
      document.removeEventListener("touchstart", onInteraction);
      document.removeEventListener("pointerdown", onInteraction);
      clearInterval(iv);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* clearance route mode */
  const [clearanceActive, setClearanceActive] = useState(false);
  const [clearanceDay,    setClearanceDay]    = useState<string>("");

  /* navigation mode */
  const [navDest,  setNavDest]  = useState<NavDest | null>(null);
  const [navRoute, setNavRoute] = useState<[number,number][] | null>(null);
  const [navInfo,  setNavInfo]  = useState<{ dist: number; dur: number } | null>(null);
  /* dedup ref — tracks which destination we already fetched a route for */
  const routeDestRef = useRef<string | null>(null);
  navDestRef.current = navDest;

  /* auth guard */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace("/login"); return; }
      setAuthed(true);
    });
  }, [router]);

  /* geolocation — watch position for live navigation */
  useEffect(() => {
    if (!navigator.geolocation) { setUserPos([31.9297, 34.8307]); return; }
    const id = navigator.geolocation.watchPosition(
      pos => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      () => setUserPos([31.9297, 34.8307]),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  /* react to nav params — runs on mount AND whenever URL changes */
  useEffect(() => {
    const lat   = searchParams.get("nav_lat");
    const lng   = searchParams.get("nav_lng");
    const title = searchParams.get("nav_title") ?? "יעד";
    if (lat && lng) {
      routeDestRef.current = null; // reset so the new dest gets a fresh fetch
      setNavRoute(null);
      setNavInfo(null);
      setNavDest({ lat: parseFloat(lat), lng: parseFloat(lng), title });
      setSheetPct(HIDDEN); // collapse sheet to show full map
    } else {
      routeDestRef.current = null;
      setNavDest(null);
      setNavRoute(null);
      setNavInfo(null);
    }
  }, [searchParams]);

  /* fetch OSRM route — re-runs when either navDest OR userPos changes.
     The dedup ref prevents re-fetching on every GPS position update. */
  useEffect(() => {
    if (!navDest || !userPos) return;
    const key = `${navDest.lat.toFixed(5)},${navDest.lng.toFixed(5)}`;
    if (routeDestRef.current === key) return; // already fetched for this dest
    routeDestRef.current = key;

    const [uLat, uLng] = userPos;
    fetch(
      `https://router.project-osrm.org/route/v1/driving/${uLng},${uLat};${navDest.lng},${navDest.lat}?overview=full&geometries=geojson`
    )
      .then(r => r.json())
      .then(d => {
        const route = d.routes?.[0];
        if (!route) return;
        const coords: [number,number][] = route.geometry.coordinates.map(
          ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
        );
        setNavRoute(coords);
        setNavInfo({ dist: route.distance, dur: route.duration });
      })
      .catch(() => { routeDestRef.current = null; }); // allow retry on error
  }, [navDest, userPos]);

  /* fetch items */
  useEffect(() => {
    if (!authed) return;
    supabase
      .from("items")
      .select("id,title,category,condition,address,created_at,status,lat,lng,pickup_day")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setItems((data as Item[]) ?? []);
      });
  }, [authed]);

  /* drag logic */
  const onDragStart = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startPct: sheetPct };
    setDragging(true);
  }, [sheetPct]);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const dy  = e.clientY - dragRef.current.startY;
    const pct = dragRef.current.startPct + (dy / window.innerHeight) * 100;
    setSheetPct(Math.max(FULL, Math.min(HIDDEN, pct)));
  }, [dragging]);

  const onDragEnd = useCallback(() => {
    setDragging(false);
    setSheetPct(curr => snapTo(curr));
  }, []);

  const isHidden = sheetPct >= (DEFAULT + HIDDEN) / 2;
  const isFull   = sheetPct <= (FULL + DEFAULT) / 2;

  const displayed = items.filter(it =>
    (cat === "all" || it.category === cat) &&
    (!search || it.title.includes(search) || it.address.includes(search))
  );

  const todayStr = new Date().toISOString().split("T")[0];
  const clearanceDays = clearanceActive
    ? [...new Set(
        items
          .filter(it => it.pickup_day && it.lat != null && it.lng != null && it.pickup_day >= todayStr)
          .map(it => it.pickup_day!)
      )].sort().slice(0, 4)
    : [];

  const clearanceRoute: [number,number][] = (clearanceActive && clearanceDay)
    ? items
        .filter(it => it.pickup_day === clearanceDay && it.lat != null && it.lng != null)
        .map(it => [it.lat!, it.lng!])
    : [];

  function toggleClearance() {
    if (clearanceActive) {
      setClearanceActive(false);
      setClearanceDay("");
    } else {
      const days = [...new Set(
        items
          .filter(it => it.pickup_day && it.lat != null && it.lng != null && it.pickup_day >= todayStr)
          .map(it => it.pickup_day!)
      )].sort();
      setClearanceActive(true);
      setClearanceDay(days[0] ?? "");
    }
  }

  if (!authed) return null;

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "var(--paper-2)",
      fontFamily: "var(--font-sans)",
      overflow: "hidden",
    }}>
      {/* ── MAP ── */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <GHMap
          userPos={userPos}
          items={items}
          onItemClick={id => router.push(`/items/${id}`)}
          navRoute={navRoute}
          navDest={navDest}
          centerTrigger={centerTrigger}
          clearanceRoute={clearanceRoute}
        />
      </div>

      {/* ── TOP BAR ── */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        zIndex: 10,
      }}>
        {navDest ? (
          /* ── Navigation banner ── */
          <div style={{
            padding: "14px 16px",
            background: "var(--ink)",
            color: "var(--paper)",
            display: "flex", alignItems: "center", gap: 12,
            boxShadow: "0 4px 0 rgba(45,42,36,0.18)",
          }}>
            <div style={{ fontSize: 26 }}>🧭</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: "var(--font-display)", fontWeight: 900,
                fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{navDest.title}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                {navInfo
                  ? `${fmtDist(navInfo.dist)} · ${fmtDur(navInfo.dur)}`
                  : navRoute ? "מסלול מוצג" : "מחשב מסלול…"}
              </div>
            </div>
            <button
              onClick={() => { setNavDest(null); setNavRoute(null); setNavInfo(null); router.replace("/map"); }}
              style={{
                padding: "8px 14px", borderRadius: 10,
                background: "rgba(255,255,255,0.15)",
                border: "1.5px solid rgba(255,255,255,0.35)",
                color: "var(--paper)", cursor: "pointer",
                fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 13,
                flexShrink: 0,
              }}
            >✕ בטל</button>
          </div>
        ) : (
          /* ── Normal search + filter bar ── */
          <div style={{
            padding: "12px 16px 14px",
            background: "linear-gradient(to bottom, rgba(245,242,232,0.97) 65%, transparent)",
          }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
              <div style={{
                flex: 1, display: "flex", alignItems: "center", gap: 10,
                padding: "0 14px", height: 48,
                background: "var(--surface)",
                border: "2px solid var(--ink)",
                borderRadius: "var(--r-md)",
                boxShadow: "var(--sh-md)",
              }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth={1.8} strokeLinecap="round">
                  <circle cx={11} cy={11} r={6}/><path d="M20 20l-4.5-4.5"/>
                </svg>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="חפש/י פריטים…"
                  style={{
                    flex: 1, background: "none", border: "none", outline: "none",
                    fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 500,
                    color: "var(--ink)", textAlign: "right", direction: "rtl",
                  }}
                />
              </div>
              <button
                onClick={() => router.push("/report")}
                style={{
                  width: 48, height: 48, background: "var(--primary)", color: "var(--ink)",
                  border: "2px solid var(--ink)", borderRadius: "var(--r-md)", boxShadow: "var(--sh-md)",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                }}
              >+</button>
            </div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
              {/* "הכל" first */}
              {CATS.slice(0, 1).map(c => (
                <button
                  key={c.key}
                  onClick={() => setCat(c.key)}
                  style={{
                    padding: "7px 14px", height: 34,
                    background: cat === c.key ? "var(--ink)" : "var(--surface)",
                    color: cat === c.key ? "var(--paper)" : "var(--ink)",
                    border: "1.5px solid var(--ink)", borderRadius: 999,
                    fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 13,
                    cursor: "pointer", flexShrink: 0,
                    boxShadow: cat === c.key ? "2px 2px 0 var(--shadow-ink)" : "1px 1px 0 var(--shadow-ink)",
                    whiteSpace: "nowrap",
                  }}
                >{c.label}</button>
              ))}

              {/* clearance route toggle chip — second, right after הכל */}
              <button
                onClick={toggleClearance}
                style={{
                  padding: "7px 13px", height: 34, flexShrink: 0,
                  background: clearanceActive ? "#C94B1F" : "var(--surface)",
                  color: clearanceActive ? "white" : "var(--ink)",
                  border: `1.5px solid ${clearanceActive ? "#C94B1F" : "var(--ink)"}`,
                  borderRadius: 999,
                  fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 13,
                  cursor: "pointer", whiteSpace: "nowrap",
                  boxShadow: clearanceActive ? "2px 2px 0 rgba(201,75,31,0.35)" : "1px 1px 0 var(--shadow-ink)",
                  display: "flex", alignItems: "center", gap: 5,
                }}
              >
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="M3 12h18M3 6l9-3 9 3M3 18l9 3 9-3"/>
                </svg>
                מסלול פינוי
              </button>

              {/* remaining category chips */}
              {CATS.slice(1).map(c => (
                <button
                  key={c.key}
                  onClick={() => setCat(c.key)}
                  style={{
                    padding: "7px 14px", height: 34,
                    background: cat === c.key ? "var(--ink)" : "var(--surface)",
                    color: cat === c.key ? "var(--paper)" : "var(--ink)",
                    border: "1.5px solid var(--ink)", borderRadius: 999,
                    fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 13,
                    cursor: "pointer", flexShrink: 0,
                    boxShadow: cat === c.key ? "2px 2px 0 var(--shadow-ink)" : "1px 1px 0 var(--shadow-ink)",
                    whiteSpace: "nowrap",
                  }}
                >{c.label}</button>
              ))}
            </div>

            {/* day selector — visible only when clearance mode is active */}
            {clearanceActive && (
              <div style={{
                display: "flex", gap: 6, marginTop: 8,
                overflowX: "auto", scrollbarWidth: "none",
              }}>
                {clearanceDays.length === 0 ? (
                  <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500, padding: "4px 0" }}>
                    אין פריטי פינוי עם תאריך
                  </span>
                ) : (
                  clearanceDays.map(d => (
                    <button
                      key={d}
                      onClick={() => setClearanceDay(d)}
                      style={{
                        padding: "5px 14px", height: 30, flexShrink: 0,
                        background: clearanceDay === d ? "#C94B1F" : "rgba(201,75,31,0.1)",
                        color: clearanceDay === d ? "white" : "#C94B1F",
                        border: `1.5px solid #C94B1F`,
                        borderRadius: 999,
                        fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 12,
                        cursor: "pointer", whiteSpace: "nowrap",
                      }}
                    >{dayLabel(d)}</button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── "רשימה" pill — centered above tab bar ── */}
      <button
        onClick={() => setSheetPct(DEFAULT)}
        style={{
          position: "fixed",
          bottom: 90,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 25,
          opacity: isHidden ? 1 : 0,
          pointerEvents: isHidden ? "auto" : "none",
          transition: "opacity 200ms",
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 20px",
          background: "var(--ink)", color: "var(--paper)",
          border: "2px solid var(--ink)",
          borderRadius: 999, cursor: "pointer",
          fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 14,
          boxShadow: "var(--sh-md)",
          whiteSpace: "nowrap",
        }}
      >
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <path d="M6 15l6-6 6 6"/>
        </svg>
        רשימה
        {displayed.length > 0 && (
          <span style={{
            minWidth: 22, height: 22, borderRadius: 999,
            background: "var(--accent)", color: "white",
            fontSize: 11, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 5px", border: "1.5px solid var(--paper)",
          }}>{displayed.length}</span>
        )}
      </button>

      {/* ── "+" FAB — right edge above tab bar ── */}
      <button
        onClick={() => router.push("/report")}
        style={{
          position: "fixed",
          bottom: 90,
          right: 16,
          zIndex: 25,
          opacity: isHidden ? 1 : 0,
          pointerEvents: isHidden ? "auto" : "none",
          transition: "opacity 200ms",
          width: 56, height: 56, borderRadius: "50%",
          background: "var(--primary)",
          border: "2.5px solid var(--ink)",
          boxShadow: "4px 4px 0 var(--shadow-ink)",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, fontWeight: 900, color: "var(--ink)",
        }}
      >+</button>

      {/* ── Locate Me FAB — left edge above tab bar ── */}
      <button
        onClick={() => userPos && setCenterTrigger(t => t + 1)}
        style={{
          position: "fixed",
          bottom: 90,
          left: 16,
          zIndex: 25,
          opacity: isHidden ? 1 : 0,
          pointerEvents: isHidden ? "auto" : "none",
          transition: "opacity 200ms",
          width: 56, height: 56, borderRadius: "50%",
          background: "var(--surface)",
          border: "2.5px solid var(--ink)",
          boxShadow: "4px 4px 0 var(--shadow-ink)",
          cursor: userPos ? "pointer" : "not-allowed",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
        title="מרכז אל מיקומי"
      >
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none"
          stroke="var(--ink)" strokeWidth={2.2} strokeLinecap="round">
          <circle cx={12} cy={12} r={3} fill="var(--primary)" stroke="var(--ink)"/>
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
          <circle cx={12} cy={12} r={7}/>
        </svg>
      </button>

      {/* ── BOTTOM SHEET ── */}
      <div
        style={{
          position: "absolute",
          left: 0, right: 0,
          top: `${sheetPct}%`,
          bottom: 0,
          background: "var(--surface)",
          border: "2px solid var(--ink)",
          borderRadius: "24px 24px 0 0",
          boxShadow: "0 -6px 0 var(--ink), 0 -12px 40px rgba(45,42,36,0.12)",
          zIndex: 20,
          display: "flex",
          flexDirection: "column",
          transition: dragging ? "none" : "top 320ms cubic-bezier(0.2,0.7,0.3,1)",
        }}
      >
        {/* drag handle */}
        <div
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          style={{
            padding: "12px 0 8px",
            cursor: dragging ? "grabbing" : "grab",
            touchAction: "none",
            userSelect: "none",
            flexShrink: 0,
          }}
        >
          <div style={{
            width: 48, height: 5, borderRadius: 3,
            background: dragging ? "var(--accent)" : "var(--ink)",
            margin: "0 auto",
            transition: "background 120ms",
          }} />
        </div>

        {/* sheet header */}
        <div style={{
          padding: "4px 20px 12px",
          flexShrink: 0,
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
          }}>
            <div style={{
              fontFamily: "var(--font-display)",
              fontWeight: 900, fontSize: 24,
              letterSpacing: "-0.02em",
            }}>קרוב אליך</div>
            <span style={{
              fontSize: 13, color: "var(--primary-dark)", fontWeight: 700,
            }}>
              {displayed.length} פריטים
            </span>
          </div>
          {displayed.some(it => it.status === "active") && (
            <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500, marginTop: 2 }}>
              מוצג: <span style={{ color: "var(--accent-dark)", fontWeight: 700 }}>עדכני ביותר</span>
            </div>
          )}
        </div>

        {/* items list */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 16px 100px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}>
          {displayed.length === 0 ? (
            <EmptyState />
          ) : (
            displayed.map(item => (
              <GHItemCard key={item.id} item={item} />
            ))
          )}
        </div>
      </div>

      {/* ── TAB BAR ── */}
      <div style={{ zIndex: 30 }}>
        <TabBar />
      </div>
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense>
      <MapPageInner />
    </Suspense>
  );
}

/* ── Item Card ── */
const CAT_EMOJI: Record<string, string> = {
  furniture: "🪑", books: "📚", lighting: "💡",
  plants: "🌿", sports: "⚽", electronics: "📺",
  kitchen: "🍳", kids: "🧸",
};
const CAT_COLOR: Record<string, string> = {
  furniture: "var(--warning-tint)", books: "var(--info-tint)",
  lighting: "var(--accent-tint)", plants: "var(--primary-light)",
  sports: "var(--info-tint)", electronics: "var(--paper-2)",
  kitchen: "var(--warning-tint)", kids: "var(--accent-tint)",
};

function GHItemCard({ item }: { item: Item }) {
  const router = useRouter();
  const emoji = CAT_EMOJI[item.category] ?? "📦";
  const color = CAT_COLOR[item.category] ?? "var(--paper-2)";
  const age   = timeAgo(item.created_at);

  return (
    <button
      onClick={() => router.push(`/items/${item.id}`)}
      style={{
        display: "flex", gap: 12, padding: 12,
        background: "var(--surface)",
        border: "2px solid var(--ink)",
        borderRadius: 16,
        boxShadow: "var(--sh-md)",
        cursor: "pointer",
        textAlign: "right",
        width: "100%",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* emoji thumb */}
      <div style={{
        width: 72, height: 72, borderRadius: 12,
        background: color, border: "2px solid var(--ink)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 36, flexShrink: 0,
        boxShadow: "var(--sh-sm)",
      }}>{emoji}</div>

      {/* info */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{
          fontFamily: "var(--font-display)", fontWeight: 900,
          fontSize: 15, lineHeight: 1.2, color: "var(--ink)",
        }}>{item.title}</div>
        <div style={{
          fontSize: 12, color: "var(--muted)", fontWeight: 500,
          display: "flex", gap: 5, alignItems: "center",
        }}>
          <span>📍 {item.address.split(",")[0]}</span>
          <span>·</span>
          <span>{age}</span>
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 2, flexWrap: "wrap" }}>
          <span style={{
            padding: "2px 8px", borderRadius: 999,
            background: "var(--paper-2)",
            border: "1.5px solid var(--ink)",
            fontSize: 11, fontWeight: 700,
          }}>{item.condition}</span>
        </div>
      </div>
    </button>
  );
}

function EmptyState() {
  const router = useRouter();
  return (
    <div style={{
      padding: "40px 20px",
      display: "flex", flexDirection: "column", alignItems: "center",
      gap: 14, textAlign: "center",
    }}>
      <div style={{ fontSize: 48 }}>🌱</div>
      <div style={{
        fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 20,
      }}>אין פריטים באזורך עדיין</div>
      <div style={{ fontSize: 14, color: "var(--muted)", fontWeight: 500, lineHeight: 1.55 }}>
        היה/י הראשון/ה לדווח על פריט ברחוב!
      </div>
      <button
        onClick={() => router.push("/report")}
        style={{
          padding: "12px 24px",
          background: "var(--primary)",
          border: "2px solid var(--ink)",
          borderRadius: "var(--r-md)",
          boxShadow: "var(--sh-md)",
          fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 15,
          cursor: "pointer",
        }}
      >+ דווח פריט חדש</button>
    </div>
  );
}

function timeAgo(ts: string) {
  const d = Date.now() - new Date(ts).getTime();
  const m = Math.floor(d / 60000);
  if (m < 60)  return `לפני ${m} ד׳`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `לפני ${h} ש׳`;
  return `לפני ${Math.floor(h / 24)} ימים`;
}
