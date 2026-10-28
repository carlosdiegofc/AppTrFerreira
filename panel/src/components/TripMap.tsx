// Leaflet map of one trip. What the GPS measured (the route, open at pauses and signal gaps, where it started and where
// it ended or is now) and what was declared (the origin and destination the office or the driver typed) look different:
// a declared destination is never drawn as if the truck had reached it. On a trip in progress the truck glides along
// each refresh's new readings and the route grows behind it (decision of 18/10/2026).
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { DEFAULT_CENTER, DEFAULT_ZOOM, ROUTE_REFRESH_MS } from '../config';
import type { RoutePoint } from '../data/api';
import { type Glide, glideAt, grownTail, type Point, sameLines, startGlide } from '../lib/glide';
import { routeRuns } from '../lib/route';
import type { LatLng } from '../lib/trips';
import { GAP_STYLE, mapView, ROUTE_STYLE } from './mapView';

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

/** Same reason as in FleetMap: with reduced motion Leaflet's own animations are switched off, and the truck jumps. */
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A glide ends a little before the next refresh, so the truck is not still moving when new readings arrive. */
const GLIDE_MS = ROUTE_REFRESH_MS * 0.9;

export function TripMap({ route, start, end, declared, live, label }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  // The map frames the trip once, and again when the route arrives; later refreshes keep the user's view.
  const framed = useRef<'none' | 'places' | 'route'>('none');
  // The route lines as drawn in full the last time, to tell what a refresh added, and the glide along the new readings.
  const drawn = useRef<Point[][]>([]);
  const active = useRef<{ glide: Glide; kept: Point[] } | null>(null);
  const frame = useRef(0);
  const { origin, destination } = declared;

  useEffect(() => {
    if (!box.current) return;
    const still = calm();
    const m = L.map(box.current, { zoomControl: true, attributionControl: true, zoomAnimation: !still, fadeAnimation: !still, markerZoomAnimation: !still }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    // The street map or Google's satellite, and the full screen.
    const undoView = mapView(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(box.current);
    return () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      resize.disconnect();
      undoView();
      m.remove();
      map.current = null;
      framed.current = 'none';
      drawn.current = [];
      active.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    g.clearLayers();
    const runs = route ? routeRuns(route) : [];
    const lines: Point[][] = runs.map((r) => r.points);
    const all = lines.flat();
    // A trip in progress whose route only grew since the last draw: the truck glides along the new readings. A first
    // load, a new stretch after a pause or a long catch-up is drawn at once; a redraw that changed nothing on the route
    // (the trip's other data was read again) lets the glide go on.
    const unchanged = sameLines(drawn.current, lines);
    let run = unchanged && live ? active.current : null;
    if (!unchanged && live && !calm()) {
      const grown = grownTail(drawn.current, lines);
      const from = grown?.kept.at(-1);
      const glide = grown && from ? startGlide([from, ...grown.added], performance.now(), GLIDE_MS) : null;
      run = grown && glide ? { glide, kept: grown.kept } : null;
    }
    active.current = run;
    drawn.current = lines;
    // A stretch without signal goes dashed, along its estimated road or straight while the road comes.
    const routeDrawn = runs.map((r) => (r.points.length > 1 ? L.polyline(r.points, r.estimated ? GAP_STYLE : ROUTE_STYLE).addTo(g) : null));
    // Declared places first, so the measured markers stay on top where they coincide.
    if (origin) L.circleMarker(origin, { radius: 7, className: 'fm-declared', weight: 3, dashArray: '3 3' }).bindTooltip('Origen declarado').addTo(g);
    if (destination) L.circleMarker(destination, { radius: 7, className: 'fm-declared', weight: 3, dashArray: '3 3' }).bindTooltip('Destino declarado').addTo(g);
    const first = all[0] ?? start;
    const to = live ? (all.at(-1) ?? null) : (end ?? all.at(-1) ?? null);
    if (first) L.circleMarker(first, { radius: 6, className: 'fm-start', weight: 3 }).bindTooltip('Salida (GPS)').addTo(g);
    const now = to ? L.circleMarker(to, { radius: 7, className: live ? 'fm-now' : 'fm-end', weight: 3 }).bindTooltip(live ? 'Ahora (GPS)' : 'Llegada (GPS)').addTo(g) : null;
    const head = routeDrawn.at(-1);
    if (run && now && head) {
      const { glide, kept } = run;
      const step = () => {
        const { at, walked, done } = glideAt(glide, performance.now());
        head.setLatLngs([...kept, ...walked.slice(1)]);
        now.setLatLng(at);
        frame.current = done ? 0 : requestAnimationFrame(step);
        if (done) active.current = null;
      };
      step();
    }
    const places = [...all, ...[start, end, origin, destination].filter((p): p is LatLng => p !== null)];
    const wanted = all.length > 0 ? 'route' : 'places';
    if (places.length === 0 || framed.current === 'route' || framed.current === wanted) return;
    framed.current = wanted;
    if (places.length === 1 && places[0]) m.setView(places[0], 11, { animate: false });
    else m.fitBounds(L.latLngBounds(places), { padding: [40, 40], maxZoom: 13, animate: false });
  }, [route, start, end, origin, destination, live]);

  return <div ref={box} className="fleet-map map-trip" role="region" aria-label={label} />;
}
