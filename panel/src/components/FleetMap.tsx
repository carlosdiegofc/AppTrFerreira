// Leaflet map of the fleet: one marker per truck with a known position, coloured by state, and optionally the route of
// the selected trip. Markers are reused between refreshes so the map does not flicker every 15 seconds.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { DEFAULT_CENTER, DEFAULT_ZOOM, TILE_ATTRIBUTION, TILE_URL } from '../config';
import type { RoutePoint } from '../data/api';
import { type FleetUnit, STATE_LABEL, unitTitle } from '../lib/fleet';

interface Props {
  units: readonly FleetUnit[];
  selected?: string | null;
  onSelect?: (key: string) => void;
  route?: readonly RoutePoint[] | null;
  /** Changing it fits the map to every truck again. */
  fitToken?: number;
  label: string;
  className?: string;
}

function markerElement(u: FleetUnit, selected: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = `fm fm-${u.state}${selected ? ' fm-selected' : ''}`;
  const dot = document.createElement('span');
  dot.className = 'fm-dot';
  const tag = document.createElement('span');
  tag.className = 'fm-tag';
  // Text comes from the database: textContent, never HTML.
  tag.textContent = u.plate || u.model || 'Camión';
  el.append(dot, tag);
  return el;
}

const located = (u: FleetUnit): u is FleetUnit & { lat: number; lng: number } => u.lat !== null && u.lng !== null;

/**
 * Reduced motion turns the map animations off. It has to be done in Leaflet itself: its zoom animation waits for a CSS
 * transition, and with transitions switched off the map would stay half-zoomed and ignore every later move.
 */
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function FleetMap({ units, selected = null, onSelect, route = null, fitToken = 0, label, className = '' }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, { marker: L.Marker; look: string }>());
  const routeLayer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(-1);
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    if (!box.current) return;
    const still = calm();
    const m = L.map(box.current, { zoomControl: true, attributionControl: true, zoomAnimation: !still, fadeAnimation: !still, markerZoomAnimation: !still }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer(TILE_URL, { maxZoom: 18, attribution: TILE_ATTRIBUTION }).addTo(m);
    routeLayer.current = L.layerGroup().addTo(m);
    map.current = m;
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(box.current);
    const known = markers.current;
    return () => {
      resize.disconnect();
      known.clear();
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    for (const u of units.filter(located)) {
      seen.add(u.key);
      const look = `${u.state}|${u.plate}|${u.model}|${u.key === selected}`;
      const title = `${unitTitle(u)} · ${STATE_LABEL[u.state]}`;
      const current = markers.current.get(u.key);
      if (current) {
        current.marker.setLatLng([u.lat, u.lng]);
        if (current.look !== look) {
          current.marker.setIcon(L.divIcon({ html: markerElement(u, u.key === selected), className: 'fm-wrap', iconSize: undefined }));
          current.marker.options.title = title;
          current.look = look;
        }
        current.marker.setZIndexOffset(u.key === selected ? 1000 : 0);
        continue;
      }
      const marker = L.marker([u.lat, u.lng], { icon: L.divIcon({ html: markerElement(u, u.key === selected), className: 'fm-wrap', iconSize: undefined }), title, keyboard: true, riseOnHover: true })
        .on('click', () => select.current?.(u.key))
        .addTo(m);
      markers.current.set(u.key, { marker, look });
    }
    for (const [key, { marker }] of markers.current) {
      if (!seen.has(key)) {
        marker.remove();
        markers.current.delete(key);
      }
    }
    const placed = units.filter(located);
    if (fitted.current !== fitToken && placed.length > 0) {
      fitted.current = fitToken;
      m.fitBounds(L.latLngBounds(placed.map((u) => [u.lat, u.lng] as [number, number])), { padding: [48, 48], maxZoom: 12, animate: !calm() });
    }
  }, [units, selected, fitToken]);

  // Centre on the selected truck when the selection changes, or once it first gets a position (opened from a link).
  // Not on every refresh: that would pull the map back while the user is looking around.
  const target = units.find((x) => x.key === selected);
  const targetReady = target !== undefined && located(target);
  useEffect(() => {
    const m = map.current;
    if (!m || !target || !located(target)) return;
    const zoom = Math.max(m.getZoom(), 11);
    if (calm()) m.setView([target.lat, target.lng], zoom, { animate: false });
    else m.flyTo([target.lat, target.lng], zoom, { duration: 0.6 });
  }, [selected, targetReady]);

  // The first time the route of a selected trip arrives, show the whole trip; later refreshes keep the user's view.
  const routeShown = useRef<string | null>(null);
  useEffect(() => {
    const layer = routeLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (!selected) routeShown.current = null;
    if (!route || route.length === 0) return;
    const m = map.current;
    if (m && selected && routeShown.current !== selected && route.length > 1) {
      routeShown.current = selected;
      m.fitBounds(L.latLngBounds(route.map((p) => [p.latitude, p.longitude] as [number, number])), { padding: [56, 56], maxZoom: 13, animate: !calm() });
    }
    // A new segment starts after a pause or a gap without signal: those stretches stay open, as in the app.
    let part: [number, number][] = [];
    let segment = route[0]?.segment;
    const flush = () => {
      if (part.length > 1) L.polyline(part, { className: 'fm-route', weight: 4, opacity: 0.9 }).addTo(layer);
      part = [];
    };
    for (const p of route) {
      if (p.segment !== segment) {
        flush();
        segment = p.segment;
      }
      part.push([p.latitude, p.longitude]);
    }
    flush();
    const first = route[0];
    if (first) L.circleMarker([first.latitude, first.longitude], { radius: 6, className: 'fm-start', weight: 3 }).bindTooltip('Salida').addTo(layer);
  }, [route, selected]);

  return <div ref={box} className={`fleet-map ${className}`} role="region" aria-label={label} />;
}
