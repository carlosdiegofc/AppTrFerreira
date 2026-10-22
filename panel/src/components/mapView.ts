// The base of the GPS and trip maps and their full screen (decision of 22/10/2026). The street map stays as it was;
// when the panel has a Google Maps key, «Satélite» shows Google's satellite pictures with its roads, streets and names
// on top, with Google's logo and credits. Trucks, routes and points are drawn above either base. A button opens the map
// over the whole screen and Esc or the same button closes it.
import L from 'leaflet';
// Google's own file, unchanged (Google Maps attribution assets): the outlined logo, the one for maps and pictures.
import googleLogo from '../assets/google-maps-logo.svg';
import { GOOGLE_MAPS_KEY, TILE_ATTRIBUTION, TILE_URL } from '../config';
import { keptSession, maxZoomAt, readSession, readViewport, SESSION_REQUEST, sessionUrl, type TileSession, tileUrl, viewportUrl } from '../lib/googleTiles';

type Base = 'map' | 'satellite';
const CHOICE = 'trf-mapa-base';
const SESSION = 'trf-google-satelite';
/** The street map has no tiles past 18; where Google does not say, its pictures are taken to go to 19. */
const STREET_MAX = 18;
const SATELLITE_DEPTH = 19;

const ICON_FULL =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_SMALL =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function savedBase(): Base {
  try {
    return localStorage.getItem(CHOICE) === 'satellite' ? 'satellite' : 'map';
  } catch {
    return 'map';
  }
}

function keep(name: string, value: string) {
  try {
    localStorage.setItem(name, value);
  } catch {
    // Without storage the choice lasts until the page closes.
  }
}

/** Google's credits are text: they go into the map's credits line as text, never as HTML. */
function asText(s: string): string {
  const el = document.createElement('span');
  el.textContent = s;
  return el.innerHTML;
}

const TERMS = 'https://www.google.com/help/terms_maps.html';

/** The credits line of the satellite view: Google Maps, the data credits it gives for what is on screen, and its terms. */
function googleCredit(copyright: string): string {
  const data = copyright ? ` · ${asText(copyright)}` : '';
  return `Google Maps${data} · <a href="${TERMS}" target="_blank" rel="noopener noreferrer">Términos</a>`;
}

let asking: Promise<TileSession> | null = null;

/** One session for every map of the browser, kept while it lasts (about two weeks); a new one only when it is ending. */
function session(key: string): Promise<TileSession> {
  try {
    const kept = keptSession(JSON.parse(localStorage.getItem(SESSION) ?? 'null'), Date.now());
    if (kept) return Promise.resolve(kept);
  } catch {
    // A damaged saved session is replaced by a new one.
  }
  asking ??= fetch(sessionUrl(key), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(SESSION_REQUEST) })
    .then(async (r) => {
      const s = r.ok ? readSession(await r.json()) : null;
      if (!s) throw new Error(`Google Maps respondió ${r.status}`);
      keep(SESSION, JSON.stringify(s));
      return s;
    })
    .finally(() => {
      asking = null;
    });
  return asking;
}

/** A small notice inside the map for a few seconds. */
function notice(m: L.Map, text: string) {
  const box = L.DomUtil.create('div', 'map-notice', m.getContainer());
  box.setAttribute('role', 'status');
  box.textContent = text;
  window.setTimeout(() => box.remove(), 6000);
}

export interface MapViewOptions {
  /** What opens over the whole screen: the map, or a box that holds it with its own buttons. */
  full?: () => HTMLElement | null;
}

/** Puts the base (street map or satellite) and the full-screen button on a map. Returns what undoes it. */
export function mapView(m: L.Map, options: MapViewOptions = {}): () => void {
  const key = GOOGLE_MAPS_KEY;
  const box = m.getContainer();
  const streets = L.tileLayer(TILE_URL, { maxZoom: STREET_MAX, attribution: TILE_ATTRIBUTION });
  let satellite: L.TileLayer | null = null;
  let tiles: TileSession | null = null;
  let base: Base = 'map';
  let credit = '';
  let asked = 0;
  let waiting = 0;
  let alive = true;
  const buttons = new Map<Base, HTMLButtonElement>();

  const logo = new (L.Control.extend({
    onAdd() {
      const img = L.DomUtil.create('img', 'map-google-logo') as HTMLImageElement;
      img.src = googleLogo;
      img.alt = 'Google Maps';
      return img;
    },
  }))({ position: 'bottomleft' });

  const setCredit = (text: string) => {
    if (text === credit) return;
    if (credit) m.attributionControl.removeAttribution(credit);
    credit = text;
    if (credit) m.attributionControl.addAttribution(credit);
  };

  // What Google asks to credit for what is on screen, and how deep its pictures go there; asked again after each move.
  const look = async () => {
    const layer = satellite;
    if (!layer || !tiles || !key) return;
    const b = m.getBounds();
    const ask = ++asked;
    try {
      const r = await fetch(viewportUrl(key, tiles.session, m.getZoom(), { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() }));
      const v = r.ok ? readViewport(await r.json()) : null;
      if (!v || ask !== asked || satellite !== layer || base !== 'satellite') return;
      setCredit(googleCredit(v.copyright));
      const c = m.getCenter();
      const deepest = Math.min(maxZoomAt(v.maxZoomRects, c.lat, c.lng, SATELLITE_DEPTH), 21);
      if (layer.options.maxNativeZoom !== deepest) {
        layer.options.maxNativeZoom = deepest;
        layer.redraw();
      }
    } catch {
      // The credits shown stay until the next move.
    }
  };
  const moved = () => {
    window.clearTimeout(waiting);
    waiting = window.setTimeout(() => void look(), 300);
  };

  const mark = () => {
    for (const [b, button] of buttons) button.setAttribute('aria-pressed', String(b === base));
    box.classList.toggle('is-satellite', base === 'satellite' && satellite !== null && m.hasLayer(satellite));
  };

  const showStreets = () => {
    base = 'map';
    satellite?.remove();
    logo.remove();
    m.off('moveend', moved);
    setCredit('');
    if (!m.hasLayer(streets)) streets.addTo(m);
    if (m.getZoom() > STREET_MAX) m.setZoom(STREET_MAX);
    mark();
  };

  const showSatellite = async () => {
    if (!key) return;
    base = 'satellite';
    mark();
    let s: TileSession;
    try {
      s = await session(key);
    } catch {
      if (!alive) return;
      notice(m, 'No se pudo abrir la vista satelital de Google Maps. Sigue el mapa de calles.');
      showStreets();
      keep(CHOICE, 'map');
      return;
    }
    if (!alive || base !== 'satellite') return;
    if (!satellite || tiles?.session !== s.session) {
      satellite?.remove();
      satellite = L.tileLayer(tileUrl(key, s.session), { maxZoom: 21, maxNativeZoom: SATELLITE_DEPTH, attribution: '' });
    }
    tiles = s;
    streets.remove();
    satellite.addTo(m);
    logo.addTo(m);
    if (!credit) setCredit(googleCredit(''));
    m.on('moveend', moved);
    mark();
    void look();
  };

  const choose = (b: Base) => {
    keep(CHOICE, b);
    if (b === 'satellite') void showSatellite();
    else showStreets();
  };

  // The switch, only with a key: without it the map is the street map, as before.
  const switcher = key
    ? new (L.Control.extend({
        onAdd() {
          const group = L.DomUtil.create('div', 'leaflet-bar map-switch');
          group.setAttribute('role', 'group');
          group.setAttribute('aria-label', 'Vista del mapa');
          for (const [b, text] of [
            ['map', 'Mapa'],
            ['satellite', 'Satélite'],
          ] as const) {
            const button = L.DomUtil.create('button', '', group) as HTMLButtonElement;
            button.type = 'button';
            button.textContent = text;
            button.addEventListener('click', () => choose(b));
            buttons.set(b, button);
          }
          L.DomEvent.disableClickPropagation(group);
          L.DomEvent.disableScrollPropagation(group);
          return group;
        },
      }))({ position: 'bottomright' })
    : null;

  // Full screen: the box goes over the whole page (and the browser too, where it lets) until Esc or the button again.
  let full = false;
  let fullButton: HTMLButtonElement | null = null;
  const target = () => options.full?.() ?? box;
  const setFull = (on: boolean) => {
    if (on === full) return;
    full = on;
    target().classList.toggle('map-full', on);
    document.body.classList.toggle('map-full-open', on);
    if (fullButton) {
      fullButton.innerHTML = on ? ICON_SMALL : ICON_FULL;
      const label = on ? 'Salir de pantalla completa' : 'Pantalla completa';
      fullButton.title = label;
      fullButton.setAttribute('aria-label', label);
      fullButton.setAttribute('aria-pressed', String(on));
    }
    try {
      if (on && document.fullscreenEnabled && !document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => undefined);
      if (!on && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    } catch {
      // Without the browser's full screen the map still covers the page.
    }
    m.invalidateSize();
  };
  const onKey = (e: KeyboardEvent) => {
    // Esc first closes a dialog open over the map.
    if (e.key === 'Escape' && full && !document.querySelector('dialog[open]')) setFull(false);
  };
  const onScreen = () => {
    if (!document.fullscreenElement && full) setFull(false);
  };
  const fullControl = new (L.Control.extend({
    onAdd() {
      const bar = L.DomUtil.create('div', 'leaflet-bar map-full-bar');
      const button = L.DomUtil.create('button', 'map-full-button', bar) as HTMLButtonElement;
      button.type = 'button';
      button.innerHTML = ICON_FULL;
      button.title = 'Pantalla completa';
      button.setAttribute('aria-label', 'Pantalla completa');
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => setFull(!full));
      fullButton = button;
      L.DomEvent.disableClickPropagation(bar);
      return bar;
    },
  }))({ position: 'topleft' });

  fullControl.addTo(m);
  switcher?.addTo(m);
  document.addEventListener('keydown', onKey);
  document.addEventListener('fullscreenchange', onScreen);
  if (key && savedBase() === 'satellite') void showSatellite();
  else showStreets();

  return () => {
    alive = false;
    window.clearTimeout(waiting);
    setFull(false);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('fullscreenchange', onScreen);
    m.off('moveend', moved);
    fullControl.remove();
    switcher?.remove();
    logo.remove();
  };
}
