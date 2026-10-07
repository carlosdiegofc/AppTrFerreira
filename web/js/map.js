// Leaflet maps (loaded as a classic script in index.html, so it is available as window.L).
const L = window.L;

const STYLES = {
  streets: { label: 'Rutas y ciudades', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max: 19, attribution: '© OpenStreetMap' },
  satellite: { label: 'Satélite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', max: 19, attribution: 'Imágenes © Esri' },
};
const REFERENCES = ['World_Transportation', 'World_Boundaries_and_Places']
  .map((name) => `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/${name}/MapServer/tile/{z}/{y}/{x}`);

export const COLORS = { route: '#1c64f2', suggested: '#e8590c', origin: '#0c8a5a', destination: '#10233d', end: '#b62f34' };

export function createMap(el, { center = [-32.8, -56], zoom = 6 } = {}) {
  const map = L.map(el, { zoomControl: true, attributionControl: true }).setView(center, zoom);
  let layers = [];
  const setStyle = (name) => {
    layers.forEach((l) => map.removeLayer(l));
    const s = STYLES[name] || STYLES.streets;
    layers = [L.tileLayer(s.url, { maxZoom: 19, maxNativeZoom: s.max, attribution: s.attribution }).addTo(map)];
    if (name === 'satellite') {
      REFERENCES.forEach((url) => layers.push(L.tileLayer(url, { maxZoom: 19, attribution: 'Referencias © Esri' }).addTo(map)));
    }
    layers[0].bringToBack();
  };
  setStyle('streets');
  const Switch = L.Control.extend({
    onAdd() {
      const select = L.DomUtil.create('select', 'map-style');
      select.setAttribute('aria-label', 'Vista del mapa');
      for (const [key, s] of Object.entries(STYLES)) {
        const o = L.DomUtil.create('option', '', select);
        o.value = key;
        o.textContent = s.label;
      }
      select.addEventListener('change', () => setStyle(select.value));
      L.DomEvent.disableClickPropagation(select);
      return select;
    },
  });
  map.addControl(new Switch({ position: 'topright' }));
  return map;
}

const SVG = {
  plant: '<path d="M3 20V10l5-3v3l5-3v3l5-3v13z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M7 14h2M11 14h2M15 14h2" stroke="#fff" stroke-width="1.8"/>',
  flag: '<path d="M6 21V4M6 4h11l-2 4 2 4H6" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>',
  truck: '<path d="M3 6h11v9H3zM14 9h4l3 3v3h-7z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><circle cx="7" cy="17" r="2" fill="#fff"/><circle cx="17" cy="17" r="2" fill="#fff"/>',
};

/** Round map marker: origin (plant), destination (flag) or truck. */
export function pin(kind, color) {
  const glyph = kind === 'origin' ? SVG.plant : kind === 'destination' ? SVG.flag : SVG.truck;
  const fill = color || (kind === 'origin' ? COLORS.origin : kind === 'destination' ? COLORS.destination : COLORS.route);
  return L.divIcon({
    className: 'map-pin',
    html: `<span style="background:${fill}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${glyph}</svg></span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
}

// Leaflet treats string content as HTML: labels (which can contain text typed by drivers) go in as text nodes.
export function textNode(text) {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

export function marker(latlng, kind, label, color) {
  const m = L.marker(latlng, { icon: pin(kind, color), keyboard: true, title: label || '' });
  if (label) m.bindTooltip(textNode(label), { direction: 'top', offset: [0, -16] });
  return m;
}

export function lines(latlngLines, { color = COLORS.route, weight = 5, dashed = false } = {}) {
  return L.featureGroup(latlngLines.filter((l) => l.length > 1)
    .map((l) => L.polyline(l, { color, weight, opacity: dashed ? 0.8 : 0.95, dashArray: dashed ? '10 8' : null })));
}

// Automatic framing is never animated: leaving a screen in the middle of a zoom animation breaks Leaflet.
export function fit(map, latlngs, maxZoom = 15) {
  const valid = latlngs.filter(Boolean);
  if (valid.length === 1) map.setView(valid[0], Math.min(maxZoom, 12), { animate: false });
  else if (valid.length > 1) map.fitBounds(valid, { padding: [36, 36], maxZoom, animate: false });
}

export function focus(map, latlng, zoom = 13) {
  map.setView(latlng, zoom, { animate: false });
}

/** Removes a map safely even if the user was zooming or panning it. */
export function destroy(map) {
  if (!map) return;
  try { map.stop(); } catch { /* nothing running */ }
  try { map.off(); map.remove(); } catch { /* already gone */ }
}

export const featureGroup = (items = []) => L.featureGroup(items);
export const circle = (latlng, opts) => L.circleMarker(latlng, opts);
