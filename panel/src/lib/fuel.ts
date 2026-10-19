// Fuel as the office reads it (decision of 19/10/2026): every receipt, from the app (with or without a trip) or typed in
// the panel, with the office's corrections on top, grouped by service station; and each station's account: the balance
// it had on a date, plus the receipts from that day on, minus the payments. Money is kept per currency, never added
// across currencies. Pure functions.
import type { Tables } from './database.types';
import { calendarDay } from './dates';
import { canonical, type CatalogTruck, text, truck } from './fleet';
import { asObject, fold, toNumber } from './numbers';

export type Currency = 'UYU' | 'USD';
export const CURRENCIES: readonly Currency[] = ['UYU', 'USD'];
export type FuelRow = Tables<'trf_driver_fuel_receipts'>;
export type MovementRow = Tables<'trf_fuel_station_movements'>;

export type PaymentMethod = 'efectivo' | 'transferencia' | 'cheque' | 'otro';
export const PAYMENT_METHODS: readonly { value: PaymentMethod; label: string }[] = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'otro', label: 'Otro' },
];

/** A station of the app's catalog list. */
export interface CatalogStation {
  id: string;
  name: string;
}

/** The stations of the catalog (estaciones: {id, nombre}); older rows keep the catalog as text holding JSON. */
export function catalogStations(data: unknown): CatalogStation[] {
  const list = asObject(data).estaciones;
  const seen = new Set<string>();
  const out: CatalogStation[] = [];
  for (const e of Array.isArray(list) ? list : []) {
    const row = asObject(e);
    const id = text(row.id);
    const name = text(row.nombre);
    if (id !== null && name !== null && !seen.has(id)) {
      seen.add(id);
      out.push({ id, name });
    }
  }
  return out;
}

/** A station's name as it counts for grouping: without capitals, accents or extra spaces. */
export function stationName(name: unknown): string {
  return fold(name).replace(/\s+/g, ' ');
}

/** The key of a station without a name: its receipts are kept apart and take no payments. */
export const NO_STATION = 'name:';

/**
 * The station a receipt or a payment belongs to: "id:<id>" for a station of the catalog list (by its id, or by its name
 * written in any way), "name:<name>" for one written by hand, so the same name typed with other capitals, accents or
 * spaces is the same station.
 */
export function stationKey(id: string | null, name: string | null, catalog: readonly CatalogStation[]): string {
  if (id) return 'id:' + id;
  const n = stationName(name);
  const listed = n === '' ? undefined : catalog.find((s) => stationName(s.name) === n);
  return listed ? 'id:' + listed.id : 'name:' + n;
}

/** What was declared when the receipt was loaded (in the app or in the panel), before the office's corrections. */
export interface Declared {
  date: string | null;
  vehicle: string | null;
  stationId: string | null;
  station: string | null;
  liters: number | null;
  total: number | null;
}

export interface Receipt {
  id: string;
  tripId: string | null;
  driverId: string;
  /** Who loaded it: the driver in the app, or the account of the panel that typed it. */
  driverName: string | null;
  recordedAt: string | null;
  /** The day of the receipt ("2026-10-15"), as the office corrected it or as it was declared. */
  date: string | null;
  vehicle: string | null;
  stationKey: string;
  /** The station's name as written in the receipt, or as the office corrected it. */
  station: string | null;
  liters: number | null;
  total: number | null;
  currency: Currency;
  objectPath: string | null;
  /** In the trash: it does not count anywhere. */
  archived: boolean;
  /** The last change saved in the panel (null: never changed): a save checks nobody changed it meanwhile. */
  updatedAt: string | null;
  declared: Declared;
  /** panel_data as it is: a correction keeps the keys the panel does not use. */
  panelData: Record<string, unknown>;
}

const firstText = (...values: (string | null)[]) => values.find((v) => v !== null) ?? null;

/** A receipt with the office's corrections applied: panel_data wins, with the keys the app and both panels read. */
export function receiptFromRow(r: FuelRow, trucks: readonly CatalogTruck[] = [], stations: readonly CatalogStation[] = []): Receipt {
  const d = asObject(r.panel_data);
  const declared: Declared = {
    date: calendarDay(text(r.receipt_date)) ?? calendarDay(text(r.recorded_at)),
    vehicle: canonical(truck(r.vehicle), trucks),
    stationId: text(r.station_id),
    station: text(r.station_name),
    liters: toNumber(r.liters),
    total: toNumber(r.total),
  };
  const correctedId = text(d.estacionId);
  const correctedName = text(d.estacionNombre);
  return {
    id: r.id,
    tripId: r.trip_id ?? null,
    driverId: r.driver_id,
    driverName: text(r.driver_name),
    recordedAt: r.recorded_at ?? null,
    date: calendarDay(text(d.fecha)) ?? declared.date,
    vehicle: canonical(firstText(text(d.vehicle), truck(r.vehicle)), trucks),
    stationKey: correctedId !== null || correctedName !== null ? stationKey(correctedId, correctedName, stations) : stationKey(declared.stationId, declared.station, stations),
    station: correctedName ?? declared.station,
    liters: toNumber(d.litros) ?? declared.liters,
    total: toNumber(d.monto) ?? declared.total,
    currency: d.moneda === 'USD' ? 'USD' : 'UYU',
    objectPath: text(r.object_path),
    archived: r.archived === true,
    updatedAt: r.updated_at ?? null,
    declared,
    panelData: d,
  };
}

/** A payment to a station or its opening balance. */
export interface Movement {
  id: string;
  stationKey: string;
  stationName: string;
  kind: 'opening' | 'payment';
  day: string;
  /** Opening: what was owed to the station that day (negative: in the company's favor). Payment: what was paid. */
  amount: number;
  currency: Currency;
  method: PaymentMethod | null;
  notes: string | null;
  /** Annulled: it does not count. */
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export function movementFromRow(m: MovementRow): Movement {
  const method = PAYMENT_METHODS.find((p) => p.value === m.method)?.value ?? null;
  return {
    id: m.id,
    stationKey: m.station_key,
    stationName: m.station_name,
    kind: m.kind === 'opening' ? 'opening' : 'payment',
    day: m.happened_on,
    amount: toNumber(m.amount) ?? 0,
    currency: m.currency === 'USD' ? 'USD' : 'UYU',
    method,
    notes: text(m.notes),
    deleted: m.deleted_at !== null,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  };
}

/** Cents, so sums of many amounts do not drift. */
const cents = (n: number) => Math.round(n * 100) / 100;

/** One currency of a station's account. */
export interface Account {
  currency: Currency;
  /** The balance on a date: the receipts and payments before that day are inside it. */
  opening: Movement | null;
  /** The receipts with an amount since the opening (or since the first one). */
  loaded: number;
  paid: number;
  /** What is owed to the station (negative: in the company's favor). */
  balance: number;
  /** Receipts in the account without an amount: they add nothing until the office completes it. */
  withoutAmount: number;
}

export interface Station {
  key: string;
  name: string;
  /** In the catalog list of the app. */
  listed: boolean;
  /** Not in the trash, newest first. */
  receipts: Receipt[];
  /** Not annulled. */
  payments: Movement[];
  openings: Movement[];
  lastDay: string | null;
  accounts: Account[];
}

/**
 * The name of a station written by hand: the way it was written most often, and among those the first one, so a
 * receipt typed another way does not rename it.
 */
function spelling(s: Pick<Station, 'key' | 'receipts' | 'payments' | 'openings'>): string {
  const seen = new Map<string, number>();
  for (const r of [...s.receipts].reverse()) if (r.station !== null) seen.set(r.station, (seen.get(r.station) ?? 0) + 1);
  let best: string | null = null;
  for (const [name, n] of seen) if (best === null || n > (seen.get(best) ?? 0)) best = name;
  return best ?? s.payments[0]?.stationName ?? s.openings[0]?.stationName ?? (s.key === NO_STATION ? 'Estación sin indicar' : s.key.slice(s.key.indexOf(':') + 1));
}

const byNewest = (a: Receipt, b: Receipt) => (b.date ?? '').localeCompare(a.date ?? '') || (b.recordedAt ?? '').localeCompare(a.recordedAt ?? '') || a.id.localeCompare(b.id);

/**
 * A receipt dated after today: the phone's date picker lets a driver choose any day. The fuel was loaded all the same,
 * so it counts in its station's account; the pages mark it for the office to correct the date.
 */
export const isFuture = (r: Pick<Receipt, 'date'>, today: string) => r.date !== null && r.date > today;

/** Whether a day counts in an account that starts on since (null: from the beginning). */
const counts = (day: string | null, since: string | null) => since === null || (day !== null && day >= since);

export function account(station: Pick<Station, 'receipts' | 'payments' | 'openings'>, currency: Currency): Account {
  const opening = station.openings.find((o) => o.currency === currency) ?? null;
  const since = opening?.day ?? null;
  let loaded = 0;
  let withoutAmount = 0;
  for (const r of station.receipts) {
    if (r.currency !== currency || r.archived || !counts(r.date, since)) continue;
    if (r.total === null) withoutAmount++;
    else loaded += r.total;
  }
  let paid = 0;
  for (const p of station.payments) if (p.currency === currency && !p.deleted && counts(p.day, since)) paid += p.amount;
  return { currency, opening, loaded: cents(loaded), paid: cents(paid), balance: cents((opening?.amount ?? 0) + loaded - paid), withoutAmount };
}

/**
 * The stations with their receipts (not in the trash), payments and opening balances: every station of the catalog,
 * even without receipts yet, and every station written in receipts or payments. Most recent activity first.
 */
export function groupStations(receipts: readonly Receipt[], movements: readonly Movement[], catalog: readonly CatalogStation[]): Station[] {
  const map = new Map<string, Station>();
  const get = (key: string) => {
    let s = map.get(key);
    if (!s) {
      s = { key, name: '', listed: false, receipts: [], payments: [], openings: [], lastDay: null, accounts: [] };
      map.set(key, s);
    }
    return s;
  };
  for (const c of catalog) {
    const s = get('id:' + c.id);
    s.name = c.name;
    s.listed = true;
  }
  for (const r of receipts) if (!r.archived) get(r.stationKey).receipts.push(r);
  for (const m of movements) {
    if (m.deleted) continue;
    const s = get(m.stationKey);
    if (m.kind === 'payment') {
      s.payments.push(m);
      continue;
    }
    // One opening per station and currency (the database checks it): the newest wins if two ever show up.
    const other = s.openings.find((o) => o.currency === m.currency);
    if (!other) s.openings.push(m);
    else if (m.updatedAt > other.updatedAt) s.openings = s.openings.map((o) => (o === other ? m : o));
  }
  for (const s of map.values()) {
    s.receipts.sort(byNewest);
    s.payments.sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt));
    s.lastDay = s.receipts[0]?.date ?? null;
    if (!s.listed) s.name = spelling(s);
    const used = new Set<Currency>([...s.receipts.map((r) => r.currency), ...s.payments.map((p) => p.currency), ...s.openings.map((o) => o.currency)]);
    s.accounts = CURRENCIES.filter((c) => used.has(c)).map((c) => account(s, c));
  }
  return [...map.values()].sort((a, b) => (b.lastDay ?? '').localeCompare(a.lastDay ?? '') || a.name.localeCompare(b.name, 'es'));
}

export interface Totals {
  receipts: number;
  liters: number;
  amounts: Record<Currency, number>;
  withoutAmount: number;
}

/** What a list of receipts adds up to, per currency. */
export function totals(receipts: readonly Receipt[]): Totals {
  const t: Totals = { receipts: 0, liters: 0, amounts: { UYU: 0, USD: 0 }, withoutAmount: 0 };
  for (const r of receipts) {
    t.receipts++;
    t.liters += r.liters ?? 0;
    if (r.total === null) t.withoutAmount++;
    else t.amounts[r.currency] += r.total;
  }
  return { ...t, liters: cents(t.liters), amounts: { UYU: cents(t.amounts.UYU), USD: cents(t.amounts.USD) } };
}

export interface ReceiptFilter {
  q?: string;
  /** Inclusive calendar days. */
  from?: string;
  to?: string;
  station?: string;
  vehicle?: string;
  /** The trash: only receipts in it. */
  bin?: boolean;
}

export function filterReceipts(list: readonly Receipt[], { q = '', from, to, station = '', vehicle = '', bin = false }: ReceiptFilter = {}): Receipt[] {
  const needle = fold(q);
  return list
    .filter((r) => {
      if (bin !== r.archived) return false;
      if (from && (r.date === null || r.date < from)) return false;
      if (to && (r.date === null || r.date > to)) return false;
      if (station && r.stationKey !== station) return false;
      if (vehicle && (r.vehicle ?? '') !== vehicle) return false;
      if (!needle) return true;
      return [r.station, r.driverName, r.vehicle].some((v) => v !== null && fold(v).includes(needle));
    })
    .sort(byNewest);
}

export interface StatementLine {
  key: string;
  day: string;
  kind: 'opening' | 'receipt' | 'payment';
  /** What the balance moves: up for the opening and the receipts, down for a payment. Null: a receipt without amount. */
  amount: number | null;
  /** The balance after this line. */
  balance: number;
  receipt?: Receipt;
  movement?: Movement;
}

export interface Statement {
  currency: Currency;
  /** Oldest first, from the opening balance on. */
  lines: StatementLine[];
  /** Receipts and payments before the opening: they are inside it. */
  earlier: number;
  balance: number;
}

/** A station's statement of account in one currency, with the balance after each line. */
export function statement(station: Pick<Station, 'receipts' | 'payments' | 'openings'>, currency: Currency): Statement {
  const opening = station.openings.find((o) => o.currency === currency) ?? null;
  const since = opening?.day ?? null;
  const entries: (Omit<StatementLine, 'balance'> & { order: number; tie: string })[] = [];
  if (opening) entries.push({ key: 'o:' + opening.id, day: opening.day, kind: 'opening', amount: opening.amount, movement: opening, order: 0, tie: '' });
  let earlier = 0;
  for (const r of station.receipts) {
    if (r.currency !== currency || r.archived) continue;
    if (!counts(r.date, since) || r.date === null) {
      earlier++;
      continue;
    }
    entries.push({ key: 'r:' + r.id, day: r.date, kind: 'receipt', amount: r.total, receipt: r, order: 1, tie: r.recordedAt ?? '' });
  }
  for (const p of station.payments) {
    if (p.currency !== currency || p.deleted) continue;
    if (!counts(p.day, since)) {
      earlier++;
      continue;
    }
    entries.push({ key: 'p:' + p.id, day: p.day, kind: 'payment', amount: -p.amount, movement: p, order: 2, tie: p.createdAt });
  }
  entries.sort((a, b) => a.day.localeCompare(b.day) || a.order - b.order || a.tie.localeCompare(b.tie) || a.key.localeCompare(b.key));
  let balance = 0;
  const lines = entries.map(({ order: _order, tie: _tie, ...line }) => {
    balance = cents(balance + (line.amount ?? 0));
    return { ...line, balance };
  });
  return { currency, lines, earlier, balance };
}

/** The trucks of a list of receipts, for the filter. */
export const receiptVehicles = (list: readonly Receipt[]) => [...new Set(list.map((r) => r.vehicle).filter((v): v is string => v !== null))].sort((a, b) => a.localeCompare(b, 'es'));

/** Parses the station part of a page address: "id:…" or "name:…". */
export function parseStationKey(key: string | undefined): string | null {
  return key && /^(id|name):.+$/.test(key) ? key : null;
}
