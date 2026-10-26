// The base of every map of the panel and the full screen of the GPS and trip maps (decisions of 22/10/2026 and
// 26/10/2026). With a Google Maps key the map is all Google's: its streets («Mapa») or its satellite pictures with the
// roads and names on top («Satélite»), its traffic over either when asked («Tráfico»), with its logo and its credits.
// Google's terms do not allow its pictures or its traffic next to another map, so OpenStreetMap shows only without a key
// or while Google does not answer (the quota of the day reached, say), and the map says so. Trucks, routes and points
// are drawn above any base. A button opens the map over the whole screen and Esc or the same button closes it.
import L from 'leaflet';
// Google's own file, unchanged (Google Maps attribution assets): the outlined logo, the one for maps and pictures.
import googleLogo from '../assets/google-maps-logo.svg';
import { GOOGLE_MAPS_KEY, TILE_ATTRIBUTION, TILE_URL } from '../config';
import {
  type GoogleLayer,
  keptSession,
  maxZoomAt,
  readSession,
  readViewport,
  sessionName,
  type SessionOptions,
  sessionRequest,
  sessionUrl,
  type TileSession,
  tileUrl,
  viewportUrl,
} from '../lib/googleTiles';

type Base = 'map' | 'satellite';
const CHOICE = 'trf-mapa-base';
const TRAFFIC = 'trf-mapa-trafico';
/** OpenStreetMap has no tiles past 18. */
const STREET_MAX = 18;
const GOOGLE_MAX = 21;
/** Where Google does not say how deep it goes, its pictures are taken to reach 19 and its streets 21. */
const DEPTH: Record<Exclude<GoogleLayer, 'traffic'>, number> = { satellite: 19, roadmap: 21 };
/** Traffic changes: while it shows and the page is in sight, it is asked again every 15 minutes. */
const TRAFFIC_EVERY_MS = 15 * 60_000;
/** Tiles that fail in a row, with none arriving, before a map gives up on Google for a while. */
const FAILED_TILES = 4;
/** Once Google stops answering, the maps of the page show OpenStreetMap this long before asking it again. */
const PAUSE_MS = 10 * 60_000;
let googleDownUntil = 0;

const ICON_FULL =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_SMALL =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function saved(name: string): string | null {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}

function keep(name: string, value: string) {
  try {
    localStorage.setItem(name, value);
  } catch {
    // Without storage the choice lasts until the page closes.
  }
}

/** The dark mode of the panel: chosen, or the computer's when the choice is «Como la computadora». */
function darkTheme(): boolean {
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme === 'dark' || theme === 'light') return theme === 'dark';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

const tileOptions = (): SessionOptions => ({ sharp: (window.devicePixelRatio ?? 1) >= 1.5, dark: darkTheme() });

/** Google's credits are text: they go into the map's credits line as text, never as HTML. */
function asText(s: string): string {
  const el = document.createElement('span');
  el.textContent = s;
  return el.innerHTML;
}

const TERMS = 'https://www.google.com/help/terms_maps.html';

/** The credits line of Google's map: Google Maps, the data credits it gives for what is on screen, and its terms. */
function googleCredit(copyright: string): string {
  const data = copyright ? ` · ${asText(copyright)}` : '';
  return `Google Maps${data} · <a href="${TERMS}" target="_blank" rel="noopener noreferrer">Términos</a>`;
}

const asking = new Map<string, Promise<TileSession>>();

/**
 * One session of each kind for every map of the browser, kept while it lasts (about two weeks); a new one when it is
 * ending, or when fresh is asked (the traffic, to show it as it is now).
 */
function session(key: string, layer: GoogleLayer, options: SessionOptions, fresh = false): Promise<TileSession> {
  const name = sessionName(layer, options);
  if (!fresh) {
    try {
      const kept = keptSession(JSON.parse(saved(name) ?? 'null'), Date.now());
      if (kept) return Promise.resolve(kept);
    } catch {
      // A damaged saved session is replaced by a new one.
    }
  }
  let asked = asking.get(name);
  if (!asked) {
    asked = fetch(sessionUrl(key), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sessionRequest(layer, options)) })
      .then(async (r) => {
        const s = r.ok ? readSession(await r.json()) : null;
        if (!s) throw new Error(`Google Maps respondió ${r.status}`);
        keep(name, JSON.stringify(s));
        return s;
      })
      .finally(() => asking.delete(name));
    asking.set(name, asked);
  }
  return asked;
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
  /** Without them, only the base: no switch, no traffic and no full screen (the small map of Inicio). */
  controls?: boolean;
}

/** Puts the base (Google's, or OpenStreetMap) and, with controls, its switch and the full-screen button on a map. Returns what undoes it. */
export function mapView(m: L.Map, options: MapViewOptions = {}): () => void {
  const key = GOOGLE_MAPS_KEY;
  const controls = options.controls ?? true;
  const box = m.getContainer();
  const streets = L.tileLayer(TILE_URL, { maxZoom: STREET_MAX, attribution: TILE_ATTRIBUTION });
  let base: Base = controls && saved(CHOICE) === 'satellite' ? 'satellite' : 'map';
  let traffic = controls && saved(TRAFFIC) === '1';
  // The Google base on the map, its session and the name of that session; the traffic over it.
  let google: L.TileLayer | null = null;
  let tiles: TileSession | null = null;
  let shownName = '';
  let trafficLayer: L.TileLayer | null = null;
  // OpenStreetMap is showing because Google did not answer.
  let fallback = false;
  let credit = '';
  let asked = 0;
  let shown = 0;
  let waiting = 0;
  let retry = 0;
  let alive = true;
  const buttons = new Map<Base, HTMLButtonElement>();
  let trafficButton: HTMLButtonElement | null = null;

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

  const mark = () => {
    for (const [b, button] of buttons) button.setAttribute('aria-pressed', String(fallback ? b === 'map' : b === base));
    trafficButton?.setAttribute('aria-pressed', String(traffic && !fallback));
    const onGoogle = google !== null && m.hasLayer(google);
    box.classList.toggle('is-google', onGoogle);
    box.classList.toggle('is-satellite', onGoogle && shownName.startsWith('trf-google-satellite'));
  };

  // What Google asks to credit for what is on screen, and how deep it goes there; asked again after each move.
  const look = async () => {
    const layer = google;
    const s = tiles;
    if (!layer || !s || !key) return;
    const b = m.getBounds();
    const ask = ++asked;
    try {
      const r = await fetch(viewportUrl(key, s.session, m.getZoom(), { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() }));
      const v = r.ok ? readViewport(await r.json()) : null;
      if (!v || ask !== asked || google !== layer) return;
      setCredit(googleCredit(v.copyright));
      const c = m.getCenter();
      const deepest = Math.min(maxZoomAt(v.maxZoomRects, c.lat, c.lng, base === 'satellite' ? DEPTH.satellite : DEPTH.roadmap), GOOGLE_MAX);
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

  const removeGoogle = () => {
    google?.remove();
    google = null;
    tiles = null;
    shownName = '';
    trafficLayer?.remove();
    trafficLayer = null;
    logo.remove();
    m.off('moveend', moved);
    setCredit('');
  };

  const showStreets = () => {
    removeGoogle();
    if (!m.hasLayer(streets)) streets.addTo(m);
    if (m.getZoom() > STREET_MAX) m.setZoom(STREET_MAX);
    mark();
  };

  // Whether Google gives a tile again: the one under the middle of the map, as a picture, before taking the map back.
  const googleAnswers = async (): Promise<boolean> => {
    if (!key) return false;
    try {
      const s = await session(key, 'roadmap', tileOptions());
      const zoom = Math.min(Math.round(m.getZoom()), STREET_MAX);
      const at = m.project(m.getCenter(), zoom).divideBy(256).floor();
      const url = tileUrl(key, s.session).replace('{z}/{x}/{y}', `${zoom}/${at.x}/${at.y}`);
      return await new Promise<boolean>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
      });
    } catch {
      return false;
    }
  };

  // While OpenStreetMap stands in, Google is asked again from time to time, and takes the map back once it answers.
  const retryLater = () => {
    window.clearTimeout(retry);
    retry = window.setTimeout(
      async () => {
        if (!alive || !fallback) return;
        if (await googleAnswers()) {
          googleDownUntil = 0;
          if (alive && fallback) void showGoogle();
        } else {
          googleDownUntil = Date.now() + PAUSE_MS;
          retryLater();
        }
      },
      Math.max(googleDownUntil - Date.now(), 60_000),
    );
  };

  // Google does not answer: OpenStreetMap, said once, and Google again in a while.
  const fallBack = () => {
    const first = !fallback;
    fallback = true;
    shown++;
    showStreets();
    if (first) notice(m, 'Google Maps no responde ahora: se ve el mapa de OpenStreetMap. Se vuelve a probar en 10 minutos.');
    retryLater();
  };

  const showTraffic = async (fresh = false) => {
    if (!key || !traffic || fallback || !google) return;
    let s: TileSession;
    try {
      s = await session(key, 'traffic', tileOptions(), fresh);
    } catch {
      if (!alive || !traffic) return;
      notice(m, 'No se pudo mostrar el tráfico de Google Maps.');
      traffic = false;
      mark();
      return;
    }
    if (!alive || !traffic || fallback || !google) return;
    const old = trafficLayer;
    const layer = L.tileLayer(tileUrl(key, s.session), { maxZoom: GOOGLE_MAX, maxNativeZoom: DEPTH.roadmap, zIndex: 2, attribution: '' });
    // The traffic of now replaces the one before once it is drawn, so the map does not blink.
    if (old) layer.once('load', () => old.remove());
    trafficLayer = layer.addTo(m);
  };

  const showGoogle = async () => {
    if (!key) return showStreets();
    if (Date.now() < googleDownUntil) return fallBack();
    const seen = tileOptions();
    const layer = base === 'satellite' ? 'satellite' : 'roadmap';
    const name = sessionName(layer, seen);
    if (google && name === shownName && m.hasLayer(google)) return;
    const wanted = ++shown;
    let s: TileSession;
    try {
      s = await session(key, layer, seen);
    } catch {
      if (!alive || wanted !== shown) return;
      googleDownUntil = Date.now() + PAUSE_MS;
      return fallBack();
    }
    if (!alive || wanted !== shown) return;
    const tile = L.tileLayer(tileUrl(key, s.session), { maxZoom: GOOGLE_MAX, maxNativeZoom: DEPTH[layer], zIndex: 1, attribution: '' });
    // A quota reached or a key that stopped working shows as tiles that fail: after a few in a row, OpenStreetMap.
    let failed = 0;
    tile.on('tileload', () => {
      failed = 0;
    });
    tile.on('tileerror', () => {
      if (++failed < FAILED_TILES || google !== tile) return;
      googleDownUntil = Date.now() + PAUSE_MS;
      fallBack();
    });
    removeGoogle();
    streets.remove();
    fallback = false;
    window.clearTimeout(retry);
    google = tile.addTo(m);
    tiles = s;
    shownName = name;
    logo.addTo(m);
    setCredit(googleCredit(''));
    m.on('moveend', moved);
    mark();
    void look();
    if (traffic) void showTraffic();
  };

  const choose = (b: Base) => {
    base = b;
    keep(CHOICE, b);
    // A choice asks Google again even if it did not answer a moment ago.
    googleDownUntil = 0;
    void showGoogle();
  };

  const toggleTraffic = () => {
    traffic = !traffic;
    keep(TRAFFIC, traffic ? '1' : '0');
    if (traffic) {
      if (fallback) {
        googleDownUntil = 0;
        void showGoogle();
      } else void showTraffic();
    } else {
      trafficLayer?.remove();
      trafficLayer = null;
    }
    mark();
  };

  // The switch, only with a key and with controls: without a key the map is OpenStreetMap, as before.
  const switcher =
    key && controls
      ? new (L.Control.extend({
          onAdd() {
            const bar = L.DomUtil.create('div', 'map-switch-bar');
            const group = L.DomUtil.create('div', 'leaflet-bar map-switch', bar);
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
            const toggle = L.DomUtil.create('div', 'leaflet-bar map-switch', bar);
            const button = L.DomUtil.create('button', '', toggle) as HTMLButtonElement;
            button.type = 'button';
            button.textContent = 'Tráfico';
            button.title = 'El tráfico de ahora, de Google Maps';
            button.addEventListener('click', toggleTraffic);
            trafficButton = button;
            L.DomEvent.disableClickPropagation(bar);
            L.DomEvent.disableScrollPropagation(bar);
            return bar;
          },
        }))({ position: 'bottomright' })
      : null;

  // The traffic of now, while it shows and the page is in sight.
  const every = window.setInterval(() => {
    if (traffic && trafficLayer && !fallback && document.visibilityState === 'visible') void showTraffic(true);
  }, TRAFFIC_EVERY_MS);

  // The streets follow the panel's dark mode: Google's night colors, never Google's tiles darkened.
  const themeChanged = () => {
    if (key && !fallback && google) void showGoogle();
  };
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener?.('change', themeChanged);
  const theme = new MutationObserver(themeChanged);
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

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
  const fullControl = controls
    ? new (L.Control.extend({
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
      }))({ position: 'topleft' })
    : null;

  fullControl?.addTo(m);
  switcher?.addTo(m);
  mark();
  if (controls) {
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onScreen);
  }
  if (key) void showGoogle();
  else showStreets();

  return () => {
    alive = false;
    window.clearTimeout(waiting);
    window.clearTimeout(retry);
    window.clearInterval(every);
    media?.removeEventListener?.('change', themeChanged);
    theme.disconnect();
    setFull(false);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('fullscreenchange', onScreen);
    m.off('moveend', moved);
    fullControl?.remove();
    switcher?.remove();
    logo.remove();
  };
}
