export const PANEL_VERSION = '0.1.0';

/** The panel in use until every section of this one is ready. */
export const CURRENT_PANEL_URL = 'https://carlosdiegofc.github.io/AppTrFerreira/';

/** Street map tiles. Allowed by the Content-Security-Policy of index.html. */
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Uruguay, for a map that has nothing to show yet. */
export const DEFAULT_CENTER: [number, number] = [-32.7, -56.0];
export const DEFAULT_ZOOM = 7;

/** How often the live screens ask for new positions. */
export const FLEET_REFRESH_MS = 15_000;
export const ROUTE_REFRESH_MS = 30_000;
