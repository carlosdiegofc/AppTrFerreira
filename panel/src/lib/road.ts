// Road controls share the fleet's labels. Money and fuel are estimates, never operator/sensor readings.
import type { FleetUnit } from './fleet';
import { validPosition } from './route';

export type PointKind = 'toll' | 'scale' | 'radar' | 'place';
export const POINT_LABEL: Record<PointKind, string> = { toll: 'Peaje', scale: 'Balanza', radar: 'Radar', place: 'Mi punto' };
/** A point on screen: what it is, then its name, unless the name already says it («Peaje Pando», «Radar · Ruta 5 km 30»). */
export function pointTitle(p: Pick<RoadPoint, 'kind' | 'name'>): string {
  const label = POINT_LABEL[p.kind];
  const [name, start] = [p.name.trim().toLocaleLowerCase('es'), label.toLocaleLowerCase('es')];
  return name === start || name.startsWith(`${start} `) ? p.name : `${label} · ${p.name}`;
}
const KIND_ORDER: readonly PointKind[] = ['toll', 'scale', 'radar', 'place'];
/** The list's order: tolls, scales, radars and own points, each by name («Ruta 2» before «Ruta 11»). */
export function sortedPoints<T extends Pick<RoadPoint, 'kind' | 'name'>>(points: readonly T[]): T[] {
  return [...points].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true }),
  );
}
export interface RoadPoint {
  id: string;
  name: string;
  kind: PointKind;
  latitude: number;
  longitude: number;
  radius_m: number;
  warning_m: number;
  speed_limit: number | null;
  notes: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}
export interface TollRate {
  id: string;
  point_id: string;
  vehicle_key: string;
  amount: number;
  valid_from: string;
  created_at: string;
}
export interface TollMovement {
  id: string;
  vehicle_key: string;
  vehicle_name: string;
  amount: number;
  kind: 'credit' | 'adjustment' | 'passage';
  happened_at: string;
  notes: string;
  event_id: string | null;
  created_at: string;
}
export interface RoadEvent {
  id: string;
  point_id: string;
  point_name: string;
  kind: PointKind;
  vehicle_key: string;
  vehicle_name: string;
  trip_id: string;
  entered_at: string;
  happened_at: string;
  speed_kmh: number | null;
  speed_limit: number | null;
  accuracy_m: number | null;
  amount: number | null;
}
export interface TankReference {
  vehicle_key: string;
  vehicle_name: string;
  capacity_l: number;
  liters: number;
  consumption: number;
  warning_l: number;
  trip_meters: Record<string, number>;
  receipt_liters: Record<string, number>;
  measured_at: string;
  updated_at: string;
}
/** Same key on the server: a plate when present; otherwise the full model (no ambiguous fuzzy money matching). */
export function roadVehicleKey(label: string): string {
  const cut = label.lastIndexOf(' · ');
  return `${cut >= 0 ? 'plate' : 'model'}:${(cut >= 0 ? label.slice(cut + 3) : label).trim().toLowerCase()}`;
}
export function externalMaps(lat: number | null, lng: number | null) {
  if (!validPosition(lat, lng)) return null;
  const point = `${lat},${lng}`;
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point)}`,
    apple: `https://maps.apple.com/?ll=${point}&q=Ubicaci%C3%B3n%20del%20cami%C3%B3n`,
  };
}
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
/** Proximity only. It is not a promised route/direction-aware warning and cannot debit a toll. */
export function nearbyPoints(unit: FleetUnit, points: readonly RoadPoint[], now: number) {
  if (
    !unit.trip ||
    unit.trip.paused ||
    unit.lat === null ||
    unit.lng === null ||
    !unit.at ||
    now - unit.at > 30_000 ||
    now < unit.at - 5_000
  )
    return [];
  return points
    .filter((p) => !p.archived && p.kind !== 'place')
    .map((point) => ({ point, meters: distanceMeters(point, { latitude: unit.lat!, longitude: unit.lng! }) }))
    .filter((p) => p.meters <= p.point.warning_m)
    .sort((a, b) => a.meters - b.meters);
}
export function tollBalance(movements: readonly TollMovement[], key: string): number {
  return movements.filter((m) => m.vehicle_key === key).reduce((sum, m) => sum + Math.round(m.amount * 100), 0) / 100;
}
export function applicableRate(rates: readonly TollRate[], point: string, key: string, at: string): TollRate | null {
  return (
    rates
      .filter((r) => r.point_id === point && r.vehicle_key === key && Date.parse(r.valid_from) <= Date.parse(at))
      .sort((a, b) => Date.parse(b.valid_from) - Date.parse(a.valid_from))[0] ?? null
  );
}
export function validatePoint(
  p: Pick<RoadPoint, 'name' | 'latitude' | 'longitude' | 'radius_m' | 'warning_m' | 'speed_limit' | 'notes'>,
): string | null {
  if (!p.name.trim() || p.name.trim().length > 100) return 'Escribí un nombre de hasta 100 caracteres.';
  if (!validPosition(p.latitude, p.longitude)) return 'Indicá una ubicación válida en el mapa.';
  if (!Number.isFinite(p.radius_m) || p.radius_m < 15 || p.radius_m > 150) return 'La zona de paso debe tener entre 15 y 150 metros.';
  if (!Number.isFinite(p.warning_m) || p.warning_m < p.radius_m * 2 || p.warning_m > 5000)
    return 'El aviso debe superar el doble de la zona de paso y no exceder 5.000 metros.';
  if (p.speed_limit !== null && (!Number.isFinite(p.speed_limit) || p.speed_limit <= 0 || p.speed_limit > 130))
    return 'Revisá el límite de velocidad.';
  return p.notes.length > 500 ? 'La nota admite hasta 500 caracteres.' : null;
}
