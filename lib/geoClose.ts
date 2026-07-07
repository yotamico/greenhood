import { latLngToCell } from "h3-js";

const EARTH_RADIUS_M = 6_371_000;
export const CLOSE_PROXIMITY_M = 100;
export const H3_RESOLUTION = 7;
export const APPEAL_WINDOW_MS = 3 * 60 * 60 * 1000;
export const PENDING_REMINDER_MS = 24 * 60 * 60 * 1000;
export const CLOSE_REQUESTS_PER_HOUR = 3;

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function h3Cell(lat: number, lng: number): string {
  return latLngToCell(lat, lng, H3_RESOLUTION);
}
