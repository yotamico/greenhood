"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

type CollectionType = "gazam" | "grotaot" | "both";

interface Municipality {
  id: string;
  name: string;
  region: string;
}

interface CollectionDay {
  id: string;
  municipality_id: string;
  neighborhood: string | null;
  collection_date: string;
  collection_type: CollectionType;
  confidence_score: number;
  municipalities: Municipality;
}

interface MapProps {
  collectionDays: CollectionDay[];
  cityCoords: Record<string, [number, number]>;
  collectionColors: Record<CollectionType, string>;
  collectionLabels: Record<CollectionType, string>;
  activeMarker: string | null;
  onMarkerClick: (id: string | null) => void;
}

function createCustomIcon(color: string, label: string, isActive: boolean) {
  const size = isActive ? 44 : 36;
  const ring = isActive
    ? `<circle cx="22" cy="22" r="20" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="4 3" opacity="0.6"/>`
    : "";
  const emoji = label.includes("🌿") ? "🌿" : label.includes("🛋") ? "🛋️" : "♻️";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 8}" viewBox="0 0 44 52">
      ${ring}
      <circle cx="22" cy="20" r="17" fill="${color}" opacity="${isActive ? 1 : 0.85}"/>
      <text x="22" y="26" text-anchor="middle" font-size="16" font-family="sans-serif">${emoji}</text>
      <polygon points="15,34 22,46 29,34" fill="${color}" opacity="${isActive ? 1 : 0.85}"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    iconSize: [size, size + 8],
    iconAnchor: [size / 2, size + 8],
    popupAnchor: [0, -(size + 4)],
    className: "",
  });
}

function FlyToActive({
  collectionDays,
  cityCoords,
  activeMarker,
}: {
  collectionDays: CollectionDay[];
  cityCoords: Record<string, [number, number]>;
  activeMarker: string | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!activeMarker) return;
    const day = collectionDays.find((d) => d.id === activeMarker);
    if (!day) return;
    const coords = cityCoords[day.municipalities?.name];
    if (coords) map.flyTo(coords, 14, { duration: 0.8 });
  }, [activeMarker, collectionDays, cityCoords, map]);
  return null;
}

export default function EcoMap({
  collectionDays,
  cityCoords,
  collectionColors,
  collectionLabels,
  activeMarker,
  onMarkerClick,
}: MapProps) {
  const ISRAEL_CENTER: [number, number] = [31.5, 34.9];

  return (
    <>
      <style>{mapStyles}</style>
      <MapContainer
        center={ISRAEL_CENTER}
        zoom={8}
        style={{ width: "100%", height: "100%" }}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
          maxZoom={19}
        />
        <FlyToActive
          collectionDays={collectionDays}
          cityCoords={cityCoords}
          activeMarker={activeMarker}
        />
        {collectionDays.map((day) => {
          const cityName = day.municipalities?.name ?? "";
          const coords = cityCoords[cityName];
          if (!coords) return null;
          const isActive = activeMarker === day.id;
          const color = collectionColors[day.collection_type];
          const label = collectionLabels[day.collection_type];
          const icon = createCustomIcon(color, label, isActive);
          const daysLeft = Math.ceil(
            (new Date(day.collection_date).getTime() - Date.now()) / 86400000
          );
          return (
            <Marker
              key={day.id}
              position={coords}
              icon={icon}
              zIndexOffset={isActive ? 1000 : 0}
              eventHandlers={{ click: () => onMarkerClick(isActive ? null : day.id) }}
            >
              <Popup className="eco-popup">
                <div className="popup-inner" dir="rtl">
                  <div className="popup-chip" style={{ background: color + "30", color }}>
                    {label}
                  </div>
                  <h3 className="popup-city">{cityName}</h3>
                  {day.neighborhood && (
                    <p className="popup-neighborhood">📍 {day.neighborhood}</p>
                  )}
                  <p className="popup-date">
                    📅{" "}
                    {new Date(day.collection_date).toLocaleDateString("he-IL", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </p>
                  <div className="popup-meta">
                    <span className={`popup-urgency ${daysLeft <= 1 ? "urgent" : ""}`}>
                      {daysLeft === 0 ? "⚡ היום!" : daysLeft === 1 ? "⏰ מחר" : `בעוד ${daysLeft} ימים`}
                    </span>
                    <span className="popup-confidence">
                      מהימנות: {Math.round(day.confidence_score * 100)}%
                    </span>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </>
  );
}

const mapStyles = `
  .eco-popup .leaflet-popup-content-wrapper {
    background: #1a1d27; border: 1px solid #2e3348; border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5); padding: 0; overflow: hidden; min-width: 200px;
  }
  .eco-popup .leaflet-popup-content { margin: 0; line-height: 1; }
  .eco-popup .leaflet-popup-tip-container .leaflet-popup-tip { background: #1a1d27; }
  .eco-popup .leaflet-popup-close-button { color: #7880a0 !important; font-size: 18px !important; top: 8px !important; right: 8px !important; }
  .popup-inner { padding: 14px; display: flex; flex-direction: column; gap: 7px; font-family: 'Heebo', sans-serif; }
  .popup-chip { display: inline-block; padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 600; align-self: flex-start; }
  .popup-city { font-size: 17px; font-weight: 900; color: #e8eaf2; margin: 0; }
  .popup-neighborhood { font-size: 12px; color: #7880a0; margin: 0; }
  .popup-date { font-size: 12px; color: #a0a8c0; margin: 0; }
  .popup-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px; padding-top: 8px; border-top: 1px solid #2e3348; }
  .popup-urgency { font-size: 12px; font-weight: 700; color: #7880a0; }
  .popup-urgency.urgent { color: #f87171; animation: pulse 1.5s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
  .popup-confidence { font-size: 10px; color: #7880a0; }
  .leaflet-control-attribution { background: rgba(15,17,23,0.8) !important; color: #4a5070 !important; font-size: 9px !important; }
  .leaflet-control-attribution a { color: #4a5070 !important; }
`;
