// The office's forms for fuel: a receipt (a new one typed in the panel, or the correction of any receipt), a payment to
// a station and a station's opening balance. What each form starts with, what it checks and what it saves. A correction
// never changes what was declared: it goes in panel_data, with the keys the app and both panels read. Pure functions.
import type { Json, Tables, TablesInsert } from './database.types';
import { dayInZone, formatDay } from './dates';
import { canonical, type CatalogTruck, text, truck } from './fleet';
import { parseNumber } from './numbers';
import { type CatalogStation, type Currency, type Declared, type Movement, NO_STATION, type PaymentMethod, PAYMENT_METHODS, type Receipt, stationKey } from './fuel';

/** Longest text each field takes (the database checks the station's name and the notes too). */
export const FUEL_LIMITS = { station: 120, vehicle: 120, notes: 500 } as const;
const MAX = { liters: 100_000, total: 1e9 } as const;

const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z')) && new Date(d + 'T00:00:00Z').toISOString().startsWith(d);

/** A day typed in a form: required, a real date and not after today. */
function checkDay(day: string, today: string): string | null {
  if (day.trim() === '') return 'Elegí la fecha.';
  if (!isDay(day)) return 'La fecha no es válida.';
  if (day > today) return 'La fecha no puede ser posterior a hoy.';
  return null;
}

/** A number in a form as it is typed in Uruguay ("12.500", "182,5"): the value, or why it is not valid. */
function checkNumber(raw: string, max: number): { value: number | null; error: string | null } {
  const parsed = parseNumber(raw);
  if (!parsed.ok) return { value: null, error: parsed.error };
  if (parsed.value !== null && parsed.value > max) return { value: null, error: 'Es demasiado grande. Revisá el número.' };
  return { value: parsed.value, error: null };
}

/** A number as the form shows it: "182,5", "9950". */
const typed = (n: number | null) => (n === null ? '' : String(n).replace('.', ','));

export interface ReceiptFormValues {
  date: string;
  /** A station of the catalog list (its id); '' for one written by hand. */
  stationId: string;
  /** The name of a station written by hand (when stationId is ''). */
  station: string;
  vehicle: string;
  liters: string;
  total: string;
  currency: Currency;
}

export type ReceiptField = keyof ReceiptFormValues;

/** What the form starts with: a new receipt dated today, or the receipt as it reads now (with its corrections). */
export function receiptFormValues(receipt: Receipt | null, catalog: readonly CatalogStation[], today: string): ReceiptFormValues {
  if (!receipt) return { date: today, stationId: '', station: '', vehicle: '', liters: '', total: '', currency: 'UYU' };
  const listed = catalog.find((s) => 'id:' + s.id === receipt.stationKey);
  return {
    date: receipt.date ?? today,
    stationId: listed?.id ?? '',
    station: listed ? '' : (receipt.station ?? ''),
    vehicle: receipt.vehicle ?? '',
    liters: typed(receipt.liters),
    total: typed(receipt.total),
    currency: receipt.currency,
  };
}

export interface ReceiptPayload {
  date: string;
  stationId: string | null;
  /** The catalog's name for a listed station, else as written. */
  station: string;
  vehicle: string;
  liters: number | null;
  total: number;
  currency: Currency;
}

export type Checked<F extends string, P> = { ok: true; payload: P; errors: Partial<Record<F, string>> } | { ok: false; errors: Partial<Record<F, string>> };

/**
 * Checks the form. For a correction, declared is what the receipt was loaded with: a field it had cannot be left blank,
 * because a correction cannot erase it (the receipt would read as declared again).
 */
export function validateReceiptForm(v: ReceiptFormValues, catalog: readonly CatalogStation[], today: string, declared?: Declared): Checked<ReceiptField, ReceiptPayload> {
  const errors: Partial<Record<ReceiptField, string>> = {};
  const day = checkDay(v.date, today);
  if (day) errors.date = day;
  const listed = v.stationId ? catalog.find((s) => s.id === v.stationId) : undefined;
  const written = text(v.station);
  if (v.stationId && !listed) errors.stationId = 'Esa estación ya no está en la lista. Elegí otra o escribí su nombre.';
  else if (!listed && written === null) errors.station = 'Elegí la estación de la lista o escribí su nombre.';
  else if (!listed && (written ?? '').length > FUEL_LIMITS.station) errors.station = `Hasta ${FUEL_LIMITS.station} letras.`;
  if (v.vehicle.trim().length > FUEL_LIMITS.vehicle) errors.vehicle = `Hasta ${FUEL_LIMITS.vehicle} letras.`;
  else if (v.vehicle.trim() === '' && declared?.vehicle) errors.vehicle = 'La boleta tiene camión: para cambiarlo, escribí el correcto.';
  const liters = checkNumber(v.liters, MAX.liters);
  if (liters.error) errors.liters = liters.error;
  else if (liters.value === null && declared?.liters != null) errors.liters = 'La boleta tiene litros: para corregirlos, escribí el número correcto.';
  const total = checkNumber(v.total, MAX.total);
  if (total.error) errors.total = total.error;
  else if (total.value === null) errors.total = 'Escribí el importe de la boleta.';
  else if (total.value === 0) errors.total = 'El importe tiene que ser mayor que cero.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    errors,
    payload: {
      date: v.date,
      stationId: listed?.id ?? null,
      station: listed?.name ?? (written as string),
      vehicle: v.vehicle.trim(),
      liters: liters.value,
      total: total.value as number,
      currency: v.currency === 'USD' ? 'USD' : 'UYU',
    },
  };
}

/**
 * The app's month summary and the current panel count a receipt on the day it reached the database (recorded_at), not
 * on its date, and a correction does not move it there: the form says so when the two fall in different months.
 */
export function arrivalNote(receipt: Pick<Receipt, 'recordedAt'> | null, date: string, today: string): string | null {
  const arrived = receipt ? (receipt.recordedAt ? dayInZone(Date.parse(receipt.recordedAt)) : null) : today;
  if (!arrived || !isDay(date) || date.slice(0, 7) === arrived.slice(0, 7)) return null;
  return receipt
    ? `El resumen del mes de la app y el panel actual la cuentan el ${formatDay(arrived)}, el día en que llegó.`
    : 'El resumen del mes de la app y el panel actual la van a contar hoy, el día en que se carga.';
}

/** Whether the form changed since it opened: closing asks first, and an unchanged correction saves nothing. */
export const receiptFormChanged = (a: ReceiptFormValues, b: ReceiptFormValues) => (Object.keys(a) as ReceiptField[]).some((k) => a[k] !== b[k]);

/**
 * A receipt typed in the panel: in the name of whoever loads it and without a trip, like the app's receipts out of a
 * trip. Its photo goes to that account's own folder (<account>/standalone/<id>.jpg). The currency goes in panel_data,
 * where the app and both panels read it.
 */
export function newReceiptRow(id: string, user: { id: string; name: string }, p: ReceiptPayload, withPhoto: boolean): TablesInsert<'trf_driver_fuel_receipts'> {
  return {
    id,
    driver_id: user.id,
    driver_name: user.name,
    trip_id: null,
    vehicle: p.vehicle,
    receipt_date: p.date,
    station_id: p.stationId ?? '',
    station_name: p.station,
    liters: p.liters,
    total: p.total,
    object_path: withPhoto ? `${user.id}/standalone/${id}.jpg` : null,
    panel_data: p.currency === 'USD' ? { moneda: 'USD' } : null,
  };
}

/**
 * Whether the receipt the database has is the one this save sent. A try whose answer was cut may have saved it with what
 * the form had then; a save tried again gets that one back.
 */
export function sameReceipt(saved: Tables<'trf_driver_fuel_receipts'>, row: TablesInsert<'trf_driver_fuel_receipts'>): boolean {
  const keys = ['receipt_date', 'station_id', 'station_name', 'vehicle', 'liters', 'total', 'object_path'] as const;
  return keys.every((k) => (saved[k] ?? null) === (row[k] ?? null)) && JSON.stringify(saved.panel_data ?? null) === JSON.stringify(row.panel_data ?? null);
}

/**
 * panel_data after a correction. Only the fields changed in the form count: each one is written when it differs from
 * what was declared and removed when it goes back to it, so the receipt reads as declared again. Keys the panel does not
 * use stay as they are. Null when nothing is left.
 */
export function correctedPanelData(receipt: Receipt, initial: ReceiptFormValues, values: ReceiptFormValues, p: ReceiptPayload, catalog: readonly CatalogStation[], trucks: readonly CatalogTruck[]): Json | null {
  const d: Record<string, unknown> = { ...receipt.panelData };
  const changed = (...fields: ReceiptField[]) => fields.some((f) => values[f] !== initial[f]);
  const declared = receipt.declared;
  if (changed('date')) {
    if (p.date === declared.date) delete d.fecha;
    else d.fecha = p.date;
  }
  if (changed('vehicle')) {
    // Blank only reaches here when nothing was declared (validateReceiptForm): no correction is left.
    if (p.vehicle === '' || canonical(truck(p.vehicle), trucks) === declared.vehicle) delete d.vehicle;
    else d.vehicle = p.vehicle;
  }
  if (changed('stationId', 'station')) {
    if (stationKey(p.stationId, p.station, catalog) === stationKey(declared.stationId, declared.station, catalog)) {
      delete d.estacionNombre;
      delete d.estacionId;
    } else {
      d.estacionNombre = p.station;
      if (p.stationId) d.estacionId = p.stationId;
      else delete d.estacionId;
    }
  }
  if (changed('liters')) {
    // Blank only reaches here when nothing was declared (validateReceiptForm): no correction is left.
    if (p.liters === null || p.liters === declared.liters) delete d.litros;
    else d.litros = p.liters;
  }
  if (changed('total')) {
    if (p.total === declared.total) delete d.monto;
    else d.monto = p.total;
  }
  if (changed('currency')) {
    if (p.currency === 'UYU') delete d.moneda;
    else d.moneda = 'USD';
  }
  return Object.keys(d).length > 0 ? (d as Json) : null;
}

export type MovementKind = Movement['kind'];

export interface MovementFormValues {
  /** The station's key ("id:…" or "name:…"). */
  station: string;
  date: string;
  amount: string;
  currency: Currency;
  method: PaymentMethod | '';
  notes: string;
  /** Opening balance: owed to the station ("debt") or in the company's favor ("credit"). */
  side: 'debt' | 'credit';
}

export type MovementField = keyof MovementFormValues;

export function movementFormValues(movement: Movement | null, station: string, today: string, currency: Currency = 'UYU'): MovementFormValues {
  if (!movement) return { station, date: today, amount: '', currency, method: '', notes: '', side: 'debt' };
  return {
    station: movement.stationKey,
    date: movement.day,
    amount: typed(Math.abs(movement.amount)),
    currency: movement.currency,
    method: movement.method ?? '',
    notes: movement.notes ?? '',
    side: movement.amount < 0 ? 'credit' : 'debt',
  };
}

export const movementFormChanged = (a: MovementFormValues, b: MovementFormValues) => (Object.keys(a) as MovementField[]).some((k) => a[k] !== b[k]);

export interface MovementPayload {
  station: string;
  date: string;
  /** Signed for an opening (negative: in the company's favor); a payment is always positive. */
  amount: number;
  currency: Currency;
  method: PaymentMethod | null;
  notes: string | null;
}

export function validateMovementForm(kind: MovementKind, v: MovementFormValues, stations: ReadonlySet<string>, today: string): Checked<MovementField, MovementPayload> {
  const errors: Partial<Record<MovementField, string>> = {};
  if (!v.station || v.station === NO_STATION || !stations.has(v.station)) errors.station = 'Elegí la estación.';
  const day = checkDay(v.date, today);
  if (day) errors.date = day;
  const amount = checkNumber(v.amount, MAX.total);
  if (amount.error) errors.amount = amount.error;
  else if (amount.value === null) errors.amount = kind === 'payment' ? 'Escribí cuánto se pagó.' : 'Escribí el saldo. Si no hay saldo, poné 0.';
  else if (kind === 'payment' && amount.value === 0) errors.amount = 'El pago tiene que ser mayor que cero.';
  if (kind === 'payment' && !PAYMENT_METHODS.some((m) => m.value === v.method)) errors.method = 'Elegí cómo se pagó.';
  if (v.notes.trim().length > FUEL_LIMITS.notes) errors.notes = `Hasta ${FUEL_LIMITS.notes} letras.`;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const value = amount.value as number;
  return {
    ok: true,
    errors,
    payload: {
      station: v.station,
      date: v.date,
      amount: kind === 'opening' && v.side === 'credit' ? -value : value,
      currency: v.currency === 'USD' ? 'USD' : 'UYU',
      method: kind === 'payment' ? (v.method as PaymentMethod) : null,
      notes: text(v.notes),
    },
  };
}

/** What a payment or an opening balance saves; who and when are noted by the database. */
export function movementRow(kind: MovementKind, p: MovementPayload, stationName: string): TablesInsert<'trf_fuel_station_movements'> {
  return { station_key: p.station, station_name: stationName.trim().slice(0, FUEL_LIMITS.station) || 'Estación', kind, happened_on: p.date, amount: p.amount, currency: p.currency, method: p.method, notes: p.notes };
}

/** Whether the payment the database has is the one this save sent, and not one saved by a try with other data. */
export function sameMovement(saved: Tables<'trf_fuel_station_movements'>, row: TablesInsert<'trf_fuel_station_movements'>): boolean {
  return (
    saved.kind === row.kind &&
    saved.station_key === row.station_key &&
    saved.happened_on === row.happened_on &&
    Number(saved.amount) === Number(row.amount) &&
    saved.currency === row.currency &&
    (saved.method ?? null) === (row.method ?? null) &&
    (saved.notes ?? null) === (row.notes ?? null)
  );
}
