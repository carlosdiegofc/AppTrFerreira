// GPS positions that can be drawn and the lines of a trip's route. Same rules as the current panel (validLatLng and
// routeSegments in web/js) and the trip map of the app.

/** Finite, on the globe and not 0,0, which is what a reading without a fix looks like. */
export function validPosition(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

export interface Reading {
  latitude: number;
  longitude: number;
  recorded_at: string;
  segment: number | null;
  /** A reading of the estimated road of a stretch without signal (app 0.24.0, migration 0013), not one of the GPS. */
  estimated?: boolean | null;
}

/** After this long without readings the line of the route is cut: the truck was not followed in between. */
export const ROUTE_GAP_MS = 90_000;
/**
 * A cut longer than this, or one no truck could drive (faster than GAP_MAX_KMH on average), is left open on the map and
 * without kilometres: the same rule as the app (Gaps.kt), which fills the shorter ones with the road.
 */
export const GAP_MAX_MS = 3 * 3_600_000;
export const GAP_MAX_KMH = 120;
/** Closer than this the truck did not go anywhere: the app does not fill it. */
export const GAP_MIN_METERS = 300;

/** The readings that can be drawn, in the order they come (the route query brings them oldest first). */
export function drawable<T extends Reading>(points: readonly T[]): T[] {
  return points.filter((p) => validPosition(p.latitude, p.longitude));
}

/** How many readings the GPS took: the ones that can be drawn, without the estimated road of the stretches without signal. */
export function measuredCount(points: readonly Reading[]): number {
  return drawable(points).filter((p) => !p.estimated).length;
}

/**
 * The readings already shown plus the ones saved since (by id), without repeating any, in the order of the trip. The
 * estimated road of a stretch without signal, and a reading a phone sent late, are saved after newer readings: they
 * go in their place by time.
 */
export function appendReadings<T extends { id: number; recorded_at: string }>(shown: readonly T[], newer: readonly T[]): T[] {
  const seen = new Set(shown.map((p) => p.id));
  const added = newer.filter((p) => !seen.has(p.id));
  if (added.length === 0) return [...shown];
  const all = [...shown, ...added];
  const last = shown.at(-1)?.recorded_at ?? '';
  if (added.every((p) => p.recorded_at >= last)) return all;
  return all.sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at) || a.id - b.id);
}

/** The newest reading saved of those shown, to read only the ones saved after it. */
export function lastSaved(shown: readonly { id: number }[]): number | null {
  return shown.reduce<number | null>((max, p) => (max === null || p.id > max ? p.id : max), null);
}

const RAD = Math.PI / 180;

export function metersBetween(a: Reading, b: Reading): number {
  const h = Math.sin(((b.latitude - a.latitude) * RAD) / 2) ** 2 + Math.cos(a.latitude * RAD) * Math.cos(b.latitude * RAD) * Math.sin(((b.longitude - a.longitude) * RAD) / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

/**
 * How two readings in a row are joined (Gaps.link in the app): a pause leaves the line open; the estimated road of a
 * stretch without signal goes dashed; after more than 90 seconds without readings the two ends are joined dashed too,
 * unless the cut was one the app leaves unfilled (more than 3 hours, or a jump no truck could make). So the line goes on
 * while the road is on its way, and on trips of before.
 */
export function routeLink(a: Reading, b: Reading): 'none' | 'solid' | 'dashed' {
  if ((a.segment ?? 0) !== (b.segment ?? 0)) return 'none';
  if (a.estimated || b.estimated) return 'dashed';
  const ms = Date.parse(b.recorded_at) - Date.parse(a.recorded_at);
  if (!(ms > ROUTE_GAP_MS)) return 'solid';
  const meters = metersBetween(a, b);
  return meters >= GAP_MIN_METERS && (ms > GAP_MAX_MS || (meters * 3.6) / (ms / 1000) > GAP_MAX_KMH + 1e-9) ? 'none' : 'dashed';
}

export interface RouteRun {
  points: [number, number][];
  /** Dashed: the road of a stretch without signal, estimated, or the straight line while it comes. */
  estimated: boolean;
}

/**
 * The lines of a route, in order: solid where the GPS followed the truck, dashed over a stretch without signal. A
 * reading on its own (between a pause and another cut) is a line of one point, so the route's first and last places
 * are still the first and last point of its lines.
 */
export function routeRuns(points: readonly Reading[]): RouteRun[] {
  const runs: RouteRun[] = [];
  let before: Reading | null = null;
  let run: RouteRun = { points: [], estimated: false };
  for (const p of drawable(points)) {
    const at: [number, number] = [p.latitude, p.longitude];
    const link = before ? routeLink(before, p) : 'none';
    before = p;
    const last = run.points[run.points.length - 1];
    if (link === 'none' || !last) {
      run = { points: [at], estimated: false };
      runs.push(run);
      continue;
    }
    const dashed = link === 'dashed';
    if (run.points.length === 1) run.estimated = dashed;
    else if (run.estimated !== dashed) {
      run = { points: [last, at], estimated: dashed };
      runs.push(run);
      continue;
    }
    run.points.push(at);
  }
  return runs;
}

/** Longer than this without a reading, with the truck moving, the GPS of the phone stopped (30/10/2026). */
export const CUT_MS = 2 * 60_000;
/** Faster than this between the two readings around it, the truck was moving: a stop drops no readings it should have. */
export const CUT_MOVING_KMH = 20;

export interface ReadingCut {
  from: string;
  to: string;
  /** In a straight line between the readings around it: the road was at least this long. */
  meters: number;
}

/**
 * The times the GPS stopped with the truck moving: more than 2 minutes between two readings of the GPS in the same stretch
 * of the trip, more than 300 m apart, faster than 20 km/h on average. A stop is not one (the app keeps no readings of a
 * truck standing still), nor a pause. Some phones put the app to sleep in the background (a trip of 30/10/2026 at 110 km/h
 * had 17 minutes without readings): the office sees when and how far.
 */
export function readingCuts(points: readonly Reading[]): ReadingCut[] {
  const measured = drawable(points).filter((p) => !p.estimated);
  const cuts: ReadingCut[] = [];
  for (let i = 1; i < measured.length; i++) {
    const a = measured[i - 1];
    const b = measured[i];
    if (!a || !b || (a.segment ?? 0) !== (b.segment ?? 0)) continue;
    const ms = Date.parse(b.recorded_at) - Date.parse(a.recorded_at);
    if (!(ms > CUT_MS)) continue;
    const meters = metersBetween(a, b);
    if (meters >= GAP_MIN_METERS && (meters * 3.6) / (ms / 1000) > CUT_MOVING_KMH) cuts.push({ from: a.recorded_at, to: b.recorded_at, meters });
  }
  return cuts;
}

/** What the stretches without signal of a trip add up to: the ones filled and their kilometres, and the ones left open. */
export function gapSummary(gaps: readonly { meters: number; method: string }[]): { filled: number; meters: number; open: number } {
  const open = gaps.filter((g) => g.method === 'sin_rellenar').length;
  const meters = gaps.reduce((sum, g) => sum + (g.method === 'sin_rellenar' || !Number.isFinite(g.meters) ? 0 : g.meters), 0);
  return { filled: gaps.length - open, meters, open };
}
