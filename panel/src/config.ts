export const PANEL_VERSION = '0.1.0';

/** The panel in use until every section of this one is ready. */
export const CURRENT_PANEL_URL = 'https://carlosdiegofc.github.io/AppTrFerreira/';

/** Street map tiles. Allowed by the Content-Security-Policy of index.html. */
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Uruguay, for a map that has nothing to show yet. */
export const DEFAULT_CENTER: [number, number] = [-32.7, -56.0];
export const DEFAULT_ZOOM = 7;

/**
 * How often the live screens read again (decision of 18/10/2026: as fast as possible within the free plan). The position
 * of every truck comes from one small table the phones update with each reading; who is on a trip changes rarely; the
 * route of the selected truck brings only its new readings.
 */
export const LIVE_REFRESH_MS = 3_000;
export const FLEET_REFRESH_MS = 15_000;
export const ROUTE_REFRESH_MS = 5_000;
/** Who has the app open: the phones say it every 5 minutes, so reading it every 30 seconds is enough. */
export const PRESENCE_REFRESH_MS = 30_000;
