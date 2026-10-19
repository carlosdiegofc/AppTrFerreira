// Trucks and live fleet state, with the rules of the Android app (FleetStats.kt and the owner fleet screen of
// MainActivity.kt) so that the panel and the phones always agree. Pure functions: no network, no React.
import { validPosition } from './route';

export interface CatalogTruck {
  model: string;
  plate: string;
}

export const NO_TRUCK = 'Sin camión asignado';
/** The app writes "Sin camión asignado" when the driver did not pick a truck: that is not a truck. */
const noTruck = /^sin cami[oó]n/i;

/** Trimmed text, or null when there is nothing written. */
export function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function truck(label: string | null | undefined): string | null {
  const t = text(label);
  return t !== null && !noTruck.test(t) ? t : null;
}

/** How the app writes a truck in a trip: "Ford Cargo 1722 · GTP4265". Older trips may carry only the model. */
export function truckLabel(t: CatalogTruck): string {
  return [t.model.trim(), t.plate.trim()].filter((s) => s !== '').join(' · ');
}

export function truckParts(label: string): CatalogTruck {
  const cut = label.indexOf(' · ');
  return cut < 0 ? { model: label.trim(), plate: '' } : { model: label.slice(0, cut).trim(), plate: label.slice(cut + 3).trim() };
}

const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/**
 * The catalog truck a label refers to, so that trips saved with an older label ("Ford Cargo", "Mercedes-Benz 1618")
 * count for the current one ("Ford Cargo 1722 · GTP4265"). A plate decides on its own; without a plate the model has to
 * point to exactly one truck. Anything else keeps its own label.
 */
export function canonical(label: string | null | undefined, fleet: readonly CatalogTruck[]): string | null {
  const t = truck(label);
  if (t === null) return null;
  const cut = t.indexOf(' · ');
  const model = squash(cut < 0 ? t : t.slice(0, cut));
  const plate = squash(cut < 0 ? '' : t.slice(cut + 3));
  let match: CatalogTruck[];
  if (plate !== '') match = fleet.filter((u) => squash(u.plate) === plate);
  else if (model === '') match = [];
  else {
    match = fleet.filter((u) => squash(u.plate) === model);
    if (match.length === 0) match = fleet.filter((u) => squash(u.model) === model);
    if (match.length === 0 && model.length >= 3) {
      match = fleet.filter((u) => {
        const m = squash(u.model);
        return m !== '' && (m.startsWith(model) || model.startsWith(m));
      });
    }
  }
  const only = match.length === 1 && match[0] ? truckLabel(match[0]) : '';
  return only !== '' ? only : t;
}

/** Trucks of the catalog the office keeps for the phones (trf_mobile_catalog, "equipos"). */
export function catalogTrucks(data: unknown): CatalogTruck[] {
  let value = data;
  // The column is jsonb, but older rows were saved as text holding JSON.
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  const equipos = value !== null && typeof value === 'object' ? (value as { equipos?: unknown }).equipos : undefined;
  if (!Array.isArray(equipos)) return [];
  return equipos
    .map((e: unknown) => {
      const row = (e ?? {}) as { tipo?: unknown; matriculaCamion?: unknown };
      return { model: text(row.tipo) ?? '', plate: text(row.matriculaCamion) ?? '' };
    })
    .filter((t) => t.model !== '' || t.plate !== '');
}

export type FleetState = 'moving' | 'stopped' | 'paused' | 'nosignal' | 'idle';

/** Without a reading for this long a truck on a trip shows as "Sin señal". */
export const NO_SIGNAL_AFTER_MS = 15 * 60_000;
/** From this speed a truck counts as on the road. */
export const MOVING_FROM_KMH = 5;

export interface LastPoint {
  latitude: number;
  longitude: number;
  speed_kmh: number | null;
  recorded_at: string;
}

export interface ActiveTrip {
  id: string;
  driver_id: string;
  driver_name: string;
  vehicle: string;
  started_at: string;
  paused: boolean;
  load_type: string;
  distance_meters: number;
  last: LastPoint | null;
}

/** The latest position of a driver, as the phone sends it with each reading (one row per driver). */
export interface LivePosition extends LastPoint {
  driver_id: string;
}

/**
 * Each trip in progress with its driver's latest position, when that position was read during the trip (the same time
 * window as the route); a position from before the trip, like the end of the previous one, is not this trip's.
 */
export function withLivePositions(active: readonly ActiveTrip[], positions: readonly LivePosition[]): ActiveTrip[] {
  const byDriver = new Map(positions.map((p) => [p.driver_id, p]));
  return active.map((trip) => {
    const p = byDriver.get(trip.driver_id);
    const read = p ? Date.parse(p.recorded_at) : Number.NaN;
    const inTrip = p !== undefined && Number.isFinite(read) && read >= Date.parse(trip.started_at);
    return { ...trip, last: inTrip ? { latitude: p.latitude, longitude: p.longitude, speed_kmh: p.speed_kmh, recorded_at: p.recorded_at } : null };
  });
}

export interface FinishedTrip {
  driver_name: string;
  vehicle: string;
  ended_at: string | null;
  arrival_lat: number | null;
  arrival_lng: number | null;
}

export interface FleetUnit {
  /** Stable key for lists and map markers. */
  key: string;
  model: string;
  plate: string;
  driver: string;
  state: FleetState;
  speedKmh: number | null;
  /** GPS distance of the trip in progress. */
  meters: number;
  lat: number | null;
  lng: number | null;
  /** When the position was read (trip in progress) or when the last trip ended (idle truck), in milliseconds. */
  at: number | null;
  trip: ActiveTrip | null;
}

export function tripState(trip: ActiveTrip, now: number): FleetState {
  if (trip.paused) return 'paused';
  const at = trip.last ? Date.parse(trip.last.recorded_at) : Number.NaN;
  if (!Number.isFinite(at) || now - at > NO_SIGNAL_AFTER_MS) return 'nosignal';
  const kmh = trip.last?.speed_kmh;
  return typeof kmh === 'number' && Number.isFinite(kmh) && kmh >= MOVING_FROM_KMH ? 'moving' : 'stopped';
}

const ORDER: Record<FleetState, number> = { moving: 0, stopped: 1, paused: 2, nosignal: 3, idle: 4 };
const finite = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? n : null);
/** A position the map can show, or none: a reading without a fix (0,0) must not place a truck in the ocean. */
const place = (lat: number | null | undefined, lng: number | null | undefined) => (validPosition(lat, lng) ? { lat: lat as number, lng: lng as number } : { lat: null, lng: null });

/**
 * Every truck with its state: the ones on a trip first (on the road, stopped, paused, without signal), then the trucks
 * of the catalog that are not travelling, placed where their last trip ended. A trip saved with an older label still
 * marks its catalog truck as busy, so no truck shows twice.
 */
export function fleetUnits(active: readonly ActiveTrip[], finished: readonly FinishedTrip[], catalog: readonly CatalogTruck[], now: number): FleetUnit[] {
  const busy = new Set<string>();
  const travelling: FleetUnit[] = active.map((trip) => {
    const label = canonical(trip.vehicle, catalog);
    if (label !== null) busy.add(label);
    const { model, plate } = truckParts(label ?? '');
    const at = trip.last ? Date.parse(trip.last.recorded_at) : Number.NaN;
    return {
      key: 'trip:' + trip.id,
      model,
      plate,
      driver: text(trip.driver_name) ?? '',
      state: tripState(trip, now),
      speedKmh: finite(trip.last?.speed_kmh),
      meters: finite(trip.distance_meters) ?? 0,
      ...place(trip.last?.latitude, trip.last?.longitude),
      at: Number.isFinite(at) ? at : null,
      trip,
    };
  });
  travelling.sort((a, b) => ORDER[a.state] - ORDER[b.state] || truckLabel(a).localeCompare(truckLabel(b), 'es'));
  const idle: FleetUnit[] = [];
  for (const unit of catalog) {
    const label = truckLabel(unit);
    if (label === '' || busy.has(label)) continue;
    const last = finished.find((f) => canonical(f.vehicle, catalog) === label);
    const ended = last?.ended_at ? Date.parse(last.ended_at) : Number.NaN;
    idle.push({
      key: 'truck:' + label,
      model: unit.model,
      plate: unit.plate,
      driver: text(last?.driver_name) ?? '',
      state: 'idle',
      speedKmh: null,
      meters: 0,
      ...place(last?.arrival_lat, last?.arrival_lng),
      at: Number.isFinite(ended) ? ended : null,
      trip: null,
    });
  }
  return [...travelling, ...idle];
}

/**
 * The latest finished trip of each catalog truck in `trips` (newest first), added to `found` by truck label; trips of
 * trucks already found or outside the catalog are skipped.
 */
export function lastTripByTruck(trips: readonly FinishedTrip[], catalog: readonly CatalogTruck[], found = new Map<string, FinishedTrip>()): Map<string, FinishedTrip> {
  const labels = new Set(catalog.map(truckLabel));
  for (const t of trips) {
    const label = canonical(t.vehicle, catalog);
    if (label !== null && labels.has(label) && !found.has(label)) found.set(label, t);
  }
  return found;
}

export interface FleetCounts {
  moving: number;
  /** Stopped, paused and without signal: on a trip but not on the road. */
  halted: number;
  noSignal: number;
  idle: number;
}

export function fleetCounts(units: readonly FleetUnit[]): FleetCounts {
  return {
    moving: units.filter((u) => u.state === 'moving').length,
    halted: units.filter((u) => u.state === 'stopped' || u.state === 'paused' || u.state === 'nosignal').length,
    noSignal: units.filter((u) => u.state === 'nosignal').length,
    idle: units.filter((u) => u.state === 'idle').length,
  };
}

export const STATE_LABEL: Record<FleetState, string> = {
  moving: 'En ruta',
  stopped: 'Detenido',
  paused: 'Pausado',
  nosignal: 'Sin señal',
  idle: 'Sin viaje',
};

/** Title of a truck for lists: "Ford Cargo 1722 · GTP4265", or "Camión" when the trip has none. */
export function unitTitle(u: Pick<FleetUnit, 'model' | 'plate'>): string {
  return truckLabel(u) || 'Camión sin asignar';
}
