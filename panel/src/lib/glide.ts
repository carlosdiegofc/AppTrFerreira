// Smooth movement on the live maps (request of 18/10/2026): a truck glides from where it is drawn to its new position
// instead of jumping, over about the time until the next position arrives, and the route line follows it. Pure
// functions: no Leaflet, no React.
import { ROUTE_GAP_MS } from './route';

export type Point = [lat: number, lng: number];

/** A move longer than this is drawn as a jump: the signal came back after a while, or the position was corrected. */
export const MAX_GLIDE_METERS = 3_000;

const RAD = Math.PI / 180;

/** Distance in metres over the Earth's surface. */
export function meters(a: Point, b: Point): number {
  const dLat = (b[0] - a[0]) * RAD;
  const dLng = (b[1] - a[1]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

/** The point a fraction t of the way from a to b; over a few kilometres a straight line in degrees is close enough. */
export function between(a: Point, b: Point, t: number): Point {
  const k = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

export interface Glide {
  /** From where the truck is drawn to where it is now, through the readings in between. */
  path: Point[];
  /** Distance from the start of the path to each of its points. */
  lengths: number[];
  start: number;
  duration: number;
}

/**
 * A glide along `path` (from where the truck is drawn to its new position) that starts at `now`, or null when the truck
 * should jump instead: it did not move, the move is too long to be a stretch of road, or there is no time to glide.
 */
export function startGlide(path: readonly Point[], now: number, duration: number): Glide | null {
  if (path.length < 2 || !(duration > 0)) return null;
  const lengths = [0];
  for (let i = 1; i < path.length; i++) lengths.push((lengths[i - 1] ?? 0) + meters(path[i - 1] as Point, path[i] as Point));
  const total = lengths.at(-1) ?? 0;
  if (total === 0 || total > MAX_GLIDE_METERS) return null;
  return { path: path.map((p) => [p[0], p[1]]), lengths, start: now, duration };
}

/** Where a glide is at `now`, at an even speed along its path, and the part of the path already walked. */
export function glideAt(g: Glide, now: number): { at: Point; walked: Point[]; done: boolean } {
  const t = (now - g.start) / g.duration;
  const last = g.path.at(-1) as Point;
  if (t >= 1) return { at: last, walked: g.path.map((p) => [p[0], p[1]]), done: true };
  const goal = (g.lengths.at(-1) ?? 0) * Math.max(0, t);
  let i = 1;
  while (i < g.path.length - 1 && (g.lengths[i] ?? 0) < goal) i++;
  const from = g.lengths[i - 1] ?? 0;
  const span = (g.lengths[i] ?? 0) - from;
  const at = between(g.path[i - 1] as Point, g.path[i] as Point, span > 0 ? (goal - from) / span : 1);
  return { at, walked: [...g.path.slice(0, i).map((p): Point => [p[0], p[1]]), at], done: false };
}

/**
 * What a refresh added at the end of a live route: the new points of its last stretch, when the route only grew (the
 * same stretches, the last one longer). Null when it changed in any other way, which is drawn at once.
 */
export function grownTail(before: readonly (readonly Point[])[], after: readonly (readonly Point[])[]): { kept: Point[]; added: Point[] } | null {
  const old = before.at(-1);
  const now = after.at(-1);
  if (!old || !now || old.length === 0 || before.length !== after.length || now.length <= old.length) return null;
  for (let i = 0; i < old.length; i++) {
    const a = old[i] as Point;
    const b = now[i] as Point;
    if (a[0] !== b[0] || a[1] !== b[1]) return null;
  }
  return { kept: old.map((p): Point => [p[0], p[1]]), added: now.slice(old.length).map((p): Point => [p[0], p[1]]) };
}

/** Whether two drawings of a route are the same lines, point by point. */
export function sameLines(a: readonly (readonly Point[])[], b: readonly (readonly Point[])[]): boolean {
  return a.length === b.length && a.every((line, i) => {
    const other = b[i];
    return other !== undefined && line.length === other.length && line.every((p, j) => p[0] === other[j]?.[0] && p[1] === other[j]?.[1]);
  });
}

/**
 * Where the line from the route to the truck starts: the last reading of the route, when the truck is on the road or
 * stopped with signal and its live position is newer, close and within the same stretch (no gap without signal).
 * Null when the two are not to be joined; the route then ends where its last reading is.
 */
export function tailStart(
  last: { latitude: number; longitude: number; recorded_at: string } | undefined,
  truck: { lat: number | null; lng: number | null; at: number | null; state: string },
): Point | null {
  if (!last || truck.lat === null || truck.lng === null || truck.at === null) return null;
  if (truck.state !== 'moving' && truck.state !== 'stopped') return null;
  const since = truck.at - Date.parse(last.recorded_at);
  if (!(since > 0) || since > ROUTE_GAP_MS) return null;
  const from: Point = [last.latitude, last.longitude];
  return meters(from, [truck.lat, truck.lng]) <= MAX_GLIDE_METERS ? from : null;
}
