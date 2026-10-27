// The office's forms for the clients' accounts: a collection from a client and a client's opening balance. What each
// form starts with, what it checks and what it saves. Pure functions.
import type { Tables, TablesInsert } from './database.types';
import { type ClientMovement, clientKey, tidyName } from './clients';
import { type Currency, type PaymentMethod, PAYMENT_METHODS } from './fuel';
import { type Checked, checkDay, checkNumber } from './fuelForm';

/** Longest text each field takes (the database checks them too). */
export const CLIENT_LIMITS = { client: 200, notes: 500 } as const;
/** The first day the database takes for a collection or an opening balance. */
export const CLIENT_FIRST_DAY = '2000-01-01';
/** The database takes amounts under a hundred million. */
const MAX_AMOUNT = 99_999_999.99;

export type CollectionKind = ClientMovement['kind'];

export interface CollectionFormValues {
  /** The client's name, as chosen in the list or written. */
  client: string;
  date: string;
  amount: string;
  currency: Currency;
  method: PaymentMethod | '';
  notes: string;
  /** Opening balance: what the client owes the company ("debt") or what it has in its favor ("credit"). */
  side: 'debt' | 'credit';
}

export type CollectionField = keyof CollectionFormValues;

/** A number as the form shows it: "182,5", "9950". */
const typed = (n: number) => String(n).replace('.', ',');

/** What the form starts with: a new one for a client (its name), or the one to correct as it reads now. */
export function collectionFormValues(movement: ClientMovement | null, client: string, today: string, currency: Currency = 'UYU'): CollectionFormValues {
  if (!movement) return { client, date: today, amount: '', currency, method: '', notes: '', side: 'debt' };
  return {
    client,
    date: movement.day,
    amount: typed(Math.abs(movement.amount)),
    currency: movement.currency,
    method: movement.method ?? '',
    notes: movement.notes,
    side: movement.amount < 0 ? 'credit' : 'debt',
  };
}

export const collectionFormChanged = (a: CollectionFormValues, b: CollectionFormValues) => (Object.keys(a) as CollectionField[]).some((k) => a[k] !== b[k]);

export interface CollectionPayload {
  clientKey: string;
  /** The name as it was written, without the spaces of more. */
  clientName: string;
  date: string;
  /** Signed for an opening (negative: in the client's favor), in cents; a collection is always positive. */
  amount: number;
  currency: Currency;
  method: PaymentMethod | null;
  notes: string;
}

export function validateCollectionForm(kind: CollectionKind, v: CollectionFormValues, today: string): Checked<CollectionField, CollectionPayload> {
  const errors: Partial<Record<CollectionField, string>> = {};
  const name = tidyName(v.client);
  const key = clientKey(name);
  if (key === null) errors.client = 'Elegí o escribí el cliente.';
  else if (name.length > CLIENT_LIMITS.client) errors.client = `Hasta ${CLIENT_LIMITS.client} letras.`;
  const day = checkDay(v.date, today) ?? (v.date < CLIENT_FIRST_DAY ? 'La fecha no puede ser anterior al 01/01/2000.' : null);
  if (day) errors.date = day;
  const amount = checkNumber(v.amount, MAX_AMOUNT);
  // The database keeps cents: what is saved is what the form said it would save.
  const value = amount.value === null ? null : Math.round(amount.value * 100) / 100;
  if (amount.error) errors.amount = amount.error;
  else if (value === null) errors.amount = kind === 'payment' ? 'Escribí cuánto se cobró.' : 'Escribí el saldo. Si no hay saldo, poné 0.';
  else if (kind === 'payment' && value === 0) errors.amount = 'El cobro tiene que ser mayor que cero.';
  if (kind === 'payment' && !PAYMENT_METHODS.some((m) => m.value === v.method)) errors.method = 'Elegí cómo se cobró.';
  if (v.notes.trim().length > CLIENT_LIMITS.notes) errors.notes = `Hasta ${CLIENT_LIMITS.notes} letras.`;
  if (Object.keys(errors).length > 0 || key === null || value === null) return { ok: false, errors };
  return {
    ok: true,
    errors,
    payload: {
      clientKey: key,
      clientName: name,
      date: v.date,
      amount: kind === 'opening' && v.side === 'credit' ? -value : value,
      currency: v.currency === 'USD' ? 'USD' : 'UYU',
      method: kind === 'payment' ? (v.method as PaymentMethod) : null,
      notes: v.notes.trim(),
    },
  };
}

/** What a collection or an opening balance saves; who and when are noted by the database. */
export function clientMovementRow(kind: CollectionKind, p: CollectionPayload): TablesInsert<'trf_client_movements'> {
  return { client_key: p.clientKey, client_name: p.clientName, kind, happened_on: p.date, amount: p.amount, currency: p.currency, method: p.method, notes: p.notes };
}

/** Whether the movement the database has is the one this save sent, and not one saved by a try with other data. */
export function sameClientMovement(saved: Tables<'trf_client_movements'>, row: TablesInsert<'trf_client_movements'>): boolean {
  return (
    saved.kind === row.kind &&
    saved.client_key === row.client_key &&
    saved.happened_on === row.happened_on &&
    Number(saved.amount) === Number(row.amount) &&
    saved.currency === row.currency &&
    (saved.method ?? null) === (row.method ?? null) &&
    saved.notes === (row.notes ?? '')
  );
}
