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
}

/** After this long without readings the route is left open instead of joining the two ends with a straight line. */
export const ROUTE_GAP_MS = 90_000;

/** The readings that can be drawn, in the order they come (the route query brings them oldest first). */
export function drawable<T extends Reading>(points: readonly T[]): T[] {
  return points.filter((p) => validPosition(p.latitude, p.longitude));
}

/** Lines to draw: a new one starts when the segment changes (the trip was paused) or after a gap without signal. */
export function routeLines(points: readonly Reading[], gapMs = ROUTE_GAP_MS): [number, number][][] {
  const lines: [number, number][][] = [];
  let line: [number, number][] = [];
  let prev: { segment: number; t: number } | null = null;
  for (const p of drawable(points)) {
    const here = { segment: p.segment ?? 0, t: Date.parse(p.recorded_at) };
    if (prev && (here.segment !== prev.segment || here.t - prev.t > gapMs)) {
      lines.push(line);
      line = [];
    }
    line.push([p.latitude, p.longitude]);
    prev = here;
  }
  if (line.length > 0) lines.push(line);
  return lines;
}
