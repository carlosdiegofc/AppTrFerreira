// Google's map (decisions of 22/10/2026 and 26/10/2026), through its Map Tiles API: its streets, its satellite pictures
// with the roads and names on top, and its traffic, as tiles of the same Leaflet map, so trucks, routes and points stay
// as they are. A session (good for about two weeks) names what the tiles show; each view asks what credits to show and
// how deep the pictures go there. Pure functions: the map uses them, the tests check them.

export const GOOGLE_TILES = 'https://tile.googleapis.com';

/** What a map can show from Google: its streets, its satellite pictures, or its traffic over either of them. */
export type GoogleLayer = 'roadmap' | 'satellite' | 'traffic';

export interface SessionOptions {
  /** A screen with more than one pixel per point: tiles of 512 pixels for the same place, with labels of the usual size. */
  sharp: boolean;
  /** The night colors of the panel's dark mode, for the streets. */
  dark: boolean;
}

/** Google's night colors for its streets, as its own samples give them: the dark mode never darkens Google's tiles by itself. */
export const NIGHT_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#263c3f' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6b9a76' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#746855' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1f2835' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#f3d19c' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f3948' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#17263c' }] },
] as const;

/**
 * What a session asks Google for, in the Spanish of Latin America as seen from Uruguay: the streets (at night with the
 * night colors), the satellite pictures with the roads and their names, or the traffic alone, to lay over either.
 */
export function sessionRequest(layer: GoogleLayer, { sharp, dark }: SessionOptions): Record<string, unknown> {
  const request: Record<string, unknown> =
    layer === 'satellite'
      ? { mapType: 'satellite', language: 'es-419', region: 'UY', layerTypes: ['layerRoadmap'] }
      : layer === 'traffic'
        ? { mapType: 'roadmap', language: 'es-419', region: 'UY', layerTypes: ['layerTraffic'], overlay: true, imageFormat: 'png' }
        : { mapType: 'roadmap', language: 'es-419', region: 'UY', ...(dark ? { styles: NIGHT_STYLES } : {}) };
  return sharp ? { ...request, scale: 'scaleFactor2x', highDpi: true } : request;
}

/** Where a session is kept in the browser: one for each layer, kind of screen and, for the streets, the time of day. */
export function sessionName(layer: GoogleLayer, { sharp, dark }: SessionOptions): string {
  return `trf-google-${layer}${layer === 'roadmap' && dark ? '-noche' : ''}${sharp ? '-2x' : ''}`;
}

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
