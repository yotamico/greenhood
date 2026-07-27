"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/* CARTO positron vector style — same visual language as the existing tiles, free */
const CARTO_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

/* RTL text plugin — exact URL from MapLibre v5 official docs */
try {
  maplibregl.setRTLTextPlugin(
    "https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.3.0/dist/mapbox-gl-rtl-text.js",
    false,
  );
} catch { /* already registered */ }
const NES_ZIONA: maplibregl.LngLatLike = [34.8307, 31.9297];

const CAT_PIN: Record<string, { emoji: string; bg: string }> = {
  furniture:   { emoji: "🪑", bg: "#F0DBC0" },
  books:       { emoji: "📚", bg: "#C9D8E2" },
  lighting:    { emoji: "💡", bg: "#F0D5CB" },
  plants:      { emoji: "🌿", bg: "#A8C496" },
  sports:      { emoji: "⚽", bg: "#C9D8E2" },
  electronics: { emoji: "📺", bg: "#EDE6D2" },
  kitchen:     { emoji: "🍳", bg: "#F0DBC0" },
  kids:        { emoji: "🧸", bg: "#F0D5CB" },
};

function makePinEl(emoji: string, bg: string, imageUrl?: string | null, dimmed?: boolean): HTMLElement {
  const S = 44;
  // MapLibre overwrites style.transform on the element it receives — keep the wrapper clean
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `width:${S}px;height:${S}px;cursor:pointer;${dimmed ? "opacity:0.45;" : ""}`;

  const inner = document.createElement("div");
  inner.style.cssText = `width:${S}px;height:${S}px;background:${bg};border:2.5px solid #2D2A24;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:2px 2px 0 rgba(45,42,36,0.18);display:flex;align-items:center;justify-content:center;overflow:hidden;`;

  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.style.cssText = `width:${S}px;height:${S}px;object-fit:cover;transform:rotate(45deg);`;
    inner.appendChild(img);
  } else {
    const span = document.createElement("span");
    span.style.cssText = "transform:rotate(45deg);font-size:19px;line-height:1;";
    span.textContent = emoji;
    inner.appendChild(span);
  }

  wrapper.appendChild(inner);
  return wrapper;
}

/* user-position marker — plain pulsing dot while browsing, a forward-pointing arrow while
   navigating. The arrow doesn't need its own rotation: in nav mode the map bearing itself
   tracks heading (see the camera-follow effect below), so "up" on screen already means
   "direction of travel" — the arrow just needs to point up. */
function userDotHTML(navMode: boolean): string {
  if (navMode) {
    return `
      <div style="position:relative;width:26px;height:26px;">
        <div style="position:absolute;inset:-4px;border-radius:50%;background:#6B8FA8;opacity:0.2;"></div>
        <svg width="26" height="26" viewBox="0 0 26 26" style="position:absolute;inset:0;">
          <path d="M13 2 L21 22 L13 17 L5 22 Z" fill="#6B8FA8" stroke="#2D2A24" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      </div>`;
  }
  return `
    <div style="position:relative;width:22px;height:22px;">
      <div style="position:absolute;inset:0;border-radius:50%;background:#6B8FA8;
        opacity:0.25;animation:ghPulse 2s ease-out infinite;transform-origin:center;"></div>
      <div style="position:absolute;inset:2px;border-radius:50%;background:#6B8FA8;
        border:2.5px solid #2D2A24;box-shadow:0 0 0 3px white;"></div>
    </div>`;
}

function toLineGeoJSON(coords: [number, number][]) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: coords.map(([lat, lng]) => [lng, lat]),
    },
  };
}

interface Item {
  id: string; title: string; category: string; status?: string;
  lat: number | null; lng: number | null;
  imageUrl?: string | null;
}
interface NavDest { lat: number; lng: number; title: string; }

interface Props {
  userPos:           [number, number] | null;
  items:             Item[];
  onItemClick?:      (id: string) => void;
  selectedItemId?:   string | null;
  navRoute?:         [number, number][] | null;
  navDest?:          NavDest | null;
  centerTrigger?:    number;
  clearanceRoute?:   [number, number][];
  clearanceStreets?: [number, number][][];
  navMode?:          boolean;
  heading?:          number | null;
}

export default function GHMapLibre({
  userPos, items, onItemClick, selectedItemId,
  navRoute, navDest,
  centerTrigger = 0,
  clearanceRoute, clearanceStreets,
  navMode = false,
  heading = null,
}: Props) {
  const containerRef       = useRef<HTMLDivElement>(null);
  const mapRef             = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const userMarkerRef      = useRef<maplibregl.Marker | null>(null);
  const destMarkerRef      = useRef<maplibregl.Marker | null>(null);
  const itemMarkersRef     = useRef<Map<string, maplibregl.Marker>>(new Map());
  const itemStatusRef      = useRef<Map<string, string>>(new Map());
  const prevTriggerRef     = useRef(0);

  /* nav-mode camera: target (latest fix, look-ahead applied) vs. rendered (eased every frame) */
  type CameraPose = { lat: number; lng: number; heading: number; zoom: number; pitch: number };
  const targetRef       = useRef<CameraPose | null>(null);
  const renderedRef      = useRef<CameraPose | null>(null);
  const rafIdRef          = useRef<number | null>(null);
  const lastFrameTsRef    = useRef<number | null>(null);
  const manualFlyActiveRef = useRef(false);

  /* ── init ── */
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: CARTO_STYLE,
      center: userPos ? [userPos[1], userPos[0]] : NES_ZIONA,
      zoom: 15,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    });
    mapRef.current = map;

    /* pause the nav-mode auto-follow loop the instant the user touches the map — drag, pinch-zoom
       and scroll-zoom all fire "movestart" with `originalEvent` set (unlike our own programmatic
       jumpTo/flyTo calls, where it's undefined), so this cleanly tells user gestures apart from
       the camera-follow loop itself. Stays paused until the user taps "locate me" again — matching
       Waze/Google Maps, which don't fight a manual pan by snapping straight back. */
    map.on("movestart", (e) => {
      if (e.originalEvent) manualFlyActiveRef.current = true;
    });

    map.on("load", () => {
      /* navigation route */
      map.addSource("nav-route", { type: "geojson", data: toLineGeoJSON([]) });
      map.addLayer({ id: "nav-route-shadow", type: "line", source: "nav-route",
        paint: { "line-color": "#2D2A24", "line-width": 10, "line-opacity": 0.15 } });
      map.addLayer({ id: "nav-route-line",   type: "line", source: "nav-route",
        paint: { "line-color": "#6B9956",   "line-width": 6,  "line-opacity": 0.95 } });

      /* clearance route (item-based) */
      map.addSource("clearance-route", { type: "geojson", data: toLineGeoJSON([]) });
      map.addLayer({ id: "clearance-route-line", type: "line", source: "clearance-route",
        paint: { "line-color": "#C94B1F", "line-width": 4, "line-opacity": 0.85,
                 "line-dasharray": [4, 3] } });

      /* clearance streets (OSM-based) */
      map.addSource("clearance-streets", {
        type: "geojson", data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({ id: "clearance-streets-line", type: "line", source: "clearance-streets",
        paint: { "line-color": "#6B9956", "line-width": 6, "line-opacity": 0.92 } });

      setMapLoaded(true);
    });

    return () => {
      itemMarkersRef.current.forEach(m => m.remove());
      itemMarkersRef.current.clear();
      userMarkerRef.current?.remove();
      destMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line

  /* ── nav mode: follow user with heading ──
     Look-ahead is kept modest (60m, was 150m) because any residual noise in the heading
     estimate gets amplified by this distance into a screen-space camera jump. The look-ahead
     point is written to `targetRef` only — the rAF loop below eases toward it every frame,
     so that noise gets damped continuously instead of producing one discrete easeTo per raw
     GPS tick (which is what caused the visible jitter/jumps). */
  useEffect(() => {
    if (!navMode || !userPos) return;
    let [lat, lng] = userPos;
    if (heading != null) {
      const rad = heading * Math.PI / 180;
      lat += (60 / 111320) * Math.cos(rad);
      lng += (60 / (111320 * Math.cos(userPos[0] * Math.PI / 180))) * Math.sin(rad);
    }
    targetRef.current = { lat, lng, heading: heading ?? 0, zoom: 17, pitch: 50 };
  }, [userPos, heading, navMode]);

  /* ── nav mode: continuous camera glide ──
     Runs a requestAnimationFrame loop for the duration of nav mode, exponentially easing the
     rendered camera pose toward `targetRef` every frame via map.jumpTo (not easeTo — the loop
     itself already performs the easing, so calling easeTo here as well would double-ease
     against a moving target and reintroduce the same jitter this replaces). This decouples
     visual smoothness from the GPS fixes' irregular arrival timing. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !navMode) {
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
      renderedRef.current = null; // re-seed from the live camera next time nav mode starts
      lastFrameTsRef.current = null;
      return;
    }
    manualFlyActiveRef.current = false; // fresh start each time nav mode begins — don't inherit a pause from before nav started
    const TAU_MS = 280; // smoothing time constant — smaller = snappier, larger = smoother/laggier
    function tick(ts: number) {
      const map = mapRef.current;
      if (!map) return;
      if (!renderedRef.current) {
        const c = map.getCenter();
        renderedRef.current = { lat: c.lat, lng: c.lng, heading: -map.getBearing(), zoom: map.getZoom(), pitch: map.getPitch() };
      }
      const target = targetRef.current;
      if (target && !manualFlyActiveRef.current) {
        const dt = lastFrameTsRef.current != null ? ts - lastFrameTsRef.current : 16;
        const f = 1 - Math.exp(-dt / TAU_MS);
        const r = renderedRef.current;
        r.lat   += (target.lat - r.lat) * f;
        r.lng   += (target.lng - r.lng) * f;
        r.zoom  += (target.zoom - r.zoom) * f;
        r.pitch += (target.pitch - r.pitch) * f;
        const diff = ((target.heading - r.heading + 540) % 360) - 180; // shortest signed delta
        r.heading = (r.heading + diff * f + 360) % 360;
        map.jumpTo({ center: [r.lng, r.lat], zoom: r.zoom, pitch: r.pitch, bearing: -r.heading });
      }
      lastFrameTsRef.current = ts;
      rafIdRef.current = requestAnimationFrame(tick);
    }
    rafIdRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    };
  }, [navMode, mapLoaded]);

  /* ── reset pitch/bearing when leaving nav mode ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || navMode) return;
    map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
  }, [navMode, mapLoaded]);

  /* ── center on user (locate-me button) ──
     During nav mode the rAF loop above runs at 60fps and would override this flyTo within a
     single frame — manualFlyActiveRef pauses that loop for the duration of the flyTo so the
     locate-me tap is actually visible before the live-follow camera resumes. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !userPos) return;
    if (centerTrigger === 0 || centerTrigger === prevTriggerRef.current) return;
    prevTriggerRef.current = centerTrigger;
    manualFlyActiveRef.current = true;
    map.once("moveend", () => { manualFlyActiveRef.current = false; });
    map.flyTo({ center: [userPos[1], userPos[0]], zoom: 16, duration: 1100 });
  }, [centerTrigger, userPos, mapLoaded]);

  /* ── user dot ── */
  const navModeRenderedRef = useRef<boolean | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userPos) return;
    const lngLat: maplibregl.LngLatLike = [userPos[1], userPos[0]];
    if (!userMarkerRef.current) {
      const el = document.createElement("div");
      el.innerHTML = userDotHTML(navMode);
      navModeRenderedRef.current = navMode;
      userMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center", pitchAlignment: "viewport", rotationAlignment: "viewport" })
        .setLngLat(lngLat).addTo(map);
    } else {
      if (navModeRenderedRef.current !== navMode) {
        userMarkerRef.current.getElement().innerHTML = userDotHTML(navMode);
        navModeRenderedRef.current = navMode;
      }
      userMarkerRef.current.setLngLat(lngLat);
    }
  }, [userPos, navMode]);

  /* ── destination pin ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    destMarkerRef.current?.remove();
    destMarkerRef.current = null;
    if (!navDest) return;
    destMarkerRef.current = new maplibregl.Marker({ element: makePinEl("🎯", "#FFB347"), anchor: "bottom", offset: [0, -9], pitchAlignment: "viewport", rotationAlignment: "viewport" })
      .setLngLat([navDest.lng, navDest.lat]).addTo(map);
  }, [navDest]);

  /* ── item pins ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const existing = itemMarkersRef.current;
    const newIds = new Set(items.map(it => it.id));

    existing.forEach((m, id) => { if (!newIds.has(id)) { m.remove(); existing.delete(id); itemStatusRef.current.delete(id); } });

    if (navMode) { existing.forEach(m => m.remove()); existing.clear(); itemStatusRef.current.clear(); return; }

    items
      .filter(it => it.lat != null && it.lng != null)
      .forEach(it => {
        // status changed (e.g. active → taken) — recreate the pin with the updated look
        if (existing.has(it.id) && itemStatusRef.current.get(it.id) !== it.status) {
          existing.get(it.id)!.remove();
          existing.delete(it.id);
        }
        if (existing.has(it.id)) return;

        const pin = CAT_PIN[it.category] ?? { emoji: "📦", bg: "#EDE6D2" };
        const el = makePinEl(pin.emoji, pin.bg, it.imageUrl, it.status === "taken");
        if (onItemClick) el.addEventListener("click", () => onItemClick(it.id));
        existing.set(it.id,
          new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, -9], pitchAlignment: "viewport", rotationAlignment: "viewport" })
            .setLngLat([it.lng!, it.lat!]).addTo(map)
        );
        itemStatusRef.current.set(it.id, it.status ?? "active");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, navMode]);

  /* ── nav route ── */
  useEffect(() => {
    if (!mapLoaded) return;
    (mapRef.current?.getSource("nav-route") as maplibregl.GeoJSONSource | undefined)
      ?.setData(toLineGeoJSON(navRoute ?? []));
  }, [navRoute, mapLoaded]);

  /* ── clearance route ── */
  useEffect(() => {
    if (!mapLoaded) return;
    (mapRef.current?.getSource("clearance-route") as maplibregl.GeoJSONSource | undefined)
      ?.setData(toLineGeoJSON(clearanceRoute ?? []));
  }, [clearanceRoute, mapLoaded]);

  /* ── clearance streets ── */
  useEffect(() => {
    if (!mapLoaded) return;
    const features = (clearanceStreets ?? [])
      .filter(s => s.length > 1)
      .map(s => ({
        type: "Feature" as const, properties: {},
        geometry: { type: "LineString" as const, coordinates: s.map(([lat, lng]) => [lng, lat]) },
      }));
    (mapRef.current?.getSource("clearance-streets") as maplibregl.GeoJSONSource | undefined)
      ?.setData({ type: "FeatureCollection", features });
  }, [clearanceStreets, mapLoaded]);

  /* ── selected pin highlight ── */
  useEffect(() => {
    itemMarkersRef.current.forEach((marker, id) => {
      const inner = marker.getElement().firstElementChild as HTMLElement | null;
      if (!inner) return;
      if (id === selectedItemId) {
        inner.style.border = "3px solid #6B9956";
        inner.style.boxShadow = "0 0 0 3px rgba(107,153,86,0.35), 2px 2px 0 rgba(45,42,36,0.18)";
        inner.style.transform = "rotate(-45deg) scale(1.25)";
      } else {
        inner.style.border = "2.5px solid #2D2A24";
        inner.style.boxShadow = "2px 2px 0 rgba(45,42,36,0.18)";
        inner.style.transform = "rotate(-45deg)";
      }
    });
  }, [selectedItemId]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
