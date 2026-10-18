// Leaflet map of one trip. What the GPS measured (the route, open at pauses and signal gaps, where it started and where
// it ended or is now) and what was declared (the origin and destination the office or the driver typed) look different:
// a declared destination is never drawn as if the truck had reached it.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { DEFAULT_CENTER, DEFAULT_ZOOM, TILE_ATTRIBUTION, TILE_URL } from '../config';
import type { RoutePoint } from '../data/api';
import { routeLines } from '../lib/route';
import type { LatLng } from '../lib/trips';

interface Props {
  route: readonly RoutePoint[] | null;
  /** Where the GPS saw the trip start. */
  start: LatLng | null;
  /** Where the GPS saw the trip end. */
  end: LatLng | null;
  /** Origin and destination as they were declared, not measured. */
  declared: { origin: LatLng | null; destination: LatLng | null };
  /** In progress: the last reading is where the truck is now. */
  live: boolean;
  label: string;
}

/** Same reason as in FleetMap: with reduced motion Leaflet's own animations are switched off. */
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function TripMap({ route, start, end, declared, live, label }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  // The map frames the trip once, and again when the route arrives; later refreshes keep the user's view.
  const framed = useRef<'none' | 'places' | 'route'>('none');
  const { origin, destination } = declared;

  useEffect(() => {
    if (!box.current) return;
    const still = calm();
    const m = L.map(box.current, { zoomControl: true, attributionControl: true, zoomAnimation: !still, fadeAnimation: !still, markerZoomAnimation: !still }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer(TILE_URL, { maxZoom: 18, attribution: TILE_ATTRIBUTION }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(box.current);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
      framed.current = 'none';
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const lines = route ? routeLines(route) : [];
    const all = lines.flat();
    for (const line of lines) if (line.length > 1) L.polyline(line, { className: 'fm-route', weight: 4, opacity: 0.9 }).addTo(g);
    // Declared places first, so the measured markers stay on top where they coincide.
    if (origin) L.circleMarker(origin, { radius: 7, className: 'fm-declared', weight: 3, dashArray: '3 3' }).bindTooltip('Origen declarado').addTo(g);
    if (destination) L.circleMarker(destination, { radius: 7, className: 'fm-declared', weight: 3, dashArray: '3 3' }).bindTooltip('Destino declarado').addTo(g);
    const from = all[0] ?? start;
    const to = live ? (all.at(-1) ?? null) : (end ?? all.at(-1) ?? null);
    if (from) L.circleMarker(from, { radius: 6, className: 'fm-start', weight: 3 }).bindTooltip('Salida (GPS)').addTo(g);
    if (to) L.circleMarker(to, { radius: 7, className: live ? 'fm-now' : 'fm-end', weight: 3 }).bindTooltip(live ? 'Ahora (GPS)' : 'Llegada (GPS)').addTo(g);
    const places = [...all, ...[start, end, origin, destination].filter((p): p is LatLng => p !== null)];
    const wanted = all.length > 0 ? 'route' : 'places';
    if (places.length === 0 || framed.current === 'route' || framed.current === wanted) return;
    framed.current = wanted;
    if (places.length === 1 && places[0]) m.setView(places[0], 11, { animate: false });
    else m.fitBounds(L.latLngBounds(places), { padding: [40, 40], maxZoom: 13, animate: false });
  }, [route, start, end, origin, destination, live]);

  return <div ref={box} className="fleet-map map-trip" role="region" aria-label={label} />;
}
