// The tank of each truck (decision of 22/10/2026): an estimate, never a reading. It starts at the last moment its level
// was known, a measurement typed in the panel (trf_tank_references) or a load that filled the tank (a receipt marked
// «Tanque lleno»), adds the loads after that and takes off the GPS kilometres at the truck's consumption. Pure functions.
import { canonical, type CatalogTruck } from './fleet';
import type { Receipt } from './fuel';
import { parseNumber } from './numbers';
import { roadVehicleKey, type TankReference } from './road';

/** A truck's tank, as trf_tank_settings keeps it, or as an older measurement says when it has no settings yet. */
export interface TankSettings {
  key: string;
  name: string;
  capacity: number;
  /** Litres every 100 km. */
  consumption: number;
  /** The alert: at this many litres or fewer. */
  warning: number;
  /** null: taken from a measurement, without its own settings yet. */
  updatedAt: string | null;
}

export type TankSettingsRow = { vehicle_key: string; vehicle_name: string; capacity_l: number; consumption: number; warning_l: number; updated_at: string };

export function settingsFromRow(r: TankSettingsRow): TankSettings {
  return { key: r.vehicle_key, name: r.vehicle_name, capacity: Number(r.capacity_l), consumption: Number(r.consumption), warning: Number(r.warning_l), updatedAt: r.updated_at };
}

/** A trip as the tank needs it, with the truck the office corrected and without the ones in the trash. */
export interface TankTrip {
  id: string;
  vehicle: string;
  startedAt: string;
  endedAt: string | null;
  active: boolean;
  meters: number;
}

/**
 * The trips with their truck as the catalog names it, like the receipts: one saved with an older label («Volvo FH 460»)
 * counts for its catalog truck («Volvo FH 460 · ABC1234»).
 */
export function tripsInCatalog(trips: readonly TankTrip[], catalog: readonly CatalogTruck[]): TankTrip[] {
  return trips.map((t) => ({ ...t, vehicle: canonical(t.vehicle, catalog) ?? t.vehicle }));
}

/** Where the estimate starts: the measurement, or the load that filled the tank. */
export type TankStart =
  | { kind: 'measured'; at: string; liters: number; reference: TankReference }
  | { kind: 'full'; at: string; liters: number; receipt: Receipt };

export type TankState =
  /** Nothing about this truck's tank yet. */
  | { status: 'unset' }
  /** Its tank is set, but its level was never known: it waits for a measurement or a load that fills it. */
  | { status: 'waiting'; settings: TankSettings }
  /** The records do not allow an estimate: what to check. */
  | { status: 'unknown'; settings: TankSettings; start: TankStart; reason: string }
  | {
      status: 'known';
      settings: TankSettings;
      start: TankStart;
      liters: number;
      /** Of the tank, 0 to 1. */
      share: number;
      /** Kilometres it can still do at its consumption. */
      autonomyKm: number;
      low: boolean;
      /** The sums give less than nothing: a load may be missing, or the consumption is too high. */
      belowZero: boolean;
      /** GPS kilometres and litres loaded since the start. */
      km: number;
      loaded: number;
      /** A trip was going on at the start without being linked to it: all its kilometres count. */
      approximate: boolean;
    };

/** «3 km por litro» is 33,3 litres every 100 km, and back. */
export const kmPerLiter = (litersPer100: number) => 100 / litersPer100;
export const litersPer100 = (kmPerLiterValue: number) => 100 / kmPerLiterValue;

const sameTruck = (key: string) => (label: string | null) => label !== null && label !== '' && roadVehicleKey(label) === key;
const time = (iso: string | null) => (iso ? Date.parse(iso) : Number.NaN);

/** The truck's loads that count: not in the trash, with the moment they were loaded. */
function loadsOf(key: string, receipts: readonly Receipt[]): Receipt[] {
  const mine = sameTruck(key);
  return receipts.filter((r) => !r.archived && mine(r.vehicle) && Number.isFinite(time(r.recordedAt)));
}

/** The latest of the measurement and the last load that filled the tank. */
export function tankStart(settings: TankSettings, reference: TankReference | null, receipts: readonly Receipt[]): TankStart | null {
  const full = loadsOf(settings.key, receipts)
    .filter((r) => r.fullTank)
    .sort((a, b) => time(b.recordedAt) - time(a.recordedAt))[0];
  const measured: TankStart | null = reference ? { kind: 'measured', at: reference.measured_at, liters: Number(reference.liters), reference } : null;
  const filled: TankStart | null = full ? { kind: 'full', at: full.recordedAt as string, liters: settings.capacity, receipt: full } : null;
  if (!measured || !filled) return measured ?? filled;
  return time(filled.at) > time(measured.at) ? filled : measured;
}

/** A moment in a truck's trips: when, and the metres of the trip it happened in (or of every trip, for a measurement). */
interface Moment {
  at: number;
  tripId: string | null;
  tripMeters: number | null;
  snapshot: Record<string, number> | null;
}

const momentOf = (start: TankStart): Moment =>
  start.kind === 'measured'
    ? { at: time(start.at), tripId: null, tripMeters: null, snapshot: start.reference.trip_meters }
    : { at: time(start.at), tripId: start.receipt.tripId, tripMeters: start.receipt.tripMeters, snapshot: null };

/**
 * The GPS metres the truck did between two moments (to null: until now). A trip linked to a moment counts from (or to)
 * its metres then; one that started after it, whole. One that was going on at a moment without being linked to it counts
 * whole, the side that consumes more, and makes the result approximate.
 */
function metersBetween(trips: readonly TankTrip[], from: Moment, to: Moment | null): { meters: number; approximate: boolean } | { error: string } {
  let meters = 0;
  let approximate = false;
  for (const t of trips) {
    if (!Number.isFinite(t.meters) || t.meters < 0) return { error: 'Un viaje del camión no tiene kilómetros válidos.' };
    const began = time(t.startedAt);
    const ended = t.endedAt ? time(t.endedAt) : null;
    const over = (at: number) => !t.active && ended !== null && ended <= at;
    let low: number;
    // The trip of a load may reach the database with fewer metres than the phone had when loading: it is still sending.
    let lagging = false;
    if (from.snapshot && t.id in from.snapshot) low = from.snapshot[t.id] ?? 0;
    else if (from.tripId === t.id) {
      low = from.tripMeters ?? 0;
      lagging = true;
    } else if (began >= from.at) low = 0;
    else if (over(from.at)) continue;
    else {
      low = 0;
      approximate = true;
    }
    let high: number;
    if (!to) high = t.meters;
    else if (to.tripId === t.id) high = to.tripMeters ?? t.meters;
    else if (began >= to.at) continue;
    else if (over(to.at)) high = t.meters;
    else {
      high = t.meters;
      approximate = true;
    }
    if (high < low) {
      // The tank catches up once those metres arrive; a consumption between two full tanks would be made with part of
      // the kilometres, so there is none until then.
      if (lagging && !to) continue;
      return { error: 'Un viaje tiene menos kilómetros que cuando se supo cuánto tenía el tanque: medilo de nuevo o marcá la próxima carga que lo llene.' };
    }
    meters += high - low;
  }
  return { meters, approximate };
}

/** The litres loaded after a moment (and up to another, included), or the first load without litres. */
function litersBetween(loads: readonly Receipt[], from: number, to: number | null, known: Record<string, number> | null): { liters: number } | { missing: Receipt } {
  let liters = 0;
  for (const r of loads) {
    const at = time(r.recordedAt);
    if (at <= from || (to !== null && at > to) || (known && r.id in known)) continue;
    if (r.liters === null) return { missing: r };
    liters += r.liters;
  }
  return { liters };
}

/**
 * The tank of a truck now. trips and receipts may be any truck's: only this one's count. A measurement that knew a load
 * already holds it; a load that filled the tank leaves it full, whatever it had.
 */
export function tankState(settings: TankSettings | null, reference: TankReference | null, trips: readonly TankTrip[], receipts: readonly Receipt[]): TankState {
  if (!settings) return { status: 'unset' };
  const start = tankStart(settings, reference, receipts);
  if (!start) return { status: 'waiting', settings };
  const mine = sameTruck(settings.key);
  const moment = momentOf(start);
  const distance = metersBetween(
    trips.filter((t) => mine(t.vehicle)),
    moment,
    null,
  );
  if ('error' in distance) return { status: 'unknown', settings, start, reason: distance.error };
  const loads = loadsOf(settings.key, receipts).filter((r) => start.kind !== 'full' || r.id !== start.receipt.id);
  const loaded = litersBetween(loads, moment.at, null, start.kind === 'measured' ? start.reference.receipt_liters : null);
  if ('missing' in loaded) {
    const r = loaded.missing;
    return { status: 'unknown', settings, start, reason: `La carga${r.date ? ` del ${r.date.slice(8, 10)}/${r.date.slice(5, 7)}` : ''}${r.station ? ` en ${r.station}` : ''} no tiene los litros: completalos en la boleta.` };
  }
  const km = distance.meters / 1000;
  const raw = start.liters + loaded.liters - (km * settings.consumption) / 100;
  // A little over the capacity is the pump's and the measurement's margin; more, a full tank nobody marked.
  if (raw > settings.capacity * 1.03 + 1) {
    return {
      status: 'unknown',
      settings,
      start,
      reason: 'Según las cargas, el tanque tendría más de lo que le entra: si una carga lo llenó, marcala «Tanque lleno»; si no, revisá los litros de las boletas o el consumo.',
    };
  }
  const liters = Math.min(settings.capacity, Math.max(0, raw));
  return {
    status: 'known',
    settings,
    start,
    liters,
    share: liters / settings.capacity,
    autonomyKm: (liters / settings.consumption) * 100,
    low: liters <= settings.warning,
    belowZero: raw < 0,
    km,
    loaded: loaded.liters,
    approximate: distance.approximate,
  };
}

/** What a truck really consumed between its last two full tanks, with at least 100 km in between. */
export interface MeasuredConsumption {
  litersPer100: number;
  km: number;
  from: string;
  to: string;
}

/** The loads that filled the tank, oldest first. */
const fullTanks = (loads: readonly Receipt[]) => loads.filter((r) => r.fullTank).sort((a, b) => time(a.recordedAt) - time(b.recordedAt));

/**
 * The consumption measured between the last two full tanks: the litres it took to fill it again (with the loads in
 * between) over the kilometres in between. None when their kilometres cannot be told exactly, a load in between has no
 * litres, or they are less than 100 km apart.
 */
export function measuredConsumption(key: string, trips: readonly TankTrip[], receipts: readonly Receipt[]): MeasuredConsumption | null {
  const mine = sameTruck(key);
  const loads = loadsOf(key, receipts);
  const fulls = fullTanks(loads);
  const [a, b] = [fulls[fulls.length - 2], fulls[fulls.length - 1]];
  if (!a || !b) return null;
  const [from, to] = [time(a.recordedAt), time(b.recordedAt)];
  const liters = litersBetween(loads, from, to, null);
  if ('missing' in liters || liters.liters <= 0) return null;
  const ours = trips.filter((t) => mine(t.vehicle));
  // The trip of a load that has not reached the database yet would leave its kilometres out: none until it is there.
  if ([a, b].some((r) => r.tripId !== null && !ours.some((t) => t.id === r.tripId))) return null;
  const distance = metersBetween(
    ours,
    { at: from, tripId: a.tripId, tripMeters: a.tripMeters, snapshot: null },
    { at: to, tripId: b.tripId, tripMeters: b.tripMeters, snapshot: null },
  );
  if ('error' in distance || distance.approximate || distance.meters < 100_000) return null;
  const km = distance.meters / 1000;
  return { litersPer100: (liters.liters / km) * 100, km, from: a.recordedAt as string, to: b.recordedAt as string };
}

/** Where the measured consumption starts, so its trips are read too: the full tank before the last one. */
export function consumptionFrom(key: string, receipts: readonly Receipt[]): string | null {
  const fulls = fullTanks(loadsOf(key, receipts));
  return fulls[fulls.length - 2]?.recordedAt ?? null;
}

/**
 * Since when the trips are needed: the earliest of these moments, a week back. A trip that was already going on then
 * comes too, while it goes on and once it ends (fetchTankTrips).
 */
export function tripsSince(moments: readonly (string | null)[]): string | null {
  const times = moments.map(time).filter(Number.isFinite);
  if (times.length === 0) return null;
  return new Date(Math.min(...times) - 7 * 86_400_000).toISOString();
}

export interface TankFormValues {
  capacity: string;
  /** In kilometres per litre, as it is said. */
  kmPerLiter: string;
  warning: string;
}

/** Litres and kilometres per litre, the Uruguayan way: «400», «2,8». */
const typed = (n: number, decimals: number) => String(Math.round(n * 10 ** decimals) / 10 ** decimals).replace('.', ',');

export function tankFormValues(s: TankSettings | null): TankFormValues {
  if (!s) return { capacity: '', kmPerLiter: '', warning: '' };
  return { capacity: typed(s.capacity, 1), kmPerLiter: typed(kmPerLiter(s.consumption), 2), warning: typed(s.warning, 1) };
}

/** The usual alert: a fifth of the tank. */
export const defaultWarning = (capacity: number) => Math.round(capacity * 0.2);

/** What a truck's tank saves, or what is wrong with each field. */
export function validateTankForm(v: TankFormValues): { row: { capacity_l: number; consumption: number; warning_l: number } | null; errors: Partial<Record<keyof TankFormValues, string>> } {
  const errors: Partial<Record<keyof TankFormValues, string>> = {};
  const capacity = parseNumber(v.capacity);
  const perLiter = parseNumber(v.kmPerLiter);
  const warning = parseNumber(v.warning);
  if (!capacity.ok) errors.capacity = capacity.error;
  else if (capacity.value === null) errors.capacity = 'Escribí cuántos litros le entran.';
  else if (capacity.value <= 0 || capacity.value > 5000) errors.capacity = 'Entre 1 y 5.000 litros.';
  if (!perLiter.ok) errors.kmPerLiter = perLiter.error;
  else if (perLiter.value === null) errors.kmPerLiter = 'Escribí cuántos kilómetros hace por litro.';
  else if (perLiter.value < 0.5 || perLiter.value > 20) errors.kmPerLiter = 'Entre 0,5 y 20 km por litro: un camión suele hacer entre 2 y 4.';
  if (!warning.ok) errors.warning = warning.error;
  else if (warning.value !== null && capacity.ok && capacity.value !== null && warning.value > capacity.value) errors.warning = 'No puede ser más de lo que le entra.';
  if (Object.keys(errors).length > 0 || !capacity.ok || capacity.value === null || !perLiter.ok || perLiter.value === null || !warning.ok) return { row: null, errors };
  return { row: { capacity_l: capacity.value, consumption: litersPer100(perLiter.value), warning_l: warning.value ?? defaultWarning(capacity.value) }, errors };
}

/** The litres a measurement says, up to the capacity; «lleno» is the capacity itself. */
export function validateMeasurement(raw: string, capacity: number): { liters: number | null; error: string | null } {
  const n = parseNumber(raw);
  if (!n.ok) return { liters: null, error: n.error };
  if (n.value === null) return { liters: null, error: 'Escribí cuántos litros tiene.' };
  if (n.value > capacity) return { liters: null, error: `No le entran más de ${typed(capacity, 1)} litros.` };
  return { liters: n.value, error: null };
}
