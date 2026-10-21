// Métricas (decision of 21/10/2026): what each truck and each driver did in a period, with the rules of «Rendimiento» in
// the app (FleetStats.summarize), so both add up alike: the office's values win, trips in the trash do not count, pesos
// and dollars are never added together, and a fuel receipt counts on its day (the office's correction, else the day of
// the receipt). Pure functions.
import { addDays, calendarDay, daysBetween, firstOfMonth } from './dates';
import { NO_TRUCK } from './fleet';
import type { Currency, Receipt } from './fuel';
import type { Trip } from './trips';

export { NO_TRUCK };
export const NO_DRIVER = 'Sin chofer';
/** Litres per 100 km only mean something with enough kilometres in the period. */
export const MIN_KM_FOR_RATIO = 300;

export type MetricsBy = 'vehicle' | 'driver';

export interface MetricsRow {
  name: string;
  /** False for the row of the trips and receipts without a truck (or without a driver). */
  named: boolean;
  trips: number;
  /** Measured: the GPS of the app. */
  gpsKm: number;
  loadedKm: number;
  emptyKm: number;
  /** Declared by the office, like the kilos and the amounts. */
  billableKm: number;
  kg: number;
  billed: Record<Currency, number>;
  /** Trips with cargo, or typed by hand, that still have no amount. */
  unbilled: number;
  /** Declared in the receipts. */
  liters: number;
  fuel: Record<Currency, number>;
}

export interface Metrics {
  rows: MetricsRow[];
  total: MetricsRow;
}

const blank = (name: string, named: boolean): MetricsRow => ({
  name,
  named,
  trips: 0,
  gpsKm: 0,
  loadedKm: 0,
  emptyKm: 0,
  billableKm: 0,
  kg: 0,
  billed: { UYU: 0, USD: 0 },
  unbilled: 0,
  liters: 0,
  fuel: { UYU: 0, USD: 0 },
});

function add(into: MetricsRow, r: MetricsRow) {
  into.trips += r.trips;
  into.gpsKm += r.gpsKm;
  into.loadedKm += r.loadedKm;
  into.emptyKm += r.emptyKm;
  into.billableKm += r.billableKm;
  into.kg += r.kg;
  into.unbilled += r.unbilled;
  into.liters += r.liters;
  for (const c of ['UYU', 'USD'] as const) {
    into.billed[c] += r.billed[c];
    into.fuel[c] += r.fuel[c];
  }
}

/** Estimated: litres per 100 km, or null with too few kilometres or no fuel. */
export const litersPer100 = (r: Pick<MetricsRow, 'gpsKm' | 'liters'>): number | null => (r.gpsKm >= MIN_KM_FOR_RATIO && r.liters > 0 ? (r.liters / r.gpsKm) * 100 : null);

/** Share of the GPS kilometres driven with cargo, from 0 to 1; null without kilometres. */
export function loadedShare(r: Pick<MetricsRow, 'loadedKm' | 'emptyKm'>): number | null {
  const km = r.loadedKm + r.emptyKm;
  return km > 0 ? r.loadedKm / km : null;
}

/** Whether a trip carried cargo: null for a trip typed by hand, which has no GPS kilometres to split. */
const loaded = (t: Pick<Trip, 'source' | 'loadType'>): boolean | null => (t.source === 'manual' ? null : t.loadType !== 'empty');

/** A day ("2026-10-15") inside the inclusive period. */
export const inPeriod = (day: string | null, from: string, to: string) => day !== null && day >= from && day <= to;

/** The receipts of a period, by their day, without the ones in the trash. */
export function fuelInPeriod(receipts: readonly Receipt[], from: string, to: string): Receipt[] {
  return receipts.filter((r) => !r.archived && inPeriod(r.date, from, to));
}

/** Totals per truck, or per driver, of the trips (already those of the period) and receipts given. */
export function summarize(trips: readonly Trip[], fuel: readonly Receipt[], by: MetricsBy): Metrics {
  const none = by === 'driver' ? NO_DRIVER : NO_TRUCK;
  const rows = new Map<string, MetricsRow>();
  const row = (name: string | null) => {
    const key = name ?? none;
    let r = rows.get(key);
    if (!r) {
      r = blank(key, name !== null);
      rows.set(key, r);
    }
    return r;
  };
  for (const t of trips) {
    if (t.deleted) continue;
    const r = row(by === 'driver' ? t.driverName : t.vehicle);
    const km = t.gpsKm ?? 0;
    const cargo = loaded(t);
    r.trips++;
    r.gpsKm += km;
    r.billableKm += t.billableKm ?? 0;
    r.kg += t.kg ?? 0;
    if (cargo === true) r.loadedKm += km;
    else if (cargo === false) r.emptyKm += km;
    const amount = t.amount ?? 0;
    if (amount === 0) {
      if (cargo !== false) r.unbilled++;
    } else r.billed[t.currency] += amount;
  }
  for (const f of fuel) {
    if (f.archived) continue;
    const r = row(by === 'driver' ? f.driverName : f.vehicle);
    r.liters += f.liters ?? 0;
    if (f.total !== null && f.total !== 0) r.fuel[f.currency] += f.total;
  }
  const list = [...rows.values()].sort((a, b) => Number(!a.named) - Number(!b.named) || a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  const total = blank('Toda la flota', true);
  for (const r of list) add(total, r);
  return { rows: list, total };
}

/** The catalog trucks that neither travelled nor loaded fuel in the period. */
export function idleTrucks(rows: readonly MetricsRow[], catalog: readonly string[]): string[] {
  const busy = new Set(rows.map((r) => r.name));
  return catalog.filter((label) => !busy.has(label));
}

export type SortKey = 'name' | 'trips' | 'gpsKm' | 'loadedShare' | 'billableKm' | 'kg' | 'billed' | 'liters' | 'fuel' | 'litersPer100';

/** The value a column sorts by; money goes by pesos, then by dollars. Null sorts last. */
function sortValue(r: MetricsRow, key: Exclude<SortKey, 'name'>): number | null {
  switch (key) {
    case 'loadedShare':
      return loadedShare(r);
    case 'litersPer100':
      return litersPer100(r);
    case 'billed':
      return r.billed.UYU + r.billed.USD / 1e9;
    case 'fuel':
      return r.fuel.UYU + r.fuel.USD / 1e9;
    default:
      return r[key];
  }
}

/** The rows by a column, largest first unless ascending; the trips without a truck or driver stay last. */
export function sortRows(rows: readonly MetricsRow[], key: SortKey, ascending = false): MetricsRow[] {
  const byName = (a: MetricsRow, b: MetricsRow) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  return [...rows].sort((a, b) => {
    if (a.named !== b.named) return a.named ? -1 : 1;
    if (key === 'name') return ascending ? byName(a, b) : byName(b, a);
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null || vb === null) return va === vb ? byName(a, b) : va === null ? 1 : -1;
    return (ascending ? va - vb : vb - va) || byName(a, b);
  });
}

export interface KmBucket {
  /** First and last day of the bucket, inclusive. */
  from: string;
  to: string;
  trips: number;
  loadedKm: number;
  emptyKm: number;
}

/** A period longer than this goes week by week. */
export const DAILY_UP_TO_DAYS = 31;

/**
 * The GPS kilometres of the period day by day, or week by week from its first day when it is longer than a month, split
 * with cargo and without. Each trip counts on the day it started; trips typed by hand have no GPS kilometres.
 */
export function kmByDay(trips: readonly Trip[], from: string, to: string): { step: 'day' | 'week'; buckets: KmBucket[] } {
  const days = daysBetween(from, to) + 1;
  if (days < 1) return { step: 'day', buckets: [] };
  const step = days > DAILY_UP_TO_DAYS ? 'week' : 'day';
  const size = step === 'day' ? 1 : 7;
  const buckets: KmBucket[] = [];
  for (let start = from; start <= to; start = addDays(start, size)) {
    const end = addDays(start, size - 1);
    buckets.push({ from: start, to: end < to ? end : to, trips: 0, loadedKm: 0, emptyKm: 0 });
  }
  for (const t of trips) {
    const day = calendarDay(t.departureAt);
    if (t.deleted || t.source === 'manual' || !inPeriod(day, from, to)) continue;
    const b = buckets[Math.floor(daysBetween(from, day as string) / size)];
    if (!b) continue;
    const km = t.gpsKm ?? 0;
    b.trips++;
    if (loaded(t)) b.loadedKm += km;
    else b.emptyKm += km;
  }
  return { step, buckets };
}

/** Round ticks from 0 that cover max: steps of 1, 2, 2.5 or 5 times a power of ten, about count of them. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0) || !Number.isFinite(max)) return [0, 1];
  const raw = max / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? 10 * power;
  const ticks = [0];
  while ((ticks.at(-1) as number) < max - step * 1e-9) ticks.push(Number((ticks.length * step).toPrecision(12)));
  return ticks;
}

/** What a month's billing needs of a trip. */
export type BilledTrip = Pick<Trip, 'departureAt' | 'amount' | 'currency' | 'deleted' | 'source' | 'loadType'>;

export interface MonthBilling {
  /** The first day of the month: "2026-10-01". */
  month: string;
  trips: number;
  billed: Record<Currency, number>;
  /** Trips with cargo, or typed by hand, that still have no amount. */
  unbilled: number;
}

/** The first day of the month that started months before the one of day. */
export function monthsBefore(day: string, months: number): string {
  let first = firstOfMonth(day);
  for (let i = 0; i < months; i++) first = firstOfMonth(addDays(first, -1));
  return first;
}

/** The months up to the one of today (oldest first), with what the office billed in each, by the start of each trip. */
export function billingByMonth(trips: readonly BilledTrip[], today: string, months = 12): MonthBilling[] {
  const list: MonthBilling[] = [];
  for (let i = months - 1; i >= 0; i--) list.push({ month: monthsBefore(today, i), trips: 0, billed: { UYU: 0, USD: 0 }, unbilled: 0 });
  const byMonth = new Map(list.map((m) => [m.month.slice(0, 7), m]));
  for (const t of trips) {
    const day = calendarDay(t.departureAt);
    const m = t.deleted || day === null ? undefined : byMonth.get(day.slice(0, 7));
    if (!m) continue;
    m.trips++;
    const amount = t.amount ?? 0;
    if (amount === 0) {
      if (loaded(t) !== false) m.unbilled++;
    } else m.billed[t.currency] += amount;
  }
  return list;
}
