// The advanced detail of a trip (decision of 3/11/2026): every time the truck stood still, and what the GPS read at the
// point of the route the office taps. Only from the readings the app already sends; nothing new is saved.
import { drawable, metersBetween, type Reading, routeLink } from './route';

/** Closer than this to where it stopped, the truck is still there (the app keeps the readings of a stop within 12 m). */
export const HALT_RADIUS_M = 120;
/** Shorter than this is a traffic light or a turn, not a stop worth listing. */
export const HALT_MIN_MS = 5 * 60_000;
/** Farther than this from the route, a tap is not on it. */
export const TAP_MAX_M = 500;

export interface Halt {
  from: string;
  to: string;
  ms: number;
  latitude: number;
  longitude: number;
  /** The driver paused the trip there (the readings go on in a new stretch of the trip). */
  paused: boolean;
}

interface Timed extends Reading {
  speed_kmh?: number | null;
}

/**
 * The times the truck stood still for 5 minutes or more: the readings that stay within 120 m of the first one of the
 * stop, from that one to the last one there. A pause of the trip in the same place counts too, marked as a pause, and so
 * does a stretch without readings that ends where it began. The estimated road of a stretch without signal is not a reading.
 */
export function halts(points: readonly Timed[]): Halt[] {
  const measured = drawable(points).filter((p) => !p.estimated);
  const out: Halt[] = [];
  let i = 0;
  while (i < measured.length) {
    const anchor = measured[i];
    if (!anchor) break;
    let j = i;
    let paused = false;
    while (j + 1 < measured.length) {
      const next = measured[j + 1];
      if (!next || metersBetween(anchor, next) > HALT_RADIUS_M) break;
      if ((next.segment ?? 0) !== (measured[j]?.segment ?? 0)) paused = true;
      j++;
    }
    const last = measured[j] ?? anchor;
    const ms = Date.parse(last.recorded_at) - Date.parse(anchor.recorded_at);
    if (ms >= HALT_MIN_MS) out.push({ from: anchor.recorded_at, to: last.recorded_at, ms, latitude: anchor.latitude, longitude: anchor.longitude, paused });
    i = j + 1;
  }
  return out;
}

export interface RouteSpot {
  latitude: number;
  longitude: number;
  recorded_at: string;
  speed_kmh: number | null;
  /** Along the route drawn, from the first reading to this one. */
  meters: number;
  estimated: boolean;
}

/** Kilometres along the route up to each drawable reading: a cut left open (no line drawn) adds nothing. */
function along<T extends Timed>(points: readonly T[]): { point: T; meters: number }[] {
  const shown = drawable(points);
  let meters = 0;
  return shown.map((p, k) => {
    const prev = shown[k - 1];
    if (prev && routeLink(prev, p) !== 'none') meters += metersBetween(prev, p);
    return { point: p, meters };
  });
}

/** The reading of the route nearest to a tap on the map, with its time, speed and kilometres, or null off the route. */
export function spotAt(points: readonly Timed[], latitude: number, longitude: number): RouteSpot | null {
  const tap = { latitude, longitude, recorded_at: '', segment: 0 };
  let best: { point: Timed; meters: number } | null = null;
  let bestGap = Infinity;
  for (const r of along(points)) {
    const gap = metersBetween(tap, r.point);
    if (gap < bestGap) {
      bestGap = gap;
      best = r;
    }
  }
  if (!best || bestGap > TAP_MAX_M) return null;
  const p = best.point;
  return { latitude: p.latitude, longitude: p.longitude, recorded_at: p.recorded_at, speed_kmh: typeof p.speed_kmh === 'number' && Number.isFinite(p.speed_kmh) ? p.speed_kmh : null, meters: best.meters, estimated: !!p.estimated };
}
