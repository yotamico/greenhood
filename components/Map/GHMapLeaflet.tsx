"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/* Fix leaflet default marker icons */
delete (L.Icon.Default.prototype as unknown as Record<string,unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/* ── GreenHOOD custom pin icons ── */
function makePin(emoji: string, bg: string) {
  return L.divIcon({
    className: "",
    iconAnchor: [18, 36],
    popupAnchor: [0, -38],
    html: `
      <div style="
        width:36px; height:36px;
        background:${bg};
        border:2px solid #2D2A24;
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        box-shadow:2px 2px 0 rgba(45,42,36,0.18);
        display:flex; align-items:center; justify-content:center;
      ">
        <span style="transform:rotate(45deg); font-size:16px; line-height:1;">${emoji}</span>
      </div>
    `,
  });
}

const CAT_PIN: Record<string,{ emoji:string; bg:string }> = {
  furniture:   { emoji: "🪑", bg: "#F0DBC0" },
  books:       { emoji: "📚", bg: "#C9D8E2" },
  lighting:    { emoji: "💡", bg: "#F0D5CB" },
  plants:      { emoji: "🌿", bg: "#A8C496" },
  sports:      { emoji: "⚽", bg: "#C9D8E2" },
  electronics: { emoji: "📺", bg: "#EDE6D2" },
  kitchen:     { emoji: "🍳", bg: "#F0DBC0" },
  kids:        { emoji: "🧸", bg: "#F0D5CB" },
};

interface Item { id: string; title: string; category: string; lat: number | null; lng: number | null; }

interface Props {
  userPos: [number,number] | null;
  items:   Item[];
}

/* Fly-to helper */
function FlyTo({ pos }: { pos: [number,number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(pos, 15, { duration: 1.2 });
  }, [map, pos]);
  return null;
}

const NES_ZIONA: [number,number] = [31.9297, 34.8307];

export default function GHMapLeaflet({ userPos, items }: Props) {
  const center = userPos ?? NES_ZIONA;

  /* ── user dot icon ── */
  const userIcon = L.divIcon({
    className: "",
    iconAnchor: [9, 9],
    html: `
      <div style="position:relative;width:18px;height:18px;">
        <div style="
          position:absolute;inset:0;border-radius:50%;
          background:#6B8FA8;opacity:0.25;
          animation:ghPulse 2s ease-out infinite;
          transform-origin:center;
        "></div>
        <div style="
          position:absolute;inset:2px;border-radius:50%;
          background:#6B8FA8;border:2.5px solid #2D2A24;
          box-shadow:0 0 0 3px white;
        "></div>
      </div>
    `,
  });

  return (
    <MapContainer
      center={center}
      zoom={15}
      style={{ height: "100%", width: "100%", zIndex: 0 }}
      zoomControl={false}
      attributionControl={false}
    >
      {/* Warm paper-toned tile layer */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
      />

      {/* Fly to user when location found */}
      {userPos && <FlyTo pos={userPos} />}

      {/* User location dot */}
      {userPos && (
        <Marker position={userPos} icon={userIcon} />
      )}

      {/* Item pins */}
      {items
        .filter(it => it.lat != null && it.lng != null)
        .map(it => {
          const pin = CAT_PIN[it.category] ?? { emoji: "📦", bg: "#EDE6D2" };
          return (
            <Marker
              key={it.id}
              position={[it.lat!, it.lng!]}
              icon={makePin(pin.emoji, pin.bg)}
            />
          );
        })
      }
    </MapContainer>
  );
}
