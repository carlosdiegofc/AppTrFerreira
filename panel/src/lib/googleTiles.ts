// Satellite view from Google Maps (decision of 22/10/2026), through its Map Tiles API: Google's satellite pictures with
// its roads, streets and names on top, as tiles of the same Leaflet map, so trucks, routes and points stay as they are.
// A session (good for about two weeks) names what the tiles show; each view asks what credits to show and how deep the
// pictures go there. Pure functions: the map uses them, the tests check them.

export const GOOGLE_TILES = 'https://tile.googleapis.com';

/** Satellite with the roads and their names, in the Spanish of Latin America, as seen from Uruguay. */
export const SESSION_REQUEST = { mapType: 'satellite', language: 'es-419', region: 'UY', layerTypes: ['layerRoadmap'] } as const;

export interface TileSession {
  session: string;
  /** When it stops working, in milliseconds. */
  expiry: number;
}

/** A session is not used in its last hour, so a long look at the map does not run into its end. */
const MARGIN_MS = 60 * 60 * 1000;

export function sessionUrl(key: string): string {
  return `${GOOGLE_TILES}/v1/createSession?key=${encodeURIComponent(key)}`;
}

/** What createSession answers ({ session, expiry in seconds as text, ... }), or null if it is not that. */
export function readSession(answer: unknown): TileSession | null {
  if (!answer || typeof answer !== 'object') return null;
  const { session, expiry } = answer as { session?: unknown; expiry?: unknown };
  const seconds = typeof expiry === 'string' || typeof expiry === 'number' ? Number(expiry) : NaN;
  if (typeof session !== 'string' || session === '' || !Number.isFinite(seconds)) return null;
  return { session, expiry: seconds * 1000 };
}

/** A session kept from before (as saved, so of any shape) that can still be used, or null. */
export function keptSession(saved: unknown, now: number): TileSession | null {
  if (!saved || typeof saved !== 'object') return null;
  const { session, expiry } = saved as { session?: unknown; expiry?: unknown };
  if (typeof session !== 'string' || session === '' || typeof expiry !== 'number') return null;
  return expiry - MARGIN_MS > now ? { session, expiry } : null;
}

export function tileUrl(key: string, session: string): string {
  return `${GOOGLE_TILES}/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(session)}&key=${encodeURIComponent(key)}`;
}

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** Credits and depth of the pictures for what the map shows. */
export function viewportUrl(key: string, session: string, zoom: number, b: Bounds): string {
  const f = (n: number) => String(Math.round(n * 1e6) / 1e6);
  return (
    `${GOOGLE_TILES}/tile/v1/viewport?session=${encodeURIComponent(session)}&key=${encodeURIComponent(key)}` +
    `&zoom=${Math.round(zoom)}&north=${f(b.north)}&south=${f(b.south)}&east=${f(b.east)}&west=${f(b.west)}`
  );
}

export interface Viewport {
  /** The credits Google asks to show, as text. */
  copyright: string;
  maxZoomRects: (Bounds & { maxZoom: number })[];
}

export function readViewport(answer: unknown): Viewport | null {
  if (!answer || typeof answer !== 'object') return null;
  const { copyright, maxZoomRects } = answer as { copyright?: unknown; maxZoomRects?: unknown };
  const rects = Array.isArray(maxZoomRects)
    ? maxZoomRects.filter(
        (r): r is Bounds & { maxZoom: number } =>
          !!r && typeof r === 'object' && ['maxZoom', 'north', 'south', 'east', 'west'].every((k) => typeof (r as Record<string, unknown>)[k] === 'number'),
      )
    : [];
  return { copyright: typeof copyright === 'string' ? copyright : '', maxZoomRects: rects };
}

/** How deep the pictures go at a place: the deepest rectangle that holds it, or the fallback outside all of them. */
export function maxZoomAt(rects: Viewport['maxZoomRects'], lat: number, lng: number, fallback: number): number {
  let best = -1;
  for (const r of rects) {
    // A rectangle may cross the 180th meridian: then its west is east of its east.
    const inLng = r.west <= r.east ? lng >= r.west && lng <= r.east : lng >= r.west || lng <= r.east;
    if (lat <= r.north && lat >= r.south && inLng) best = Math.max(best, r.maxZoom);
  }
  return best >= 0 ? best : fallback;
}
