// Trips as the office reads them: each trip the app recorded, with what the office completed in the panel on top (the
// panel wins), plus the trips typed by hand in the panel. Same rules as web/js/trips.js. Pure functions.
import type { Tables } from './database.types';
import { addDays, calendarDay, firstOfMonth, firstOfNextMonth, startOfDay } from './dates';
import { belongsTo } from './drivers';
import { canonical, type CatalogTruck, text, truck } from './fleet';
import { asObject, fold, toNumber } from './numbers';
import { validPosition } from './route';

export type LatLng = [number, number];
export type SessionRow = Tables<'trf_driver_tracking_sessions'>;
export type PanelTripRow = Tables<'trf_panel_trips'>;
export type DetailRow = Pick<Tables<'trf_trip_details'>, 'trip_id' | 'data'>;
export type FuelRow = Tables<'trf_driver_fuel_receipts'>;

export type TripStatusCode = 'pending' | 'running' | 'complete' | 'deleted';

export interface TripStatus {
  code: TripStatusCode;
  label: string;
  /** What the office still has to complete, in the words of the screen. */
  missing: string[];
}

export interface Trip {
  /** "app:<id>" for a trip recorded by the app, "web:<id>" for one typed in the panel: the address of its page. */
  key: string;
  source: 'app' | 'manual';
  appTripId: string | null;
  panelId: string | null;
  deleted: boolean;
  deletedAt: string | null;
  active: boolean;
  paused: boolean;
  driverId: string | null;
  driverName: string | null;
  /** The catalog truck when the label points to one, else the label as written. */
  vehicle: string | null;
  departureAt: string | null;
  arrivalAt: string | null;
  gpsKm: number | null;
  loadType: string | null;
  orderNumber: string | null;
  client: string | null;
  product: string | null;
  originName: string | null;
  origin: LatLng | null;
  /** Where the GPS saw the trip start and end. */
  gpsStart: LatLng | null;
  destinationName: string | null;
  destination: LatLng | null;
  gpsEnd: LatLng | null;
  billableKm: number | null;
  kg: number | null;
  amount: number | null;
  currency: 'UYU' | 'USD';
  notes: string | null;
  updatedAt: string | null;
  status: TripStatus;
}

export const EMPTY_RETURN = 'Retorno vacío';

function place(lat: unknown, lng: unknown): LatLng | null {
  const a = toNumber(lat);
  const b = toNumber(lng);
  return validPosition(a, b) ? [a as number, b as number] : null;
}

const first = (...values: (string | null)[]) => values.find((v) => v !== null) ?? null;
const firstNumber = (...values: (number | null)[]) => values.find((v) => v !== null) ?? null;

export function missingFields(trip: Pick<Trip, 'vehicle' | 'originName' | 'destinationName' | 'client' | 'product' | 'loadType'>): string[] {
  const missing: string[] = [];
  if (!trip.vehicle) missing.push('Camión');
  if (!trip.originName) missing.push('Origen');
  if (!trip.destinationName) missing.push('Destino');
  if (trip.loadType !== 'empty') {
    if (!trip.client) missing.push('Cliente');
    if (!trip.product) missing.push('Producto');
  }
  return missing;
}

export function tripStatus(trip: Omit<Trip, 'status'>): TripStatus {
  const missing = missingFields(trip);
  if (trip.deleted) return { code: 'deleted', label: 'Eliminado', missing };
  if (trip.active) return { code: 'running', label: trip.paused ? 'En curso · pausado' : 'En curso', missing };
  if (missing.length > 0) return { code: 'pending', label: 'Pendiente de completar', missing };
  return { code: 'complete', label: 'Completo', missing };
}

const withStatus = (trip: Omit<Trip, 'status'>): Trip => ({ ...trip, status: tripStatus(trip) });

/** A trip recorded by the app, plus what the office completed in the panel (panel values win). */
export function tripFromSession(session: SessionRow, panel: PanelTripRow | null | undefined, detail: DetailRow | null | undefined, catalog: readonly CatalogTruck[] = []): Trip {
  const d = asObject(detail?.data);
  const empty = session.load_type === 'empty';
  const meters = toNumber(session.distance_meters);
  return withStatus({
    key: 'app:' + session.id,
    source: 'app',
    appTripId: session.id,
    panelId: panel?.id ?? null,
    deleted: Boolean(panel?.deleted_at),
    deletedAt: panel?.deleted_at ?? null,
    active: session.active === true,
    paused: session.paused === true,
    driverId: session.driver_id ?? null,
    driverName: first(text(panel?.driver_name), text(session.driver_name)),
    vehicle: canonical(first(text(panel?.vehicle), truck(session.vehicle)), catalog),
    departureAt: session.started_at ?? null,
    arrivalAt: session.ended_at ?? null,
    gpsKm: meters === null ? null : meters / 1000,
    loadType: session.load_type ?? null,
    orderNumber: text(panel?.order_number),
    client: first(text(panel?.client), text(d.cliente)),
    product: first(text(panel?.product), text(d.tipoCarga), empty ? EMPTY_RETURN : null),
    originName: text(panel?.origin_name),
    origin: place(panel?.origin_lat, panel?.origin_lng) ?? place(session.origin_lat, session.origin_lng),
    gpsStart: place(session.origin_lat, session.origin_lng),
    destinationName: first(text(panel?.destination_name), text(d.destino)),
    destination: place(panel?.destination_lat, panel?.destination_lng) ?? place(d.destination_lat, d.destination_lng),
    gpsEnd: place(session.arrival_lat, session.arrival_lng),
    billableKm: toNumber(panel?.billable_km),
    kg: firstNumber(toNumber(panel?.kg), toNumber(d.kg)),
    amount: toNumber(panel?.amount),
    currency: panel?.currency === 'USD' ? 'USD' : 'UYU',
    notes: text(panel?.notes),
    updatedAt: panel?.updated_at ?? null,
  });
}

/** A trip typed by hand in the panel. */
export function tripFromPanel(p: PanelTripRow, catalog: readonly CatalogTruck[] = []): Trip {
  return withStatus({
    key: 'web:' + p.id,
    source: 'manual',
    appTripId: null,
    panelId: p.id,
    deleted: Boolean(p.deleted_at),
    deletedAt: p.deleted_at ?? null,
    active: false,
    paused: false,
    driverId: p.driver_id ?? null,
    driverName: text(p.driver_name),
    vehicle: canonical(truck(p.vehicle), catalog),
    departureAt: p.departure_at ?? null,
    arrivalAt: p.arrival_at ?? null,
    gpsKm: null,
    loadType: null,
    orderNumber: text(p.order_number),
    client: text(p.client),
    product: text(p.product),
    originName: text(p.origin_name),
    origin: place(p.origin_lat, p.origin_lng),
    gpsStart: null,
    destinationName: text(p.destination_name),
    destination: place(p.destination_lat, p.destination_lng),
    gpsEnd: null,
    billableKm: toNumber(p.billable_km),
    kg: toNumber(p.kg),
    amount: toNumber(p.amount),
    currency: p.currency === 'USD' ? 'USD' : 'UYU',
    notes: text(p.notes),
    updatedAt: p.updated_at ?? null,
  });
}

const time = (v: string | null) => {
  const t = v ? Date.parse(v) : Number.NaN;
  return Number.isNaN(t) ? 0 : t;
};

/** App trips (each with its panel row and the phone's details, when they exist) and manual trips, newest first. */
export function mergeTrips({ sessions, panelRows, details }: { sessions: readonly SessionRow[]; panelRows: readonly PanelTripRow[]; details: readonly DetailRow[] }, catalog: readonly CatalogTruck[] = []): Trip[] {
  const panelByApp = new Map<string, PanelTripRow>();
  const manual = new Map<string, PanelTripRow>();
  for (const p of panelRows) {
    if (p.source === 'app' && p.app_trip_id) panelByApp.set(p.app_trip_id, p);
    else if (p.source === 'manual' && p.id) manual.set(p.id, p);
  }
  const detailByTrip = new Map(details.map((d) => [d.trip_id, d]));
  const bySession = new Map<string, SessionRow>();
  for (const s of sessions) if (s?.id) bySession.set(s.id, s);
  const list: Trip[] = [];
  for (const [id, s] of bySession) list.push(tripFromSession(s, panelByApp.get(id), detailByTrip.get(id), catalog));
  for (const p of manual.values()) list.push(tripFromPanel(p, catalog));
  return list.sort((a, b) => time(b.departureAt) - time(a.departureAt) || a.key.localeCompare(b.key));
}

export type StatusFilter = 'all' | 'pending' | 'running' | 'complete';

export interface TripFilter {
  q?: string;
  status?: StatusFilter;
  vehicle?: string;
  driver?: string;
  /** A driver's card: the trips of its app account under any name, and the ones typed in the panel with its name. */
  card?: { userId: string | null; name: string } | null;
  /** The trash: only deleted trips. */
  bin?: boolean;
}

export function filterTrips(list: readonly Trip[], { q = '', status = 'all', vehicle = '', driver = '', card = null, bin = false }: TripFilter = {}): Trip[] {
  const needle = fold(q);
  return list.filter((t) => {
    if (bin !== t.deleted) return false;
    if (!bin && status !== 'all' && t.status.code !== status) return false;
    if (vehicle && (t.vehicle ?? '') !== vehicle) return false;
    if (driver && (t.driverName ?? '') !== driver) return false;
    if (card && !belongsTo(card, t)) return false;
    if (!needle) return true;
    return [t.orderNumber, t.client, t.product, t.originName, t.destinationName, t.driverName, t.vehicle, t.notes].some((v) => v !== null && fold(v).includes(needle));
  });
}

export interface StatusCounts {
  all: number;
  pending: number;
  running: number;
  complete: number;
  deleted: number;
}

export function countByStatus(list: readonly Trip[]): StatusCounts {
  const c: StatusCounts = { all: 0, pending: 0, running: 0, complete: 0, deleted: 0 };
  for (const t of list) {
    if (t.deleted) {
      c.deleted++;
      continue;
    }
    c.all++;
    if (t.status.code !== 'deleted') c[t.status.code]++;
  }
  return c;
}

/** The trucks and drivers that appear in a list, for the filters. */
export function knownValues(list: readonly Trip[]): { vehicles: string[]; drivers: string[] } {
  const sorted = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => v !== null))].sort((a, b) => a.localeCompare(b, 'es'));
  return { vehicles: sorted(list.map((t) => t.vehicle)), drivers: sorted(list.map((t) => t.driverName)) };
}

/** Parses the trip part of a page address ("app:<uuid>" or "web:<uuid>"). */
export function parseTripKey(key: string | undefined): { kind: 'app' | 'web'; id: string } | null {
  const m = /^(app|web):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(key ?? '');
  return m ? { kind: m[1] as 'app' | 'web', id: (m[2] as string).toLowerCase() } : null;
}

export type PeriodKind = '30' | 'month' | 'prev-month' | '90' | 'custom';

/** Calendar days (inclusive) of a period, counted from today in Uruguay. */
export function periodRange(kind: Exclude<PeriodKind, 'custom'>, today: string): { from: string; to: string } {
  switch (kind) {
    case 'month':
      return { from: firstOfMonth(today), to: addDays(firstOfNextMonth(today), -1) };
    case 'prev-month': {
      const first = firstOfMonth(today);
      return { from: firstOfMonth(addDays(first, -1)), to: addDays(first, -1) };
    }
    case '90':
      return { from: addDays(today, -89), to: today };
    default:
      return { from: addDays(today, -29), to: today };
  }
}

/** Inclusive calendar days in Uruguay → the instants [fromIso, toIso) for the queries; null when they are not valid. */
export function periodToIso(from: string, to: string): { fromIso: string; toIso: string } | null {
  const valid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z'));
  if (!valid(from) || !valid(to) || to < from) return null;
  return { fromIso: startOfDay(from), toIso: startOfDay(addDays(to, 1)) };
}

export interface Fuel {
  id: string;
  tripId: string | null;
  /** The day of the receipt ("2026-10-15"), as the office corrected it or as the phone sent it, in Uruguay. */
  date: string | null;
  vehicle: string | null;
  driverName: string | null;
  station: string | null;
  liters: number | null;
  total: number | null;
  currency: 'UYU' | 'USD';
  objectPath: string | null;
}

/** A fuel receipt with the office's corrections applied (panel_data wins over what the phone sent). */
export function fuelFromReceipt(r: FuelRow, catalog: readonly CatalogTruck[] = []): Fuel {
  const d = asObject(r.panel_data);
  return {
    id: r.id,
    tripId: r.trip_id ?? null,
    date: calendarDay(text(d.fecha)) ?? calendarDay(text(r.receipt_date)) ?? calendarDay(text(r.recorded_at)),
    vehicle: canonical(first(text(d.vehicle), truck(r.vehicle)), catalog),
    driverName: text(r.driver_name),
    station: first(text(d.estacionNombre), text(r.station_name)),
    liters: firstNumber(toNumber(d.litros), toNumber(r.liters)),
    total: firstNumber(toNumber(d.monto), toNumber(r.total)),
    currency: d.moneda === 'USD' ? 'USD' : 'UYU',
    objectPath: text(r.object_path),
  };
}

export interface RouteStats {
  count: number;
  durationMs: number | null;
  maxSpeedKmh: number | null;
}

/** Readings with a position, how long they span and the top speed (readings over 160 km/h are GPS noise). */
export function routeStats(points: readonly { latitude: number; longitude: number; recorded_at: string; speed_kmh?: number | null }[]): RouteStats {
  const valid = points.filter((p) => validPosition(p.latitude, p.longitude));
  if (valid.length === 0) return { count: 0, durationMs: null, maxSpeedKmh: null };
  const times = valid.map((p) => Date.parse(p.recorded_at)).filter((t) => Number.isFinite(t));
  const speeds = valid.map((p) => toNumber(p.speed_kmh)).filter((s): s is number => s !== null && s >= 0 && s <= 160);
  return {
    count: valid.length,
    durationMs: times.length > 1 ? Math.max(...times) - Math.min(...times) : null,
    maxSpeedKmh: speeds.length > 0 ? Math.max(...speeds) : null,
  };
}
