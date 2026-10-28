// Leaflet map of the fleet: one marker per truck with a known position, coloured by state, and optionally the route of
// the selected trip. Markers are reused between refreshes and glide to each new position (decision of 18/10/2026), so
// the map neither flickers nor jumps every few seconds; the route of the selected truck reaches the marker.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { type RefObject, useEffect, useRef } from 'react';
import { DEFAULT_CENTER, DEFAULT_ZOOM, LIVE_REFRESH_MS } from '../config';
import { GAP_STYLE, mapView, ROUTE_STYLE } from './mapView';
import type { RoutePoint } from '../data/api';
import { type FleetUnit, STATE_LABEL, unitTitle } from '../lib/fleet';
import { type Glide, glideAt, type Point, startGlide, tailStart } from '../lib/glide';
import { drawable, routeRuns } from '../lib/route';
import { pointTitle, type RoadPoint } from '../lib/road';

/** A driver with the app open and no trip, where the phone is («chofer activo»). */
export interface PersonMark {
  key: string;
  name: string;
  lat: number;
  lng: number;
}

const NO_PEOPLE: readonly PersonMark[] = [];
/** Points show their names from this zoom on; from farther, only their dots (the name shows on hover). */
const POINT_NAMES_FROM = 10;

interface Props {
  units: readonly FleetUnit[];
  /** Drivers with the app open and no trip: drawn apart from the trucks, since the phone is not always in the truck. */
  people?: readonly PersonMark[];
  selected?: string | null;
  onSelect?: (key: string) => void;
  route?: readonly RoutePoint[] | null;
  /** Changing it fits the map to every truck again. */
  fitToken?: number;
  label: string;
  className?: string;
  roadPoints?: readonly RoadPoint[];
  focusPoint?: RoadPoint | null;
  onPointSelect?: (point: RoadPoint) => void;
  onPickLocation?: (location: { latitude: number; longitude: number }) => void;
  /** The satellite view and the full screen (GPS en vivo); the map of Inicio stays the plain street map. */
  tools?: boolean;
  /** What goes over the whole screen with the map: the box that holds it with its own buttons. */
  fullTarget?: RefObject<HTMLElement | null>;
}

/** A marker on the map: where it is drawn now, where it is going, and the glide between the two. */
interface Shown {
  marker: L.Marker;
  look: string;
  drawn: Point;
  target: Point;
  glide: Glide | null;
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

function personElement(p: PersonMark, selected: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = `fm fm-person${selected ? ' fm-selected' : ''}`;
  const dot = document.createElement('span');
  dot.className = 'fm-dot';
  const tag = document.createElement('span');
  tag.className = 'fm-tag';
  tag.textContent = p.name.split(' ')[0] || p.name;
  el.append(dot, tag);
  return el;
}

const located = (u: FleetUnit): u is FleetUnit & { lat: number; lng: number } => u.lat !== null && u.lng !== null;

/**
 * Reduced motion turns the map animations off. It has to be done in Leaflet itself: its zoom animation waits for a CSS
 * transition, and with transitions switched off the map would stay half-zoomed and ignore every later move. The trucks
 * then jump to each new position instead of gliding.
 */
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function FleetMap({
  units,
  people = NO_PEOPLE,
  selected = null,
  onSelect,
  route = null,
  fitToken = 0,
  label,
  className = '',
  roadPoints,
  focusPoint,
  onPointSelect,
  onPickLocation,
  tools = false,
  fullTarget,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, Shown>());
  const routeLayer = useRef<L.LayerGroup | null>(null);
  // The line from the last reading of the selected route to its truck, redrawn while the truck glides.
  const tail = useRef<{ from: Point | null; line: L.Polyline | null }>({ from: null, line: null });
  const frame = useRef(0);
  const fitted = useRef(-1);
  const select = useRef(onSelect);
  select.current = onSelect;
  const chosen = useRef(selected);
  chosen.current = selected;

  const drawTail = () => {
    const layer = routeLayer.current;
    const { from, line } = tail.current;
    const truck = chosen.current ? markers.current.get(chosen.current) : undefined;
    if (!layer || !from || !truck) {
      line?.remove();
      tail.current.line = null;
      return;
    }
    if (line) line.setLatLngs([from, truck.drawn]);
    else tail.current.line = L.polyline([from, truck.drawn], { className: 'fm-route fm-tail', weight: 4, opacity: 0.9 }).addTo(layer);
  };

  // One animation loop for every truck that is gliding; it stops once they have all arrived.
  const step = () => {
    frame.current = 0;
    const now = performance.now();
    let moving = false;
    for (const shown of markers.current.values()) {
      if (!shown.glide) continue;
      const { at, done } = glideAt(shown.glide, now);
      shown.drawn = at;
      shown.marker.setLatLng(at);
      if (done) shown.glide = null;
      else moving = true;
    }
    drawTail();
    if (moving) frame.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    if (!box.current) return;
    const still = calm();
    const m = L.map(box.current, {
      zoomControl: true,
      attributionControl: true,
      zoomAnimation: !still,
      fadeAnimation: !still,
      markerZoomAnimation: !still,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    // Inicio's small map has only the base: Google's streets with a key, without the switch or the full screen.
    const undoView = tools ? mapView(m, { full: () => fullTarget?.current ?? null }) : mapView(m, { controls: false });
    routeLayer.current = L.layerGroup().addTo(m);
    map.current = m;
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(box.current);
    const known = markers.current;
    return () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      resize.disconnect();
      known.clear();
      undoView();
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    const now = performance.now();
    const still = calm();
    const marks = [
      ...units.filter(located).map((u) => ({
        key: u.key,
        to: [u.lat, u.lng] as Point,
        look: `${u.state}|${u.plate}|${u.model}|${u.key === selected}`,
        title: `${unitTitle(u)} · ${STATE_LABEL[u.state]}`,
        element: () => markerElement(u, u.key === selected),
      })),
      ...people.map((p) => ({
        key: p.key,
        to: [p.lat, p.lng] as Point,
        look: `person|${p.name}|${p.key === selected}`,
        title: `${p.name} · con la app abierta, sin viaje`,
        element: () => personElement(p, p.key === selected),
      })),
    ];
    for (const u of marks) {
      seen.add(u.key);
      const { to, look, title } = u;
      const current = markers.current.get(u.key);
      if (current) {
        if (current.target[0] !== to[0] || current.target[1] !== to[1]) {
          current.target = to;
          // From where it is drawn, even halfway through the previous glide, to the new position, over about the time
          // until the next one arrives; a long move (or reduced motion) is a jump.
          current.glide = still ? null : startGlide([current.drawn, to], now, LIVE_REFRESH_MS);
          if (!current.glide) {
            current.drawn = to;
            current.marker.setLatLng(to);
          } else if (frame.current === 0) frame.current = requestAnimationFrame(step);
        }
        if (current.look !== look) {
          current.marker.setIcon(L.divIcon({ html: u.element(), className: 'fm-wrap', iconSize: undefined }));
          current.marker.options.title = title;
          current.look = look;
        }
        current.marker.setZIndexOffset(u.key === selected ? 1000 : 0);
        continue;
      }
      const marker = L.marker(to, {
        icon: L.divIcon({ html: u.element(), className: 'fm-wrap', iconSize: undefined }),
        title,
        keyboard: true,
        riseOnHover: true,
      })
        .on('click', () => select.current?.(u.key))
        .addTo(m);
      markers.current.set(u.key, { marker, look, drawn: to, target: to, glide: null });
    }
    for (const [key, { marker }] of markers.current) {
      if (!seen.has(key)) {
        marker.remove();
        markers.current.delete(key);
      }
    }
    if (fitted.current !== fitToken && marks.length > 0) {
      fitted.current = fitToken;
      m.fitBounds(L.latLngBounds(marks.map((u) => u.to)), { padding: [48, 48], maxZoom: 12, animate: !calm() });
    }
  }, [units, people, selected, fitToken]);

  // Centre on the selected truck or driver when the selection changes, or once it first gets a position (opened from a
  // link). Not on every refresh: that would pull the map back while the user is looking around.
  const target = units.find((x) => x.key === selected);
  const chosenPerson = people.find((p) => p.key === selected);
  const focus = target && located(target) ? target : (chosenPerson ?? null);
  const targetReady = focus !== null;
  useEffect(() => {
    const m = map.current;
    if (!m || !focus) return;
    const zoom = Math.max(m.getZoom(), 11);
    if (calm()) m.setView([focus.lat, focus.lng], zoom, { animate: false });
    else m.flyTo([focus.lat, focus.lng], zoom, { duration: 0.6 });
  }, [selected, targetReady]);

  // The first time the route of a selected trip arrives, show the whole trip; later refreshes keep the user's view.
  const routeShown = useRef<string | null>(null);
  useEffect(() => {
    const layer = routeLayer.current;
    if (!layer) return;
    layer.clearLayers();
    tail.current.line = null;
    // Readings without a fix are left out, and a pause or a gap without signal leaves the route open, as in the app.
    const runs = route ? routeRuns(route) : [];
    const all = runs.flatMap((r) => r.points);
    // Nothing selected, or a selection without a route (a truck without a trip, a driver): the route shown is forgotten,
    // so choosing that trip again shows all of it again.
    if (!selected || all.length === 0) routeShown.current = null;
    if (all.length === 0) return;
    const m = map.current;
    if (m && selected && routeShown.current !== selected && all.length > 1) {
      routeShown.current = selected;
      m.fitBounds(L.latLngBounds(all), { padding: [56, 56], maxZoom: 13, animate: !calm() });
    }
    // A stretch without signal goes dashed, along its estimated road or straight while the road comes.
    for (const r of runs) if (r.points.length > 1) L.polyline(r.points, r.estimated ? GAP_STYLE : ROUTE_STYLE).addTo(layer);
    const [first] = all;
    if (first) L.circleMarker(first, { radius: 6, className: 'fm-start', weight: 3 }).bindTooltip('Salida').addTo(layer);
  }, [route, selected]);

  // The route is saved every few seconds and read every few more, so its last reading is behind the truck: while the
  // truck is on a trip with signal a line joins the two, and follows the truck as it glides.
  const from = target && route ? tailStart(drawable(route).at(-1), target) : null;
  useEffect(() => {
    tail.current.from = from;
    drawTail();
  });

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const layer = L.layerGroup().addTo(m);
    for (const p of roadPoints ?? []) {
      const title = pointTitle(p);
      const text = document.createElement('span');
      text.textContent = title;
      const marker = L.marker([p.latitude, p.longitude], {
        title,
        icon: L.divIcon({ className: `road-marker road-${p.kind}`, html: text, iconSize: [26, 26] }),
      }).addTo(layer);
      marker.on('click', () => onPointSelect?.(p));
    }
    // From far away the names of every toll and scale of the country would cover the map and each other.
    const names = () => m.getContainer().classList.toggle('points-far', m.getZoom() < POINT_NAMES_FROM);
    names();
    m.on('zoomend', names);
    return () => {
      m.off('zoomend', names);
      layer.remove();
    };
  }, [roadPoints, onPointSelect]);
  useEffect(() => {
    if (focusPoint) map.current?.setView([focusPoint.latitude, focusPoint.longitude], 15, { animate: !calm() });
  }, [focusPoint]);
  useEffect(() => {
    const m = map.current;
    if (!m || !onPickLocation) return;
    const pick = (e: L.LeafletMouseEvent) => onPickLocation({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    m.on('click', pick);
    return () => {
      m.off('click', pick);
    };
  }, [onPickLocation]);
  return <div ref={box} className={`fleet-map ${className}`} role="region" aria-label={label} />;
}
