"use client";

import { useEffect, useState, useRef, useCallback, useMemo, Suspense, memo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { TabBar } from "@/components/ui/TabBar";
import NotificationsPopup from "@/components/NotificationsPopup";

/* ── dynamic import — MapLibre needs window ── */
const GHMap = dynamic(() => import("@/components/Map/GHMapLibre"), {
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
  taken_at: string | null;
  item_images: { url: string; is_primary: boolean; position: number }[];
}

const APPEAL_WINDOW_MS = 3 * 60 * 60 * 1000;

function isDisplayEligible(it: Pick<Item, "status" | "pickup_day" | "taken_at">, todayStr: string): boolean {
  if (it.status === "active") return it.pickup_day === null || it.pickup_day >= todayStr;
  if (it.status === "taken")  return !!it.taken_at && Date.now() - new Date(it.taken_at).getTime() < APPEAL_WINDOW_MS;
  return false;
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

interface OsrmStep {
  name: string;
  distance: number;
  duration: number;
  maneuver: {
    type: string;
    modifier?: string;
    location: [number, number]; // [lng, lat]
  };
}

function haversine([lat1, lng1]: [number,number], [lat2, lng2]: [number,number]): number {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function TurnArrow({ type, modifier }: { type?: string; modifier?: string }) {
  if (type === "arrive") return <span style={{ fontSize: 32, lineHeight: 1 }}>🎯</span>;
  const deg: Record<string, number> = {
    "left": -90, "slight left": -45, "sharp left": -130,
    "right": 90, "slight right": 45, "sharp right": 130,
    "uturn": 180,
  };
  const rotation = deg[modifier ?? ""] ?? 0;
  return (
    <svg width={40} height={40} viewBox="0 0 40 40"
      style={{ transform: `rotate(${rotation}deg)`, display: "block" }}>
      <polygon points="20,4 32,34 20,26 8,34" fill="white" />
    </svg>
  );
}

function fmtDist(m: number) {
  return m < 1000 ? `${Math.round(m)} מ'` : `${(m / 1000).toFixed(1)} ק"מ`;
}
function fmtDur(s: number) {
  const m = Math.round(s / 60);
  return m < 60 ? `${m} דק'` : `${Math.floor(m / 60)} ש' ${m % 60} דק'`;
}

/* ─────────────────────────────────────────────────────────── */

const JS_DAY_TO_HEBREW: Record<number,string> = {
  0:"ראשון",1:"שני",2:"שלישי",3:"רביעי",4:"חמישי",5:"שישי",
};

let _streetCache: Map<string,[number,number][][]> | null = null;
let _streetCachePromise: Promise<Map<string,[number,number][][]>> | null = null;

function fetchNesZionaStreets(): Promise<Map<string,[number,number][][]>> {
  if (_streetCache) return Promise.resolve(_streetCache);
  if (_streetCachePromise) return _streetCachePromise;
  _streetCachePromise = fetch("/api/streets")
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then((data: { elements?: { tags?: { name?: string }; geometry?: { lat: number; lon: number }[] }[] }) => {
      const map = new Map<string,[number,number][][]>();
      for (const el of data.elements ?? []) {
        const name = el.tags?.name;
        if (!name || !el.geometry?.length) continue;
        const seg: [number,number][] = el.geometry.map(({ lat, lon }) => [lat, lon]);
        if (!map.has(name)) map.set(name, []);
        map.get(name)!.push(seg);
      }
      _streetCache = map;
      _streetCachePromise = null;
      return map;
    })
    .catch(() => { _streetCachePromise = null; return new Map<string,[number,number][][]>(); });
  return _streetCachePromise;
}

function MapPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authed, setAuthed]       = useState(false);
  const [showNotifPopup, setShowNotifPopup] = useState(false);
  const [items,  setItems]        = useState<Item[]>([]);
  const [cat,    setCat]          = useState("all");
  const [search, setSearch]       = useState("");
  const [sheetPct, setSheetPct]   = useState(DEFAULT);
  const [dragging, setDragging]   = useState(false);
  const [userPos, setUserPos]     = useState<[number,number] | null>(null);
  const dragRef      = useRef({ startY: 0, startPct: DEFAULT });
  const sheetPctRef  = useRef(DEFAULT);
  const draggingRef  = useRef(false);
  sheetPctRef.current = sheetPct;
  draggingRef.current = dragging;
  const listRef = useRef<HTMLDivElement>(null);

  const [centerTrigger, setCenterTrigger] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /* snap sheet to full when a card expands */
  useEffect(() => {
    if (expandedId !== null) setSheetPct(FULL);
  }, [expandedId]);


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

  /* (idle auto-center removed — was firing flyTo every 5s of inactivity, causing constant 60fps map animation) */

  /* clearance route mode (chip-based, uses pickup_day) */
  const [clearanceActive, setClearanceActive] = useState(false);
  const [clearanceDay,    setClearanceDay]    = useState<string>("");

  /* street clearance mode — floating button */
  const [streetModeActive, setStreetModeActive] = useState(false);
  const [streetModeDay,    setStreetModeDay]    = useState<"היום"|"מחר"|"מחרתיים">("מחר");
  const [clearanceStreets, setClearanceStreets] = useState<[number,number][][]>([]);
  const [streetLoading,    setStreetLoading]    = useState(false);
  const [streetError,      setStreetError]      = useState(false);
  const [streetCount,      setStreetCount]      = useState(0);
  const [streetSchedule,   setStreetSchedule]   = useState<{ street_name: string; collection_day: string }[]>([]);

  useEffect(() => {
    supabase.from("street_schedules").select("street_name,collection_day").eq("city", "נס ציונה")
      .then(({ data }) => setStreetSchedule((data ?? []) as { street_name: string; collection_day: string }[]));
  }, []);

  /* navigation mode */
  const [navDest,        setNavDest]        = useState<NavDest | null>(null);
  const [navRoute,       setNavRoute]       = useState<[number,number][] | null>(null);
  const [navInfo,        setNavInfo]        = useState<{ dist: number; dur: number } | null>(null);
  const [navSteps,       setNavSteps]       = useState<OsrmStep[]>([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [heading,        setHeading]        = useState<number | null>(null);
  const prevPosRef = useRef<[number,number] | null>(null);
  /* dedup ref — tracks which destination we already fetched a route for */
  const routeDestRef = useRef<string | null>(null);
  navDestRef.current = navDest;

  /* compute scheduled streets from street_schedules (Supabase) */
  const streetModeHebrewDay = useMemo(() => {
    const offset = streetModeDay === "מחר" ? 1 : streetModeDay === "מחרתיים" ? 2 : 0;
    const d = new Date(); d.setDate(d.getDate() + offset);
    return JS_DAY_TO_HEBREW[d.getDay()] ?? "";
  }, [streetModeDay]);

  const streetModeNames = useMemo(() => {
    if (!streetModeActive) return [];
    return streetSchedule
      .filter(s => s.collection_day === streetModeHebrewDay)
      .map(s => s.street_name);
  }, [streetModeActive, streetModeHebrewDay, streetSchedule]);

  /* fetch full street geometry from Overpass whenever mode or day changes */
  useEffect(() => {
    if (!streetModeActive || !streetModeNames.length) {
      setClearanceStreets([]);
      setStreetCount(0);
      return;
    }
    const scheduledNames = new Set(streetModeNames);
    setStreetLoading(true);
    setStreetError(false);
    fetchNesZionaStreets().then(streetMap => {
      if (streetMap.size === 0) { setStreetError(true); setClearanceStreets([]); return; }
      const segs: [number,number][][] = [];
      let matched = 0;
      streetMap.forEach((ways, osmName) => {
        const hit = [...scheduledNames].some(
          s => osmName === s || osmName.includes(s) || s.includes(osmName)
        );
        if (hit) { segs.push(...ways); matched++; }
      });
      setClearanceStreets(segs);
      setStreetCount(matched);
    }).catch(() => setStreetError(true))
      .finally(() => setStreetLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streetModeActive, streetModeNames]);

  /* auth guard */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace("/login"); return; }
      setAuthed(true);
    });
  }, [router]);

  /* notifications popup — appears 600ms after onboarding completes */
  useEffect(() => {
    const pending = sessionStorage.getItem("pendingNotifRequest");
    if (pending === "true") {
      sessionStorage.removeItem("pendingNotifRequest");
      const t = setTimeout(() => setShowNotifPopup(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  /* geolocation — watch position for live navigation.
     Throttle: skip state update if moved less than 8m (prevents re-renders while stationary). */
  useEffect(() => {
    if (!navigator.geolocation) { setUserPos([31.9297, 34.8307]); return; }
    const MIN_DELTA = 8 / 111320; // ~8 metres in degrees
    const id = navigator.geolocation.watchPosition(
      pos => {
        const newPos: [number,number] = [pos.coords.latitude, pos.coords.longitude];
        const prev = prevPosRef.current;
        const moved = !prev
          || Math.abs(newPos[0] - prev[0]) > MIN_DELTA
          || Math.abs(newPos[1] - prev[1]) > MIN_DELTA;
        if (moved) setUserPos(newPos);
        if (pos.coords.heading != null && !isNaN(pos.coords.heading)) {
          setHeading(pos.coords.heading);
        } else if (prev && moved) {
          const dx = newPos[1] - prev[1], dy = newPos[0] - prev[0];
          if (Math.abs(dx) > 0.000005 || Math.abs(dy) > 0.000005) {
            setHeading((Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360);
          }
        }
        prevPosRef.current = newPos;
      },
      () => setUserPos([31.9297, 34.8307]),
      { enableHighAccuracy: true, maximumAge: 3000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  /* react to nav params — runs on mount AND whenever URL changes */
  useEffect(() => {
    const lat   = searchParams.get("nav_lat");
    const lng   = searchParams.get("nav_lng");
    const title = searchParams.get("nav_title") ?? "יעד";
    if (lat && lng) {
      routeDestRef.current = null;
      setNavRoute(null);
      setNavInfo(null);
      setNavSteps([]);
      setCurrentStepIdx(0);
      setNavDest({ lat: parseFloat(lat), lng: parseFloat(lng), title });
      setSheetPct(HIDDEN);
    } else {
      routeDestRef.current = null;
      setNavDest(null);
      setNavRoute(null);
      setNavInfo(null);
      setNavSteps([]);
      setCurrentStepIdx(0);
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
    const controller = new AbortController();
    fetch(
      `https://router.project-osrm.org/route/v1/driving/${uLng},${uLat};${navDest.lng},${navDest.lat}?overview=full&geometries=geojson&steps=true`,
      { signal: controller.signal }
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
        const steps: OsrmStep[] = route.legs?.[0]?.steps ?? [];
        setNavSteps(steps);
        const firstReal = steps.findIndex(s => s.maneuver.type !== "depart");
        setCurrentStepIdx(firstReal > 0 ? firstReal : 0);
      })
      .catch(err => {
        if (err.name !== "AbortError") routeDestRef.current = null; // allow retry on real error
      });
    return () => controller.abort();
  }, [navDest, userPos]);

  /* advance nav step when user reaches the maneuver point */
  useEffect(() => {
    if (!userPos || !navSteps.length || currentStepIdx >= navSteps.length) return;
    const step = navSteps[currentStepIdx];
    const stepPos: [number,number] = [step.maneuver.location[1], step.maneuver.location[0]];
    if (haversine(userPos, stepPos) < 40) {
      setCurrentStepIdx(i => Math.min(i + 1, navSteps.length - 1));
    }
  }, [userPos, navSteps, currentStepIdx]);

  /* current nav step + distance to its maneuver point */
  const currentStep = navSteps[currentStepIdx] ?? null;
  const distToStep = useMemo(() => {
    if (!userPos || !currentStep) return 0;
    const stepPos: [number,number] = [currentStep.maneuver.location[1], currentStep.maneuver.location[0]];
    return haversine(userPos, stepPos);
  }, [userPos, currentStep]);

  /* fetch items */
  useEffect(() => {
    if (!authed) return;
    supabase
      .from("items")
      .select("id,title,category,condition,address,created_at,status,lat,lng,pickup_day,taken_at,item_images(url,is_primary,position)")
      .in("status", ["active", "taken"])
      .eq("moderation_status", "approved")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) return;
        const todayStr = new Date().toISOString().split("T")[0];
        setItems(((data as Item[]) ?? []).filter(it => isDisplayEligible(it, todayStr)));
      });
  }, [authed]);

  /* drag logic — both callbacks are stable (no state deps, use refs instead) */
  const onDragStart = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startPct: sheetPctRef.current };
    setDragging(true);
  }, []);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dy  = e.clientY - dragRef.current.startY;
    const pct = dragRef.current.startPct + (dy / window.innerHeight) * 100;
    setSheetPct(Math.max(FULL, Math.min(HIDDEN, pct)));
  }, []);

  const onDragEnd = useCallback(() => {
    setDragging(false);
    setSheetPct(curr => snapTo(curr));
  }, []);

  const isHidden = sheetPct >= (DEFAULT + HIDDEN) / 2;
  const isFull   = sheetPct <= (FULL + DEFAULT) / 2;

  const mapItems = useMemo(() => items.map(it => ({
    ...it,
    imageUrl: it.item_images?.find(img => img.is_primary)?.url
      ?? it.item_images?.[0]?.url
      ?? null,
  })), [items]);

  const displayed = useMemo(() => items.filter(it =>
    (cat === "all" || it.category === cat) &&
    (!search || it.title.includes(search) || it.address.includes(search))
  ), [items, cat, search]);

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  const clearanceDays = useMemo(() => clearanceActive
    ? [...new Set(
        items
          .filter(it => it.pickup_day && it.lat != null && it.lng != null && it.pickup_day >= todayStr)
          .map(it => it.pickup_day!)
      )].sort().slice(0, 4)
    : [], [clearanceActive, items, todayStr]);

  const clearanceRoute = useMemo((): [number,number][] => (clearanceActive && clearanceDay)
    ? items
        .filter(it => it.pickup_day === clearanceDay && it.lat != null && it.lng != null)
        .map(it => [it.lat!, it.lng!])
    : [], [clearanceActive, clearanceDay, items]);

  const onItemClick = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
    setSheetPct(prev => prev >= (DEFAULT + HIDDEN) / 2 ? DEFAULT : prev);
  }, []);

  const onNavigate = useCallback((lat: number, lng: number, title: string) => {
    setExpandedId(null);
    routeDestRef.current = null;
    setNavRoute(null);
    setNavInfo(null);
    setNavSteps([]);
    setCurrentStepIdx(0);
    setNavDest({ lat, lng, title });
    setSheetPct(HIDDEN);
  }, []);
  const hasActiveItems = useMemo(() => displayed.some(it => it.status === "active"), [displayed]);

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
      {/* ── MAP — pitch + bearing handled natively by MapLibre ── */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <GHMap
          userPos={userPos}
          items={mapItems}
          onItemClick={onItemClick}
          selectedItemId={expandedId}
          navRoute={navRoute}
          navDest={navDest}
          centerTrigger={centerTrigger}
          clearanceRoute={clearanceRoute}
          clearanceStreets={clearanceStreets}
          navMode={!!navDest}
          heading={heading}
        />
      </div>

      {/* ── TOP BAR ── */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        zIndex: 10,
      }}>
        {navDest ? (
          /* ── Waze-style navigation banner ── */
          <div style={{
            background: "#16213E",
            color: "white",
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
            direction: "rtl",
          }}>
            {/* Main instruction row */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 16px 8px",
            }}>
              {/* Turn arrow box */}
              <div style={{
                width: 58, height: 58, flexShrink: 0,
                background: "rgba(255,255,255,0.1)",
                borderRadius: 14,
                border: "1.5px solid rgba(255,255,255,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <TurnArrow
                  type={currentStep?.maneuver.type}
                  modifier={currentStep?.maneuver.modifier}
                />
              </div>
              {/* Distance + street name */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 30, fontWeight: 900, lineHeight: 1,
                  fontFamily: "var(--font-display)",
                }}>
                  {currentStep ? fmtDist(distToStep) : (navRoute ? "ממשיך…" : "מחשב…")}
                </div>
                <div style={{
                  fontSize: 14, fontWeight: 600, marginTop: 4,
                  opacity: 0.85, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {currentStep?.name || navDest.title}
                </div>
              </div>
              {/* Cancel button */}
              <button
                onClick={() => {
                  setNavDest(null); setNavRoute(null); setNavInfo(null);
                  setNavSteps([]); setCurrentStepIdx(0);
                  router.replace("/map");
                }}
                style={{
                  padding: "8px 14px", borderRadius: 10, flexShrink: 0,
                  background: "rgba(255,255,255,0.12)",
                  border: "1.5px solid rgba(255,255,255,0.3)",
                  color: "white", cursor: "pointer",
                  fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 13,
                }}
              >✕ בטל</button>
            </div>
            {/* Secondary row — total distance + duration + destination name */}
            <div style={{
              padding: "6px 16px 10px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              borderTop: "1px solid rgba(255,255,255,0.1)",
              fontSize: 12, opacity: 0.65,
            }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "55%" }}>
                {navDest.title}
              </span>
              <span style={{ flexShrink: 0 }}>
                {navInfo
                  ? `${fmtDist(navInfo.dist)} · ${fmtDur(navInfo.dur)}`
                  : "מחשב מסלול…"}
              </span>
            </div>
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
                <span style={{ fontSize: 13 }}>🔥</span>
                פינוי מחר
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

      {/* ── Floating street-clearance button ── */}
      {!navDest && (
        <div style={{
          position: "fixed",
          top: 118,
          left: 12,
          zIndex: 15,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 6,
        }}>
          {/* row: main toggle + day tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* main toggle pill */}
            <button
              onClick={() => setStreetModeActive(a => !a)}
              style={{
                padding: "7px 12px",
                background: streetModeActive ? "var(--ink)" : "rgba(245,242,232,0.95)",
                color: streetModeActive ? "var(--paper)" : "var(--ink)",
                border: "1.5px solid var(--ink)",
                borderRadius: 999,
                fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 12,
                cursor: "pointer",
                boxShadow: "var(--sh-md)",
                display: "flex", alignItems: "center", gap: 5,
                whiteSpace: "nowrap",
              }}
            >
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="5" cy="19" r="2" fill="currentColor" stroke="none"/>
                <circle cx="19" cy="5" r="2" fill="currentColor" stroke="none"/>
                <path d="M5 17V11h14V7" strokeWidth={1.6} strokeDasharray="3 2"/>
              </svg>
              מסלול פינוי
              {streetModeActive && (
                <span style={{
                  background: streetLoading ? "var(--muted)" : streetError ? "var(--accent)" : "#C94B1F",
                  color: "white", borderRadius: 999,
                  fontSize: 10, fontWeight: 800,
                  padding: "1px 6px", marginLeft: 2,
                }}>
                  {streetLoading ? "…" : streetError ? "שגיאה" : streetCount > 0 ? `${streetCount} רח'` : "פעיל"}
                </span>
              )}
            </button>

            {/* day selector — appears to the right when active */}
            {streetModeActive && (
              <>
                {(["היום","מחר","מחרתיים"] as const).map(day => (
                  <button
                    key={day}
                    onClick={() => setStreetModeDay(day)}
                    style={{
                      padding: "6px 11px",
                      background: streetModeDay === day ? "#C94B1F" : "rgba(245,242,232,0.95)",
                      color: streetModeDay === day ? "white" : "var(--ink)",
                      border: `1.5px solid ${streetModeDay === day ? "#C94B1F" : "var(--ink)"}`,
                      borderRadius: 999,
                      fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 12,
                      cursor: "pointer",
                      boxShadow: "var(--sh-sm)",
                      whiteSpace: "nowrap",
                    }}
                  >{day}</button>
                ))}
              </>
            )}
          </div>
        </div>
      )}

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
          background: "var(--paper)",
          border: "2px solid var(--ink)",
          borderRadius: "24px 24px 0 0",
          boxShadow: "0 -6px 0 var(--ink)",
          zIndex: 20,
          display: "flex",
          flexDirection: "column",
          transition: dragging ? "none" : "top 320ms cubic-bezier(0.2,0.7,0.3,1)",
        }}
      >
        {/* drag handle — large touch area */}
        <div
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          style={{
            padding: "20px 0 20px",
            cursor: dragging ? "grabbing" : "grab",
            touchAction: "none",
            userSelect: "none",
            flexShrink: 0,
            width: "100%",
          }}
        >
          <div style={{
            width: 56, height: 5, borderRadius: 3,
            background: dragging ? "var(--accent)" : "var(--ink)",
            margin: "0 auto",
            transition: "background 120ms",
          }} />
        </div>

        {/* sheet header — also draggable */}
        <div
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          style={{
            padding: "4px 20px 12px",
            flexShrink: 0,
            cursor: dragging ? "grabbing" : "grab",
            touchAction: "none",
            userSelect: "none",
          }}
        >
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
          {hasActiveItems && (
            <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500, marginTop: 2 }}>
              מוצג: <span style={{ color: "var(--accent-dark)", fontWeight: 700 }}>עדכני ביותר</span>
            </div>
          )}
        </div>

        {/* items list */}
        <div ref={listRef} style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 16px 100px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          willChange: "transform",
        }}>
          {displayed.length === 0 ? (
            <EmptyState />
          ) : (
            <ItemList
              displayed={displayed}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              onNavigate={onNavigate}
            />
          )}
        </div>
      </div>

      {/* ── TAB BAR ── */}
      <div style={{ zIndex: 30 }}>
        <TabBar />
      </div>

      <NotificationsPopup
        visible={showNotifPopup}
        onClose={() => setShowNotifPopup(false)}
      />
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
const PHOTO_BG = [
  "var(--primary-light)", "var(--warning-tint)", "var(--accent-tint)",
  "var(--paper-2)", "var(--info-tint)",
];

interface CardProps {
  item: Item;
  expandedId: string | null;
  setExpandedId: React.Dispatch<React.SetStateAction<string | null>>;
  onNavigate: (lat: number, lng: number, title: string) => void;
}

interface ListProps {
  displayed: Item[];
  expandedId: string | null;
  setExpandedId: React.Dispatch<React.SetStateAction<string | null>>;
  onNavigate: (lat: number, lng: number, title: string) => void;
}

const ItemList = memo(function ItemList({ displayed, expandedId, setExpandedId, onNavigate }: ListProps) {
  return (
    <>
      {displayed.map(item => (
        <GHItemCard
          key={item.id}
          item={item}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
});

const GHItemCard = memo(function GHItemCard({ item, expandedId, setExpandedId, onNavigate }: CardProps) {
  const router = useRouter();
  const [imgIdx, setImgIdx] = useState(0);
  const [drag, setDrag]     = useState(0);
  const dragStartRef        = useRef<number | null>(null);

  const isExpanded = expandedId === item.id;
  const dim        = expandedId !== null && expandedId !== item.id;
  const cardRef    = useRef<HTMLDivElement | null>(null);

  const emoji   = CAT_EMOJI[item.category] ?? "📦";
  const bgColor = CAT_COLOR[item.category] ?? "var(--paper-2)";
  const age     = timeAgo(item.created_at);
  const photos  = [...(item.item_images ?? [])].sort((a, b) => a.position - b.position);
  const primaryPhoto = photos.find(i => i.is_primary)?.url ?? photos[0]?.url ?? null;
  const n = photos.length;

  const todayStr    = new Date().toISOString().split("T")[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const isUrgent    = item.pickup_day === todayStr || item.pickup_day === tomorrowStr;
  const urgentText  = item.pickup_day === todayStr ? "🔥 פינוי היום" : "🔥 פינוי מחר";
  const isTaken     = item.status === "taken";

  useEffect(() => {
    if (!isExpanded) { setImgIdx(0); setDrag(0); dragStartRef.current = null; return; }
    const t = setTimeout(() => {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 340);
    return () => clearTimeout(t);
  }, [isExpanded]);

  /* close when scrolled out of view */
  useEffect(() => {
    if (!isExpanded || !cardRef.current) return;
    let hasBeenVisible = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        hasBeenVisible = true;
      } else if (hasBeenVisible) {
        setExpandedId(null);
      }
    }, { threshold: 0.1 });
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [isExpanded, setExpandedId]);

  const step      = (d: number) => setImgIdx(i => (i + d + Math.max(n, 1)) % Math.max(n, 1));
  const onPtrDown = (e: React.PointerEvent) => { dragStartRef.current = e.clientX; };
  const onPtrMove = (e: React.PointerEvent) => {
    if (dragStartRef.current == null) return;
    setDrag(e.clientX - dragStartRef.current);
  };
  const onPtrUp = () => {
    if (dragStartRef.current == null) return;
    const d = drag; dragStartRef.current = null; setDrag(0);
    if (Math.abs(d) > 48) step(d > 0 ? 1 : -1);
  };

  const currentUrl = photos[imgIdx]?.url ?? null;
  const photoBg    = PHOTO_BG[imgIdx % PHOTO_BG.length];

  if (isExpanded) {
    return (
      <div ref={cardRef} style={{
        background: "var(--surface)", borderRadius: 18,
        border: "2.5px solid var(--ink)", boxShadow: "5px 5px 0 var(--shadow-ink)",
        overflow: "hidden", flexShrink: 0,
        animation: "ghBloom .4s cubic-bezier(.22,1,.36,1)",
      }}>
        {/* hero gallery */}
        <div
          onPointerDown={onPtrDown} onPointerMove={onPtrMove}
          onPointerUp={onPtrUp} onPointerLeave={onPtrUp}
          style={{ position: "relative", touchAction: "pan-y", userSelect: "none" }}
        >
          <div style={{ overflow: "hidden", borderBottom: "2px solid var(--ink)" }}>
            <div style={{
              height: 240,
              background: currentUrl ? "var(--paper-2)" : photoBg,
              display: "flex", alignItems: "center", justifyContent: "center",
              transform: `translateX(${drag}px)`,
              transition: dragStartRef.current == null
                ? "transform .3s cubic-bezier(.22,1,.36,1)" : "none",
            }}>
              {currentUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentUrl} alt={item.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 96 }}>{emoji}</span>
              )}
            </div>
          </div>

          {/* arrows */}
          {n > 1 && (
            <>
              <button onClick={e => { e.stopPropagation(); step(1); }} style={{
                position: "absolute", top: "50%", transform: "translateY(-50%)",
                right: 8, width: 30, height: 30,
                background: "transparent", border: "none", padding: 0,
                cursor: "pointer", fontSize: 24, fontWeight: 800,
                color: "var(--ink)", lineHeight: 1, zIndex: 3,
              }}>‹</button>
              <button onClick={e => { e.stopPropagation(); step(-1); }} style={{
                position: "absolute", top: "50%", transform: "translateY(-50%)",
                left: 8, width: 30, height: 30,
                background: "transparent", border: "none", padding: 0,
                cursor: "pointer", fontSize: 24, fontWeight: 800,
                color: "var(--ink)", lineHeight: 1, zIndex: 3,
              }}>›</button>
            </>
          )}

          {/* dots */}
          {n > 1 && (
            <div style={{
              position: "absolute", bottom: 10, left: 0, right: 0, zIndex: 3,
              display: "flex", gap: 5, justifyContent: "center",
            }}>
              {photos.map((_, i) => (
                <span key={i} style={{
                  display: "inline-block",
                  width: i === imgIdx ? 16 : 6, height: 6, borderRadius: 3,
                  background: i === imgIdx ? "var(--ink)" : "rgba(45,42,36,0.4)",
                  border: "1px solid var(--ink)", transition: "width .2s ease",
                }} />
              ))}
            </div>
          )}

          {/* share + close */}
          <div style={{
            position: "absolute", top: 10, left: 10, display: "flex", gap: 8, zIndex: 3,
          }}>
            <button
              title="שתף"
              onClick={e => {
                e.stopPropagation();
                if (typeof navigator !== "undefined" && navigator.share) {
                  navigator.share({ title: item.title, url: `${window.location.origin}/items/${item.id}` });
                }
              }}
              style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "var(--surface)", border: "2px solid var(--ink)",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/>
                <circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
            <button
              onClick={e => { e.stopPropagation(); setExpandedId(null); }}
              style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "var(--surface)", border: "2px solid var(--ink)",
                cursor: "pointer", fontSize: 15, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >✕</button>
          </div>

          {/* urgent / taken pill */}
          {isTaken ? (
            <div style={{ position: "absolute", top: 10, right: 10, zIndex: 3 }}>
              <span style={{
                background: "var(--paper-2)", color: "var(--muted)",
                border: "1.5px solid var(--ink)", borderRadius: 999,
                fontSize: 11, fontWeight: 700, padding: "5px 10px",
              }}>⏳ סומן כנלקח</span>
            </div>
          ) : isUrgent && (
            <div style={{ position: "absolute", top: 10, right: 10, zIndex: 3 }}>
              <span style={{
                background: "var(--accent-tint)", color: "var(--accent-dark)",
                border: "1.5px solid var(--accent)", borderRadius: 999,
                fontSize: 11, fontWeight: 700, padding: "5px 10px",
              }}>{urgentText}</span>
            </div>
          )}
        </div>

        {/* body */}
        <div style={{ padding: 12 }}>
          <div style={{
            fontFamily: "var(--font-display)", fontWeight: 700,
            fontSize: 22, lineHeight: 1.15,
          }}>{item.title}</div>
          <div style={{
            marginTop: 6, fontSize: 12.5, color: "var(--muted)",
            fontWeight: 500, display: "flex", flexWrap: "wrap", gap: 6,
          }}>
            <span>📍 {item.address.split(",")[0]}</span>
            <span>·</span>
            <span>{age}</span>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{
              padding: "2px 8px", borderRadius: 999,
              background: "var(--paper-2)", border: "1.5px solid var(--ink)",
              fontSize: 11, fontWeight: 700,
            }}>{item.condition}</span>
          </div>
          {/* actions */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              disabled={item.lat == null || item.lng == null}
              onClick={() => item.lat != null && item.lng != null &&
                onNavigate(item.lat, item.lng, item.title)}
              style={{
                flex: 1, height: 44, padding: "0 16px",
                background: "var(--primary)", color: "var(--ink)",
                border: "2px solid var(--ink)", borderRadius: "var(--r-md)",
                boxShadow: "var(--sh-md)", fontFamily: "var(--font-sans)",
                fontWeight: 700, fontSize: 14, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                opacity: item.lat == null ? 0.5 : 1,
              }}
            >
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 11 22 2 13 21 11 13 3 11"/>
              </svg>
              נווט
            </button>
            <button
              title="צ'אט על הפריט"
              onClick={() => router.push(`/chat/${item.id}`)}
              style={{
                width: 44, height: 44, flexShrink: 0,
                background: "var(--surface)", color: "var(--ink)",
                border: "2px solid var(--ink)", borderRadius: "var(--r-md)",
                boxShadow: "var(--sh-sm)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* collapsed row */
  return (
    <button
      onClick={() => setExpandedId(item.id)}
      className="gh-item-card"
      style={{
        display: "flex", gap: 12, padding: 12,
        background: "var(--surface)", border: "2px solid var(--ink)",
        borderRadius: 16, boxShadow: "var(--sh-md)",
        cursor: "pointer", textAlign: "right", width: "100%",
        fontFamily: "var(--font-sans)",
        opacity: dim ? 0.5 : 1,
        transition: expandedId !== null ? "opacity .3s ease" : "none",
      }}
    >
      {primaryPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={primaryPhoto} alt={item.title} loading="lazy" style={{
          width: 72, height: 72, borderRadius: 12, flexShrink: 0,
          objectFit: "cover", border: "2px solid var(--ink)", boxShadow: "var(--sh-sm)",
        }} />
      ) : (
        <div style={{
          width: 72, height: 72, borderRadius: 12,
          background: bgColor, border: "2px solid var(--ink)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 36, flexShrink: 0, boxShadow: "var(--sh-sm)",
        }}>{emoji}</div>
      )}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
          <div style={{
            fontFamily: "var(--font-display)", fontWeight: 900,
            fontSize: 15, lineHeight: 1.2, color: "var(--ink)",
          }}>{item.title}</div>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
            stroke="var(--muted)" strokeWidth={2} strokeLinecap="round"
            style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>
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
            background: "var(--paper-2)", border: "1.5px solid var(--ink)",
            fontSize: 11, fontWeight: 700,
          }}>{item.condition}</span>
          {isTaken ? (
            <span style={{
              padding: "2px 8px", borderRadius: 999,
              background: "var(--paper-2)", border: "1.5px solid var(--ink)",
              fontSize: 11, fontWeight: 700, color: "var(--muted)",
            }}>⏳ סומן כנלקח</span>
          ) : isUrgent && (
            <span style={{
              padding: "2px 8px", borderRadius: 999,
              background: "var(--accent-tint)", border: "1.5px solid var(--accent)",
              fontSize: 11, fontWeight: 700, color: "var(--accent-dark)",
            }}>{urgentText}</span>
          )}
        </div>
      </div>
    </button>
  );
});

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
