// Live GPS tracking of every truck.
import { describeError } from '../api.js';
import { loadFleet } from '../data.js';
import * as maps from '../map.js';
import { banner, clear, h, plateBadge } from '../ui.js';
import { formatAgo, formatNumber, toNumber, validLatLng } from '../util.js';

const REFRESH_MS = 15000;
const STALE_MS = 5 * 60000;

function state(location, now) {
  const age = now - new Date(location.updated_at || location.recorded_at || 0).getTime();
  if (!location.is_tracking) return { code: 'off', label: 'Sin viaje activo', color: '#8a96a8' };
  if (!(age < STALE_MS)) return { code: 'warn', label: 'Sin señal ' + formatAgo(location.updated_at || location.recorded_at, now), color: '#c27a10' };
  return { code: 'ok', label: 'En viaje · ' + formatAgo(location.updated_at || location.recorded_at, now), color: '#0c8a5a' };
}

export function fleetView(root) {
  const mapEl = h('div', { class: 'map big' });
  const listEl = h('div', { class: 'fleet-list' });
  const infoEl = h('p', { class: 'muted' }, 'Cargando ubicaciones…');
  const messageEl = h('div');
  let map = null;
  let layer = null;
  let rows = [];
  let fitted = false;
  let timer = null;

  const fitAll = () => maps.fit(map, rows.map((r) => r.latlng), 13);

  async function refresh() {
    let data;
    try {
      data = await loadFleet();
    } catch (e) {
      clear(messageEl, banner('error', describeError(e), { label: 'Reintentar', run: refresh }));
      return;
    }
    if (!map) return;
    clear(messageEl);
    const now = Date.now();
    const activeByDriver = new Map(data.active.map((s) => [s.driver_id, s]));
    rows = data.locations
      .map((l) => ({ ...l, latlng: [toNumber(l.latitude), toNumber(l.longitude)], st: state(l, now), trip: activeByDriver.get(l.driver_id) }))
      .filter((r) => validLatLng(r.latlng[0], r.latlng[1]));
    if (layer) map.removeLayer(layer);
    layer = maps.featureGroup(rows.map((r) => {
      const m = maps.marker(r.latlng, 'truck', `${r.vehicle || 'Camión'} · ${r.driver_name || ''}`, r.st.color);
      const popup = document.createElement('div');
      popup.append(
        Object.assign(document.createElement('strong'), { textContent: r.vehicle || 'Sin camión' }),
        document.createElement('br'),
        document.createTextNode(`${r.driver_name || ''} · ${r.st.label}`),
      );
      if (r.st.code === 'ok' && r.speed_kmh !== null && r.speed_kmh !== undefined) popup.append(document.createElement('br'), document.createTextNode(`${formatNumber(r.speed_kmh, 0)} km/h`));
      if (r.trip) {
        const a = Object.assign(document.createElement('a'), { href: '#/viaje/app:' + r.trip.id, textContent: 'Ver viaje en curso' });
        popup.append(document.createElement('br'), a);
      }
      m.bindPopup(popup);
      return m;
    })).addTo(map);
    const moving = rows.filter((r) => r.st.code === 'ok').length;
    infoEl.textContent = `${rows.length} camión(es) con ubicación · ${moving} en viaje con señal reciente · se actualiza cada 15 s`;
    clear(listEl, rows.length ? rows.map((r) => h('div', { class: 'card fleet-card ' + r.st.code },
      h('div', { class: 'row between' }, plateBadge(r.vehicle, true), h('span', { class: 'dot ' + r.st.code, 'aria-hidden': 'true' })),
      h('strong', null, r.driver_name || 'Chofer'),
      h('span', { class: 'muted' }, r.st.label),
      r.st.code === 'ok' && r.speed_kmh !== null && r.speed_kmh !== undefined ? h('span', { class: 'speed' }, `${formatNumber(r.speed_kmh, 0)} km/h`) : null,
      h('div', { class: 'row gap' },
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => { maps.focus(map, r.latlng, 13); } }, 'Ver en el mapa'),
        r.trip ? h('a', { class: 'btn small ghost', href: '#/viaje/app:' + r.trip.id }, 'Ver viaje') : null)))
      : h('div', { class: 'empty' }, 'Todavía no hay ubicaciones. Aparecen cuando un chofer inicia un viaje con la app.'));
    if (!fitted && rows.length) { fitAll(); fitted = true; }
  }

  clear(root, h('section', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'Seguimiento GPS'), infoEl),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => fitAll() }, 'Ver toda la flota')),
    messageEl,
    h('div', { class: 'card map-card' }, mapEl,
      h('div', { class: 'legend' },
        h('span', null, h('i', { class: 'dot ok' }), 'En viaje'), h('span', null, h('i', { class: 'dot warn' }), 'Sin señal hace más de 5 min'),
        h('span', null, h('i', { class: 'dot off' }), 'Sin viaje activo'))),
    listEl));

  map = maps.createMap(mapEl);
  refresh();
  timer = setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
  return () => { clearInterval(timer); maps.destroy(map); map = null; };
}
