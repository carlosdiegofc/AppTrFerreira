// Truck services (Mantenimiento): the kilometres of each truck, what each service shows, the filters and the form.
// The kilometres are an estimate: the odometer written in the latest service done, plus the GPS kilometres of the
// truck's trips with the app since that day. Trips made without the app do not count, so the truck may have more.
// Pure functions: no network, no React.
import type { Tables, TablesInsert, TablesUpdate } from './database.types';
import { calendarDay } from './dates';
import { canonical, type CatalogTruck, text, truckLabel } from './fleet';
import { fold, parseNumber } from './numbers';
import { serviceStatus, type ServiceStatus } from './papers';

export type MaintenanceRow = Tables<'trf_vehicle_maintenance'>;

/** The kinds of service the app offers; any other can be written. */
export const SERVICE_KINDS = ['Cambio de aceite', 'Cambio de filtros', 'Revisión de frenos', 'Alineación y balanceo', 'Cubiertas', 'Revisión general'] as const;
/** Longest text each field takes, and the kilometres the database accepts. */
export const SERVICE_LIMITS = { kind: 120, vehicle: 120, notes: 1000, km: 10_000_000, interval: 1_000_000 } as const;

export interface Service {
  id: string;
  /** The truck as the catalog names it now (a service saved with an older label counts for its truck). */
  vehicle: string;
  kind: string;
  dueOn: string | null;
  doneOn: string | null;
  /** The odometer written when it was done (or, in a few services of the app, while still to do). */
  odometerKm: number | null;
  dueKm: number | null;
  intervalKm: number | null;
  notes: string;
  createdByName: string;
  updatedAt: string;
}

const whole = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);

export function serviceFromRow(r: MaintenanceRow, catalog: readonly CatalogTruck[] = []): Service {
  return {
    id: r.id,
    vehicle: canonical(r.vehicle, catalog) ?? text(r.vehicle) ?? '',
    kind: text(r.kind) ?? '',
    dueOn: calendarDay(r.due_on),
    doneOn: calendarDay(r.done_on),
    odometerKm: whole(r.odometer_km),
    dueKm: whole(r.due_km),
    intervalKm: whole(r.interval_km),
    notes: text(r.notes) ?? '',
    createdByName: text(r.created_by_name) ?? '',
    updatedAt: r.updated_at,
  };
}

/** A trip of the app, with what the estimate needs. */
export interface KmTrip {
  id: string;
  vehicle: string;
  started_at: string;
  distance_meters: number;
}

/** What the office completed for an app trip: it can send the trip to the trash or correct its truck. */
export interface KmPanelRow {
  app_trip_id: string | null;
  vehicle: string | null;
  deleted_at: string | null;
}

/** The app's trips as the office left them: without the ones in the trash, and with the truck it corrected. */
export function kmTripsAsCorrected(trips: readonly KmTrip[], panel: readonly KmPanelRow[]): KmTrip[] {
  const byTrip = new Map(panel.filter((p) => p.app_trip_id !== null).map((p) => [p.app_trip_id as string, p]));
  return trips.flatMap((t) => {
    const p = byTrip.get(t.id);
    if (p?.deleted_at) return [];
    const vehicle = text(p?.vehicle);
    return [vehicle === null ? t : { ...t, vehicle }];
  });
}

export interface TruckKm {
  /** The latest service done with the odometer written: where the estimate starts. */
  reference: { km: number; day: string };
  /** GPS kilometres of the truck's trips that started that day or later. */
  gpsKm: number;
  /** Written plus GPS. */
  estimate: number;
}

/** The latest odometer of each truck: the service done most recently with it written (the higher, on the same day). */
export function kmReferences(services: readonly Service[]): Map<string, { km: number; day: string }> {
  const out = new Map<string, { km: number; day: string }>();
  for (const s of services) {
    if (s.vehicle === '' || s.doneOn === null || s.odometerKm === null) continue;
    const seen = out.get(s.vehicle);
    if (!seen || s.doneOn > seen.day || (s.doneOn === seen.day && s.odometerKm > seen.km)) out.set(s.vehicle, { km: s.odometerKm, day: s.doneOn });
  }
  return out;
}

/** The first day any truck's estimate needs trips from; null when no truck has kilometres written. */
export function kmSince(references: ReadonlyMap<string, { day: string }>): string | null {
  let first: string | null = null;
  for (const r of references.values()) if (first === null || r.day < first) first = r.day;
  return first;
}

/** The estimated kilometres of every truck with an odometer written, counting the trips from the day of that service. */
export function truckKms(references: ReadonlyMap<string, { km: number; day: string }>, trips: readonly KmTrip[], catalog: readonly CatalogTruck[] = []): Map<string, TruckKm> {
  const meters = new Map<string, number>();
  for (const t of trips) {
    const vehicle = canonical(t.vehicle, catalog);
    const ref = vehicle === null ? undefined : references.get(vehicle);
    const started = calendarDay(t.started_at);
    if (!ref || vehicle === null || started === null || started < ref.day) continue;
    const d = Number(t.distance_meters);
    if (Number.isFinite(d) && d > 0) meters.set(vehicle, (meters.get(vehicle) ?? 0) + d);
  }
  const out = new Map<string, TruckKm>();
  for (const [vehicle, reference] of references) {
    const gpsKm = Math.round((meters.get(vehicle) ?? 0) / 1000);
    out.set(vehicle, { reference, gpsKm, estimate: reference.km + gpsKm });
  }
  return out;
}

export interface ServiceView extends Service {
  status: ServiceStatus;
}

const rank = { late: 0, soon: 1, planned: 2, pending: 3, done: 4 } as const;

/**
 * Each service with what it shows, in the app's order: the ones to do first (late, coming up, planned, without a rule;
 * the nearest date, then the fewest kilometres left), then the ones done, the latest first.
 */
export function serviceViews(services: readonly Service[], kms: ReadonlyMap<string, TruckKm>, today: string): ServiceView[] {
  const views = services.map((s) => ({ ...s, status: serviceStatus({ due_on: s.dueOn, done_on: s.doneOn, due_km: s.dueKm }, today, kms.get(s.vehicle)?.estimate ?? null) }));
  const left = (v: ServiceView) => {
    const estimate = kms.get(v.vehicle)?.estimate;
    return v.dueKm === null || estimate === undefined ? Number.MAX_SAFE_INTEGER : v.dueKm - estimate;
  };
  return views.sort(
    (a, b) =>
      rank[a.status.state] - rank[b.status.state] ||
      (a.status.state === 'done' ? (b.doneOn ?? '').localeCompare(a.doneOn ?? '') : (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999') || left(a) - left(b)) ||
      a.vehicle.localeCompare(b.vehicle, 'es') ||
      a.kind.localeCompare(b.kind, 'es'),
  );
}

export type ServiceListView = 'todo' | 'hechos' | 'todos';

export interface ServiceFilter {
  view?: ServiceListView;
  vehicle?: string;
  q?: string;
}

export function filterServices(list: readonly ServiceView[], { view = 'todo', vehicle = '', q = '' }: ServiceFilter = {}): ServiceView[] {
  const words = fold(q).split(/\s+/).filter(Boolean);
  return list.filter((s) => {
    if (view === 'todo' && s.status.state === 'done') return false;
    if (view === 'hechos' && s.status.state !== 'done') return false;
    if (vehicle && s.vehicle !== vehicle) return false;
    const hay = fold([s.kind, s.vehicle, s.notes, s.createdByName].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

/** The trucks to choose from: the catalog's, and any other a service names. */
export function serviceVehicles(services: readonly Pick<Service, 'vehicle'>[], catalog: readonly CatalogTruck[]): string[] {
  const listed = catalog.map(truckLabel).filter((l) => l !== '');
  const others = [...new Set(services.map((s) => s.vehicle).filter((v) => v !== '' && !listed.includes(v)))].sort((a, b) => a.localeCompare(b, 'es'));
  return [...new Set(listed), ...others];
}

// ---- The form ----

/** «Otro»: a kind written by hand. */
export const OTHER_KIND = '__otro__';

export interface ServiceFormValues {
  vehicle: string;
  /** One of the kinds of the list, or OTHER_KIND. */
  kindChoice: string;
  /** Written by hand, when kindChoice is OTHER_KIND. */
  kind: string;
  done: boolean;
  dueOn: string;
  dueKm: string;
  intervalKm: string;
  doneOn: string;
  odometerKm: string;
  notes: string;
}

export type ServiceField = keyof ServiceFormValues;

const typed = (n: number | null) => (n === null ? '' : String(n));

/** What the form starts with: a new service of a truck (or none), or the service as it is. */
export function serviceFormValues(s: Service | null, vehicle = ''): ServiceFormValues {
  const kind = s?.kind ?? '';
  const listed = (SERVICE_KINDS as readonly string[]).includes(kind);
  return {
    vehicle: s?.vehicle ?? vehicle,
    kindChoice: s === null ? '' : listed ? kind : OTHER_KIND,
    kind: listed ? '' : kind,
    done: s?.doneOn != null,
    dueOn: s?.dueOn ?? '',
    dueKm: typed(s?.dueKm ?? null),
    intervalKm: typed(s?.intervalKm ?? null),
    doneOn: s?.doneOn ?? '',
    odometerKm: typed(s?.odometerKm ?? null),
    notes: s?.notes ?? '',
  };
}

export const serviceFormChanged = (a: ServiceFormValues, b: ServiceFormValues) => (Object.keys(a) as ServiceField[]).some((k) => a[k] !== b[k]);

const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z')) && new Date(d + 'T00:00:00Z').toISOString().startsWith(d);

/** Whole kilometres as they are typed ("412.500", "412500"), up to max: the value, or why it is not valid. */
function checkKm(raw: string, max: number, min = 0): { value: number | null; error: string | null } {
  const parsed = parseNumber(raw);
  if (!parsed.ok) return { value: null, error: parsed.error };
  if (parsed.value === null) return { value: null, error: null };
  if (!Number.isInteger(parsed.value)) return { value: null, error: 'Escribí los kilómetros sin decimales.' };
  if (parsed.value < min) return { value: null, error: `Tiene que ser de ${min} km o más.` };
  if (parsed.value > max) return { value: null, error: 'Es demasiado grande. Revisá el número.' };
  return { value: parsed.value, error: null };
}

export type ServicePayload = Required<Pick<TablesUpdate<'trf_vehicle_maintenance'>, 'vehicle' | 'kind' | 'interval_km' | 'done_on' | 'notes'>> &
  Pick<TablesUpdate<'trf_vehicle_maintenance'>, 'due_on' | 'due_km' | 'odometer_km'>;

export type ServiceCheck = { ok: true; payload: ServicePayload; errors: Partial<Record<ServiceField, string>> } | { ok: false; errors: Partial<Record<ServiceField, string>> };

/**
 * Checks the form, only the fields on screen. A service done needs its day (not after today); one that repeats every N
 * km needs the odometer of that day, to know when the next one is due. What is not on screen is not sent, so it stays
 * as it is: the date and kilometres a service done was planned for, as the app keeps them, and the odometer of a service
 * still to do.
 */
export function validateServiceForm(v: ServiceFormValues, today: string): ServiceCheck {
  const errors: Partial<Record<ServiceField, string>> = {};
  const vehicle = text(v.vehicle);
  if (vehicle === null) errors.vehicle = 'Elegí el camión.';
  else if (vehicle.length > SERVICE_LIMITS.vehicle) errors.vehicle = `Hasta ${SERVICE_LIMITS.vehicle} letras.`;
  const kind = v.kindChoice === OTHER_KIND ? text(v.kind) : text(v.kindChoice);
  if (kind === null) errors[v.kindChoice === OTHER_KIND ? 'kind' : 'kindChoice'] = v.kindChoice === OTHER_KIND ? 'Escribí el tipo de service.' : 'Elegí el tipo de service.';
  else if (kind.length > SERVICE_LIMITS.kind) errors.kind = `Hasta ${SERVICE_LIMITS.kind} letras.`;
  const interval = checkKm(v.intervalKm, SERVICE_LIMITS.interval, 1);
  if (interval.error) errors.intervalKm = interval.error;
  let dueOn: string | null = null;
  const dueKm = checkKm(v.dueKm, SERVICE_LIMITS.km);
  let doneOn: string | null = null;
  const odometer = checkKm(v.odometerKm, SERVICE_LIMITS.km);
  if (v.done) {
    if (v.doneOn.trim() === '') errors.doneOn = 'Elegí el día en que se hizo.';
    else if (!isDay(v.doneOn)) errors.doneOn = 'La fecha no es válida.';
    else if (v.doneOn > today) errors.doneOn = 'No puede ser posterior a hoy.';
    else doneOn = v.doneOn;
    if (odometer.error) errors.odometerKm = odometer.error;
    else if (odometer.value === null && interval.value !== null) errors.odometerKm = 'Para agendar el próximo, escribí el kilometraje del día en que se hizo.';
    else if (odometer.value !== null && interval.value !== null && odometer.value + interval.value > SERVICE_LIMITS.km) errors.odometerKm = 'Es demasiado grande. Revisá el número.';
  }
  if (!v.done) {
    if (v.dueOn.trim() !== '' && !isDay(v.dueOn)) errors.dueOn = 'La fecha no es válida.';
    else if (v.dueOn.trim() !== '') dueOn = v.dueOn;
    if (dueKm.error) errors.dueKm = dueKm.error;
  }
  if (text(v.notes) !== null && (text(v.notes) as string).length > SERVICE_LIMITS.notes) errors.notes = `Hasta ${SERVICE_LIMITS.notes} letras.`;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const payload: ServicePayload = { vehicle: vehicle as string, kind: kind as string, interval_km: interval.value, done_on: doneOn, notes: text(v.notes) ?? '' };
  if (v.done) payload.odometer_km = odometer.value;
  else Object.assign(payload, { due_on: dueOn, due_km: dueKm.value });
  return { ok: true, errors, payload };
}

/**
 * The id of the next service of one just done, made from that service and its kilometres: whoever marks it done that way
 * (two people at once, two tabs, a save tried again) schedules the same next one, and the database keeps it once.
 */
export async function nextServiceId(saved: Pick<MaintenanceRow, 'id' | 'odometer_km' | 'interval_km'>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`trf-next-service:${saved.id}:${saved.odometer_km}:${saved.interval_km}`));
  const b = new Uint8Array(digest, 0, 16);
  // A UUID of version 8, the one for ids made this way.
  b[6] = (b[6]! & 0x0f) | 0x80;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The next service of one that repeats every N km and was just done: due N km after the odometer of that day. */
export function nextService(saved: Pick<MaintenanceRow, 'vehicle' | 'kind' | 'done_on' | 'odometer_km' | 'interval_km'>, id: string, createdByName: string): TablesInsert<'trf_vehicle_maintenance'> | null {
  if (saved.done_on === null || saved.odometer_km === null || saved.interval_km === null) return null;
  const due = saved.odometer_km + saved.interval_km;
  if (due > SERVICE_LIMITS.km) return null;
  return { id, vehicle: saved.vehicle, kind: saved.kind, interval_km: saved.interval_km, due_km: due, created_by_name: createdByName };
}

const SAVED_FIELDS = ['vehicle', 'kind', 'due_on', 'done_on', 'due_km', 'interval_km', 'odometer_km', 'notes'] as const;

/** Whether the service has what a save sends (what it does not send, it does not check): a try whose answer was cut went through. */
export function sameService(saved: MaintenanceRow, row: TablesInsert<'trf_vehicle_maintenance'> | TablesUpdate<'trf_vehicle_maintenance'>): boolean {
  return SAVED_FIELDS.every((k) => !(k in row) || (saved[k] ?? null) === (row[k] ?? null));
}
