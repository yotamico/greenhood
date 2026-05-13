"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { NES_ZIONA_STREETS, Street } from "@/lib/nes-ziona-streets";
import { Report } from "@/lib/supabase";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const NES_ZIONA: [number, number] = [31.9297, 34.8307];
const HEBREW_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const GMAPS_MAX_WAYPOINTS = 23;

type LatLng  = [number, number];
type GeomMap = Record<string, LatLng[]>;

interface StreetWithGeom { name: string; collection_day: string; coords: LatLng[] }
interface RouteInfo { km: string; time: string; gmapsUrl: string }

interface Props {
  filterType:    string;
  reports:       Report[];
  targetStreet?: Street | null;
  onUserPos?:    (pos: LatLng) => void;
}

// ── helpers ──

function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const φ1 = a[0] * Math.PI / 180, φ2 = b[0] * Math.PI / 180;
  const Δφ = (b[0] - a[0]) * Math.PI / 180;
  const Δλ = (b[1] - a[1]) * Math.PI / 180;
  const x = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)} מ'` : `${(m / 1000).toFixed(1)} ק"מ`;
}

function midpoint(coords: LatLng[]): LatLng {
  return coords[Math.floor(coords.length / 2)];
}

function dist2(a: LatLng, b: LatLng) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

function nearestNeighborTSP(points: LatLng[], startIdx = 0): number[] {
  const n = points.length;
  const visited = new Array(n).fill(false);
  const order = [startIdx];
  visited[startIdx] = true;
  for (let step = 1; step < n; step++) {
    const last = order[order.length - 1];
    let best = -1, bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && dist2(points[last], points[i]) < bestD) {
        bestD = dist2(points[last], points[i]); best = i;
      }
    }
    visited[best] = true;
    order.push(best);
  }
  return order;
}

function fmtRoute(meters: number, seconds: number) {
  const km   = (meters / 1000).toFixed(1);
  const mins = Math.round(seconds / 60);
  const time = mins < 60
    ? `${mins} ד'`
    : `${Math.floor(mins / 60)} ש' ${mins % 60} ד'`;
  return { km, time };
}

// ── OSRM /route ──
async function fetchOSRMRoute(
  waypoints: LatLng[]
): Promise<{ route: LatLng[]; dist: number; dur: number } | null> {
  if (waypoints.length < 2) return null;
  const coords = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) return null;
    const r = data.routes[0];
    return {
      route: r.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as LatLng),
      dist:  r.distance,
      dur:   r.duration,
    };
  } catch { return null; }
}

// ── OSRM /trip: TSP על הרשת האמיתית ──
async function fetchOSRMTrip(
  waypoints: LatLng[],
  startPos?: LatLng | null
): Promise<{ route: LatLng[]; order: number[]; dist: number; dur: number } | null> {
  if (waypoints.length < 2) return null;

  let pts = [...waypoints];
  let remapToOrig = pts.map((_, i) => i);

  if (startPos) {
    const nearIdx = pts.reduce((best, c, i) =>
      dist2(c, startPos) < dist2(pts[best], startPos) ? i : best, 0);
    const reordered = [nearIdx, ...pts.map((_, i) => i).filter(i => i !== nearIdx)];
    pts = reordered.map(i => waypoints[i]);
    remapToOrig = reordered;
  }

  const coordStr = pts.map(([lat, lng]) => `${lng},${lat}`).join(";");
  const source   = startPos ? "first" : "any";
  const url = `https://router.project-osrm.org/trip/v1/driving/${coordStr}` +
              `?roundtrip=false&source=${source}&destination=any&geometries=geojson&overview=full`;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.trips?.[0]) return null;

    const route: LatLng[] = data.trips[0].geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng] as LatLng
    );
    const visitOrder: number[] = new Array(data.waypoints.length);
    (data.waypoints as { waypoint_index: number }[]).forEach((wp, inputIdx) => {
      visitOrder[wp.waypoint_index] = inputIdx;
    });

    return {
      route,
      order: visitOrder.map(i => remapToOrig[i]),
      dist:  data.trips[0].distance,
      dur:   data.trips[0].duration,
    };
  } catch { return null; }
}

// ── URL Google Maps ──
function buildGmapsUrl(streets: StreetWithGeom[], order: number[], userPos?: LatLng | null): string {
  const pts = order
    .map(i => streets[i])
    .filter(Boolean)
    .map(s => midpoint(s.coords))
    .slice(0, GMAPS_MAX_WAYPOINTS + 2);
  if (!pts.length) return "";
  const origin  = userPos ? `${userPos[0]},${userPos[1]}` : `${pts[0][0]},${pts[0][1]}`;
  const dest    = pts[pts.length - 1];
  const middle  = userPos ? pts : pts.slice(1, -1);
  const wpParam = middle.map(([la, ln]) => `${la},${ln}`).join("|");
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest[0]},${dest[1]}&travelmode=driving`;
  if (wpParam) url += `&waypoints=${encodeURIComponent(wpParam)}`;
  return url;
}

// ── אייקונים ──
function stopIcon(n: number) {
  return L.divIcon({
    html: `<div style="width:26px;height:26px;border-radius:50%;background:#1a73e8;color:#fff;
      font-weight:800;font-size:11px;display:flex;align-items:center;justify-content:center;
      border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.5);
      font-family:'Heebo',sans-serif;">${n}</div>`,
    iconSize: [26, 26], iconAnchor: [13, 13], className: "",
  });
}

const REPORT_COLORS: Record<string, string> = {
  "גזם":      "#22c55e",
  "גרוטאות": "#f97316",
  "ריהוט":   "#8b5cf6",
  "אחר":     "#6b7280",
};
const REPORT_EMOJI: Record<string, string> = {
  "גזם":      "🌿",
  "גרוטאות": "🔧",
  "ריהוט":   "🛋️",
  "אחר":     "📦",
};

function reportIcon(type: string) {
  const color = REPORT_COLORS[type] ?? "#6b7280";
  const emoji = REPORT_EMOJI[type]  ?? "📦";
  return L.divIcon({
    html: `<div style="width:34px;height:34px;border-radius:50%;background:${color};
      display:flex;align-items:center;justify-content:center;font-size:17px;
      border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);">${emoji}</div>`,
    iconSize: [34, 34], iconAnchor: [17, 17], className: "",
  });
}

const userDotIcon = L.divIcon({
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;
    border:3px solid #fff;box-shadow:0 0 0 2px #3b82f6,0 2px 8px rgba(59,130,246,0.5)"></div>`,
  iconSize: [14, 14], iconAnchor: [7, 7], className: "",
});

// ── sub-components ──
function SetMapRef({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  mapRef.current = map;
  return null;
}

function LiveLocation({ onLocated }: { onLocated: (pos: LatLng) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!navigator.geolocation) { map.flyTo(NES_ZIONA, 14, { duration: 1 }); return; }
    let firstFly = true;
    const id = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const pos: LatLng = [coords.latitude, coords.longitude];
        onLocated(pos);
        if (firstFly) {
          firstFly = false;
          map.flyTo(pos, 17, { duration: 1.2 });
        }
      },
      () => { if (firstFly) map.flyTo(NES_ZIONA, 14, { duration: 1 }); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function timeAgo(iso: string): string {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1)  return "פחות משעה";
  if (h < 24) return `לפני ${h} ש'`;
  return `לפני ${Math.floor(h / 24)} ימים`;
}

// ── קומפוננט ראשי ──
export default function EcoMap({ filterType, reports, targetStreet, onUserPos }: Props) {
  const [userPos,     setUserPos]     = useState<LatLng | null>(null);
  const [geomMap,     setGeomMap]     = useState<GeomMap>({});
  const [osrmRoute,   setOsrmRoute]   = useState<LatLng[] | null>(null);
  const [streetOrder, setStreetOrder] = useState<number[]>([]);
  const [routeInfo,   setRouteInfo]   = useState<RouteInfo | null>(null);
  const [status,      setStatus]      = useState<"loading" | "routing" | "ready" | "error">("loading");
  const [recentering, setRecentering] = useState(false);
  const [navMode,     setNavMode]     = useState(false);
  const mapRef = useRef<L.Map | null>(null);

  const today = HEBREW_DAYS[new Date().getDay()];
  const todayStreets = useMemo(
    () => NES_ZIONA_STREETS.filter(s => s.takeout_day === today),
    [today]
  );

  useEffect(() => {
    fetch("/nes-ziona-geometry.json")
      .then(r => r.json())
      .then((data: GeomMap) => { setGeomMap(data); setStatus("routing"); })
      .catch(() => setStatus("error"));
  }, []);

  const streetsWithGeom = useMemo(
    () => todayStreets
      .map(s => ({ name: s.name, collection_day: s.collection_day, coords: geomMap[s.name] }))
      .filter(s => s.coords?.length > 0),
    [todayStreets, geomMap]
  );

  useEffect(() => {
    if (status !== "routing" || streetsWithGeom.length === 0) {
      if (status === "routing") setStatus("ready");
      return;
    }
    const centers = streetsWithGeom.map(s => midpoint(s.coords));

    (async () => {
      const tripResult = await fetchOSRMTrip(centers, userPos);
      if (tripResult) {
        setOsrmRoute(tripResult.route);
        setStreetOrder(tripResult.order);
        const { km, time } = fmtRoute(tripResult.dist, tripResult.dur);
        setRouteInfo({ km, time, gmapsUrl: buildGmapsUrl(streetsWithGeom, tripResult.order, userPos) });
      } else {
        const startIdx = userPos
          ? centers.reduce((best, c, i) =>
              dist2(c, userPos) < dist2(centers[best], userPos) ? i : best, 0)
          : 0;
        const order      = nearestNeighborTSP(centers, startIdx);
        const orderedPts = order.map(i => centers[i]);
        const result     = await fetchOSRMRoute(orderedPts);
        if (result) {
          setOsrmRoute(result.route);
          const { km, time } = fmtRoute(result.dist, result.dur);
          setRouteInfo({ km, time, gmapsUrl: buildGmapsUrl(streetsWithGeom, order, userPos) });
        }
        setStreetOrder(order);
      }
      setStatus("ready");
    })();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── follow mode ──
  useEffect(() => {
    if (!navMode || !userPos || !mapRef.current) return;
    mapRef.current.setView(userPos, Math.max(mapRef.current.getZoom(), 17), { animate: true, duration: 0.5 });
  }, [userPos, navMode]);

  // ── עצירה הבאה ──
  const nextStop = useMemo(() => {
    if (!userPos || !streetOrder.length || !streetsWithGeom.length) return null;
    return streetOrder
      .map(i => streetsWithGeom[i])
      .filter(Boolean)
      .reduce((closest, s) =>
        haversine(userPos, midpoint(s.coords)) < haversine(userPos, midpoint(closest.coords)) ? s : closest
      );
  }, [userPos, streetOrder, streetsWithGeom]);

  // ── flyTo כשנבחר רחוב מהחיפוש ──
  useEffect(() => {
    if (!targetStreet || !mapRef.current) return;
    const geom = geomMap[targetStreet.name];
    const pos: LatLng | null = geom?.length
      ? midpoint(geom)
      : targetStreet.lat && targetStreet.lng
        ? [targetStreet.lat, targetStreet.lng]
        : null;
    if (pos) mapRef.current.flyTo(pos, 16, { duration: 0.8 });
  }, [targetStreet, geomMap]);

  function recenter() {
    const map = mapRef.current;
    if (!map) return;
    if (userPos) {
      map.flyTo(userPos, 17, { duration: 0.8 });
      return;
    }
    setRecentering(true);
    map.locate({ setView: true, maxZoom: 17, enableHighAccuracy: true, maximumAge: 0 });
    map.once("locationfound", (e: L.LocationEvent) => {
      const pos: LatLng = [e.latlng.lat, e.latlng.lng];
      setUserPos(pos);
      onUserPos?.(pos);
      setRecentering(false);
    });
    map.once("locationerror", () => setRecentering(false));
  }

  function handleLocated(pos: LatLng) {
    setUserPos(pos);
    onUserPos?.(pos);
  }

  const badgeText =
    status === "loading"  ? "טוען נתונים..." :
    status === "routing"  ? "מחשב מסלול..." :
    status === "error"    ? "שגיאה בטעינה" :
    `${streetsWithGeom.length} עצירות • ${today}`;

  const visibleReports = filterType === "all"
    ? reports
    : reports.filter(r => (r.category ?? r.item_type) === filterType);

  return (
    <>
      <style>{mapStyles}</style>
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <MapContainer
          center={NES_ZIONA}
          zoom={13}
          style={{ width: "100%", height: "100%" }}
          zoomControl={false}
        >
          <SetMapRef mapRef={mapRef} />
          <LiveLocation onLocated={handleLocated} />

          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
            maxZoom={19}
          />

          {/* רחובות היום — צהוב (מתחת לקו ניווט) */}
          {streetsWithGeom.map(s => (
            <Polyline
              key={s.name}
              positions={s.coords}
              pathOptions={{ color: "#f59e0b", weight: 5, opacity: 0.5, lineCap: "round", lineJoin: "round" }}
            >
              <Popup className="eco-popup">
                <div className="popup-inner" dir="rtl">
                  <p className="popup-chip">הוצאה: {today}</p>
                  <h3 className="popup-street">{s.name}</h3>
                  <p className="popup-sub">פינוי: {s.collection_day}</p>
                </div>
              </Popup>
            </Polyline>
          ))}

          {/* קו מסלול — סגנון Google Maps */}
          {osrmRoute && osrmRoute.length > 1 && (
            <>
              <Polyline
                positions={osrmRoute}
                pathOptions={{ color: "#ffffff", weight: 11, opacity: 0.9, lineCap: "round", lineJoin: "round" }}
              />
              <Polyline
                positions={osrmRoute}
                pathOptions={{ color: "#1a73e8", weight: 7, opacity: 1.0, lineCap: "round", lineJoin: "round" }}
              />
            </>
          )}

          {/* מרקרי עצירות ממוספרות */}
          {streetOrder.map((streetIdx, visitNum) => {
            const s = streetsWithGeom[streetIdx];
            if (!s) return null;
            return (
              <Marker key={s.name} position={midpoint(s.coords)} icon={stopIcon(visitNum + 1)}>
                <Popup className="eco-popup">
                  <div className="popup-inner" dir="rtl">
                    <p className="popup-chip">עצירה {visitNum + 1}</p>
                    <h3 className="popup-street">{s.name}</h3>
                    <p className="popup-sub">פינוי: {s.collection_day}</p>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* מרקרי דיווחים */}
          {visibleReports.map(r => r.lat != null && r.lng != null && (
            <Marker
              key={r.id}
              position={[r.lat, r.lng]}
              icon={reportIcon(r.category ?? r.item_type)}
            >
              <Popup className="eco-popup">
                <div className="popup-inner" dir="rtl">
                  <p className="popup-chip">
                    {REPORT_EMOJI[r.category ?? r.item_type] ?? "📦"} {r.item_type}
                    {r.category ? ` · ${r.category}` : ""}
                  </p>
                  <h3 className="popup-street">{r.street_name}</h3>
                  <p className="popup-sub">
                    פינוי: {r.collection_day ?? "—"} · {timeAgo(r.created_at)}
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}

          {userPos && <Marker position={userPos} icon={userDotIcon} />}
        </MapContainer>

        {/* כפתור recenter */}
        <button
          className={`recenter-btn${recentering ? " recentering" : ""}`}
          onClick={recenter}
          title="חזור למיקום שלי"
          disabled={recentering}
        >
          {recentering ? (
            <span className="recenter-spinner" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="4" fill="currentColor" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          )}
        </button>

        {/* בר ניווט פעיל */}
        {navMode && nextStop && userPos && (
          <div className="nav-bar" dir="rtl">
            <span className="nav-icon">🧭</span>
            <div className="nav-info">
              <span className="nav-street">{nextStop.name}</span>
              <span className="nav-dist">{fmtDist(haversine(userPos, midpoint(nextStop.coords)))}</span>
            </div>
            <button className="nav-stop-btn" onClick={() => setNavMode(false)}>✕</button>
          </div>
        )}

        {/* Badge יום */}
        <div className="day-badge" dir="rtl" style={navMode ? { top: 62 } : undefined}>
          <span className={`day-dot${status === "routing" ? " spinning" : ""}`} />
          {badgeText}
        </div>

        {/* בר מסלול תחתי */}
        {status === "ready" && routeInfo && (
          <div className="route-bar" dir="rtl">
            <div className="route-stats">
              <span className="route-km">{routeInfo.km} ק"מ</span>
              <span className="route-sep">|</span>
              <span className="route-time">{routeInfo.time}</span>
            </div>
            <button
              className={`route-nav-btn${navMode ? " nav-active" : ""}`}
              onClick={() => {
                setNavMode(v => !v);
                if (!navMode && userPos && mapRef.current) {
                  mapRef.current.flyTo(userPos, 17, { duration: 0.8 });
                }
              }}
            >
              {navMode ? "⏹ עצור ניווט" : "▶ נווט"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

const mapStyles = `
  .recenter-btn {
    position: absolute; bottom: 72px; left: 16px; z-index: 1000;
    width: 40px; height: 40px; border-radius: 10px;
    background: #1a1d27; border: 1px solid #2e3348; color: #38e07b;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 12px rgba(0,0,0,0.4); transition: background 0.15s, transform 0.1s; padding: 8px;
  }
  .recenter-btn:hover  { background: #22263a; transform: scale(1.05); }
  .recenter-btn:active { transform: scale(0.97); }
  .recenter-btn.recentering { opacity: 0.7; cursor: default; }
  .recenter-spinner {
    width: 18px; height: 18px; border-radius: 50%;
    border: 2px solid #2e3348; border-top-color: #38e07b;
    animation: spin 0.8s linear infinite; display: block;
  }

  .day-badge {
    position: absolute; top: 12px; left: 12px; z-index: 1000;
    background: #1a1d27dd; border: 1px solid #2e3348; border-radius: 20px;
    padding: 5px 12px; font-size: 12px; font-weight: 600; color: #e8eaf2;
    font-family: 'Heebo', sans-serif; display: flex; align-items: center; gap: 7px;
    backdrop-filter: blur(6px);
  }
  .day-dot {
    width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; flex-shrink: 0;
    animation: pulse 1.8s ease-in-out infinite;
  }
  .day-dot.spinning {
    background: transparent; border: 2px solid #f59e0b; border-top-color: transparent;
    animation: spin 1s linear infinite;
  }

  .route-bar {
    position: absolute; bottom: 0; left: 0; right: 0; z-index: 1000;
    background: #1a1d27f0; border-top: 1px solid #2e3348;
    padding: 10px 16px; display: flex; align-items: center; justify-content: space-between;
    backdrop-filter: blur(8px); font-family: 'Heebo', sans-serif;
  }
  .route-stats { display: flex; align-items: center; gap: 10px; }
  .route-km   { font-size: 18px; font-weight: 900; color: #e8eaf2; }
  .route-sep  { color: #2e3348; font-size: 16px; }
  .route-time { font-size: 14px; font-weight: 600; color: #7880a0; }
  .route-nav-btn {
    display: flex; align-items: center; gap: 6px;
    background: #1a73e8; color: #fff; border-radius: 10px;
    padding: 8px 14px; font-size: 14px; font-weight: 700;
    text-decoration: none; transition: opacity 0.15s;
  }
  .route-nav-btn:hover { opacity: 0.9; }

  .nav-bar {
    position: absolute; top: 0; left: 0; right: 0; z-index: 1002;
    background: #1a73e8; padding: 10px 16px;
    display: flex; align-items: center; gap: 12px;
    font-family: 'Heebo', sans-serif;
    box-shadow: 0 2px 12px rgba(26,115,232,0.5);
  }
  .nav-icon { font-size: 22px; flex-shrink: 0; }
  .nav-info { flex: 1; display: flex; flex-direction: column; gap: 1px; }
  .nav-street { font-size: 16px; font-weight: 800; color: #fff; }
  .nav-dist   { font-size: 13px; color: rgba(255,255,255,0.75); font-weight: 600; }
  .nav-stop-btn {
    background: rgba(255,255,255,0.2); border: none; color: #fff;
    border-radius: 50%; width: 28px; height: 28px; font-size: 14px;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .route-nav-btn.nav-active { background: #ef4444; }

  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }
  @keyframes spin  { to { transform: rotate(360deg); } }

  .eco-popup .leaflet-popup-content-wrapper {
    background: #1a1d27; border: 1px solid #2e3348; border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5); padding: 0; overflow: hidden; min-width: 160px;
  }
  .eco-popup .leaflet-popup-content { margin: 0; line-height: 1; }
  .eco-popup .leaflet-popup-tip-container .leaflet-popup-tip { background: #1a1d27; }
  .eco-popup .leaflet-popup-close-button { color: #7880a0 !important; font-size: 18px !important; top: 8px !important; right: 8px !important; }
  .popup-inner { padding: 12px; display: flex; flex-direction: column; gap: 5px; font-family: 'Heebo', sans-serif; }
  .popup-chip   { font-size: 10px; font-weight: 600; color: #1a73e8; margin: 0; }
  .popup-street { font-size: 16px; font-weight: 900; color: #e8eaf2; margin: 0; }
  .popup-sub    { font-size: 11px; color: #7880a0; margin: 0; }

  .leaflet-control-attribution { background: rgba(15,17,23,0.8) !important; color: #4a5070 !important; font-size: 9px !important; }
  .leaflet-control-attribution a { color: #4a5070 !important; }
`;
