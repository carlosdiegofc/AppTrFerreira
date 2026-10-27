// Each client's account (decisions of 26/10/2026 and 27/10/2026), like a service station's: the trips billed to the
// client add, what it paid subtracts, and an opening balance with its date holds what came before. The clients are the
// names written in the trips, grouped without capitals, accents or extra spaces, plus the ones of the app's list. Money
// is kept per currency, never added across currencies. Pure functions.
import type { Tables } from './database.types';
import { calendarDay } from './dates';
import { CURRENCIES, type Currency, type PaymentMethod, PAYMENT_METHODS } from './fuel';
import { fold, toNumber } from './numbers';
import type { Trip } from './trips';

export type ClientMovementRow = Tables<'trf_client_movements'>;

/** A client's name as it counts for grouping: without capitals, accents or extra spaces. */
export const clientName = (name: unknown) => fold(name).replace(/\s+/g, ' ');

/** The key of a client: "name:" and its name as it counts for grouping; null without a name. */
export function clientKey(name: unknown): string | null {
  const n = clientName(name);
  return n === '' ? null : 'name:' + n;
}

/** The key of the trips billed without saying the client: they go to no account until the office completes them. */
export const NO_CLIENT = 'name:';

/** A name as the screens show it: without the spaces of more. */
export const tidyName = (name: string) => name.trim().replace(/\s+/g, ' ');

/** A collection from a client or its opening balance. */
export interface ClientMovement {
  id: string;
  clientKey: string;
  /** The client's name as it was written when saved. */
  clientName: string;
  kind: 'opening' | 'payment';
  day: string;
  /** Opening: what the client owed the company that day (negative: in the client's favor). Payment: what it paid. */
  amount: number;
  currency: Currency;
  method: PaymentMethod | null;
  notes: string;
  /** Annulled: it does not count. */
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export function clientMovementFromRow(m: ClientMovementRow): ClientMovement {
  return {
    id: m.id,
    // The key as the grouping makes it now, so a movement always goes with its client's trips.
    clientKey: clientKey(m.client_key.slice(NO_CLIENT.length)) ?? m.client_key,
    clientName: tidyName(m.client_name),
    kind: m.kind === 'opening' ? 'opening' : 'payment',
    day: m.happened_on,
    amount: toNumber(m.amount) ?? 0,
    currency: m.currency === 'USD' ? 'USD' : 'UYU',
    method: PAYMENT_METHODS.find((p) => p.value === m.method)?.value ?? null,
    notes: m.notes ?? '',
    deleted: m.deleted_at !== null,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  };
}

/** Cents, so sums of many amounts do not drift. */
const cents = (n: number) => Math.round(n * 100) / 100;

/** The day a trip counts on: its departure, in Uruguay. */
export const tripDay = (t: Pick<Trip, 'departureAt'>) => calendarDay(t.departureAt);

/** What a trip billed; null when it has no amount (an amount of 0 is none, as in Métricas). */
export const billedAmount = (t: Pick<Trip, 'amount'>) => (t.amount !== null && t.amount !== 0 ? t.amount : null);

/**
 * A trip whose amount the office has to complete: finished and with cargo, or typed by hand. An empty return is not
 * billed, and a trip on the road gets its amount when it ends.
 */
export const missingAmount = (t: Pick<Trip, 'amount' | 'active' | 'loadType' | 'deleted'>) => !t.deleted && billedAmount(t) === null && !t.active && t.loadType !== 'empty';

export interface StatementLine {
  key: string;
  /** The day of the line; '' for a trip without a day. */
  day: string;
  kind: 'opening' | 'trip' | 'payment';
  /** What the balance moves: up for the opening and the trips, down for a payment. Null: a trip without an amount. */
  amount: number | null;
  /** The balance after this line. */
  balance: number;
  trip?: Trip;
  movement?: ClientMovement;
}

/** A client's statement of account in one currency, with what it adds up to. */
export interface ClientStatement {
  currency: Currency;
  /** The balance on a date: the trips and collections before that day are inside it. */
  opening: ClientMovement | null;
  /** Oldest first, from the opening on. */
  lines: StatementLine[];
  /** Trips and collections before the opening: they are inside it. */
  earlier: number;
  /** What the trips since the opening (or since the first one) billed. */
  billed: number;
  paid: number;
  /** What the client owes the company (negative: in the client's favor). */
  balance: number;
  /** Trips in the account whose amount the office has to complete: they add nothing until then. */
  withoutAmount: number;
}

/** One currency of a client's account: its statement without the lines. */
export type ClientAccount = Omit<ClientStatement, 'lines'>;

export interface Client {
  key: string;
  name: string;
  /** In the app's list of clients. */
  listed: boolean;
  /** Not in the trash, newest first. */
  trips: Trip[];
  /** Not annulled, newest first. */
  payments: ClientMovement[];
  openings: ClientMovement[];
  /** The day of its latest trip. */
  lastTrip: string | null;
  /** The day of its latest trip, collection or opening balance: the list goes by it. */
  lastDay: string | null;
  accounts: ClientAccount[];
}

type Entry = Omit<StatementLine, 'balance'> & { order: number; tie: string };

/** A client's statement in one currency: the opening balance, then each trip and each collection, oldest first. */
export function statement(client: Pick<Client, 'trips' | 'payments' | 'openings'>, currency: Currency): ClientStatement {
  const opening = client.openings.find((o) => o.currency === currency && !o.deleted) ?? null;
  const since = opening?.day ?? null;
  const entries: Entry[] = [];
  if (opening) entries.push({ key: 'o:' + opening.id, day: opening.day, kind: 'opening', amount: opening.amount, movement: opening, order: 0, tie: '' });
  let earlier = 0;
  let withoutAmount = 0;
  for (const t of client.trips) {
    if (t.deleted || t.currency !== currency) continue;
    const day = tripDay(t);
    if (since !== null && (day === null || day < since)) {
      earlier++;
      continue;
    }
    if (missingAmount(t)) withoutAmount++;
    entries.push({ key: 't:' + t.key, day: day ?? '', kind: 'trip', amount: billedAmount(t), trip: t, order: 1, tie: t.departureAt ?? '' });
  }
  for (const p of client.payments) {
    if (p.deleted || p.currency !== currency) continue;
    if (since !== null && p.day < since) {
      earlier++;
      continue;
    }
    entries.push({ key: 'p:' + p.id, day: p.day, kind: 'payment', amount: -p.amount, movement: p, order: 2, tie: p.createdAt });
  }
  entries.sort((a, b) => a.day.localeCompare(b.day) || a.order - b.order || a.tie.localeCompare(b.tie) || a.key.localeCompare(b.key));
  let balance = 0;
  let billed = 0;
  let paid = 0;
  const lines = entries.map(({ order: _order, tie: _tie, ...line }) => {
    balance = cents(balance + (line.amount ?? 0));
    if (line.kind === 'trip') billed += line.amount ?? 0;
    else if (line.kind === 'payment') paid -= line.amount ?? 0;
    return { ...line, balance };
  });
  return { currency, opening, lines, earlier, billed: cents(billed), paid: cents(paid), balance, withoutAmount };
}

/** One currency of a client's account, as its statement adds it up. */
export function account(client: Pick<Client, 'trips' | 'payments' | 'openings'>, currency: Currency): ClientAccount {
  const { lines: _lines, ...summary } = statement(client, currency);
  return summary;
}

const byNewest = (a: Trip, b: Trip) => (b.departureAt ?? '').localeCompare(a.departureAt ?? '') || a.key.localeCompare(b.key);

/**
 * The name of a client written in the trips: the way it was written most often, and among those the oldest, so a trip
 * typed another way does not rename it.
 */
function spelling(c: Pick<Client, 'key' | 'trips' | 'payments' | 'openings'>): string {
  const seen = new Map<string, number>();
  for (const t of [...c.trips].reverse()) if (t.client !== null) seen.set(tidyName(t.client), (seen.get(tidyName(t.client)) ?? 0) + 1);
  let best: string | null = null;
  for (const [name, n] of seen) if (best === null || n > (seen.get(best) ?? 0)) best = name;
  return best ?? c.payments[0]?.clientName ?? c.openings[0]?.clientName ?? (c.key === NO_CLIENT ? 'Cliente sin indicar' : c.key.slice(NO_CLIENT.length));
}

const later = (a: string | null, b: string | null) => (a === null ? b : b === null || a >= b ? a : b);

/**
 * The clients with their trips (not in the trash), collections and opening balances: every client of the app's list,
 * even without trips yet, every client written in a trip and every one with a collection or an opening balance. The
 * trips billed without a client go apart, under NO_CLIENT, without an account. Most recent activity first.
 */
export function groupClients(trips: readonly Trip[], movements: readonly ClientMovement[], listed: readonly string[]): Client[] {
  const map = new Map<string, Client>();
  const get = (key: string) => {
    let c = map.get(key);
    if (!c) {
      c = { key, name: '', listed: false, trips: [], payments: [], openings: [], lastTrip: null, lastDay: null, accounts: [] };
      map.set(key, c);
    }
    return c;
  };
  for (const name of listed) {
    const key = clientKey(name);
    if (key === null) continue;
    const c = get(key);
    if (!c.listed) {
      c.listed = true;
      c.name = tidyName(name);
    }
  }
  for (const t of trips) {
    if (t.deleted) continue;
    const key = clientKey(t.client);
    if (key !== null) get(key).trips.push(t);
    else if (billedAmount(t) !== null) get(NO_CLIENT).trips.push(t);
  }
  for (const m of movements) {
    if (m.deleted) continue;
    const c = get(m.clientKey);
    if (m.kind === 'payment') {
      c.payments.push(m);
      continue;
    }
    // One opening per client and currency (the database checks it): the newest wins if two ever show up.
    const other = c.openings.find((o) => o.currency === m.currency);
    if (!other) c.openings.push(m);
    else if (m.updatedAt > other.updatedAt) c.openings = c.openings.map((o) => (o === other ? m : o));
  }
  for (const c of map.values()) {
    c.trips.sort(byNewest);
    c.payments.sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt));
    c.lastTrip = c.trips.reduce<string | null>((day, t) => later(day, tripDay(t)), null);
    c.lastDay = [...c.payments, ...c.openings].reduce<string | null>((day, m) => later(day, m.day), c.lastTrip);
    if (!c.listed) c.name = spelling(c);
    const used = new Set<Currency>([...c.trips.map((t) => t.currency), ...c.payments.map((p) => p.currency), ...c.openings.map((o) => o.currency)]);
    c.accounts = c.key === NO_CLIENT ? [] : CURRENCIES.filter((cur) => used.has(cur)).map((cur) => account(c, cur));
  }
  return [...map.values()].sort((a, b) => (b.lastDay ?? '').localeCompare(a.lastDay ?? '') || a.name.localeCompare(b.name, 'es'));
}

/** Whether a day is inside an inclusive period; without days, every day is. */
const within = (day: string | null, from?: string, to?: string) => (from === undefined || (day !== null && day >= from)) && (to === undefined || (day !== null && day <= to));

export interface PeriodSums {
  /** What the trips of the period billed to clients, and how many trips. */
  billed: Record<Currency, number>;
  trips: number;
  /** What the clients paid in the period, and how many collections. */
  paid: Record<Currency, number>;
  payments: number;
}

/** What a list of trips billed in a period (inclusive days; without days, all), and how many trips. */
export function billedInPeriod(trips: readonly Trip[], from?: string, to?: string): Pick<PeriodSums, 'billed' | 'trips'> {
  const billed = { UYU: 0, USD: 0 };
  let n = 0;
  for (const t of trips) {
    const amount = billedAmount(t);
    if (t.deleted || amount === null || !within(tripDay(t), from, to)) continue;
    billed[t.currency] = cents(billed[t.currency] + amount);
    n++;
  }
  return { billed, trips: n };
}

/** What the clients were billed and what they paid in a period (inclusive days; without days, all). */
export function periodSums(clients: readonly Pick<Client, 'key' | 'trips' | 'payments'>[], from?: string, to?: string): PeriodSums {
  const s: PeriodSums = { billed: { UYU: 0, USD: 0 }, trips: 0, paid: { UYU: 0, USD: 0 }, payments: 0 };
  for (const c of clients) {
    if (c.key === NO_CLIENT) continue;
    const b = billedInPeriod(c.trips, from, to);
    s.billed.UYU += b.billed.UYU;
    s.billed.USD += b.billed.USD;
    s.trips += b.trips;
    for (const p of c.payments) {
      if (p.deleted || !within(p.day, from, to)) continue;
      s.paid[p.currency] += p.amount;
      s.payments++;
    }
  }
  return { ...s, billed: { UYU: cents(s.billed.UYU), USD: cents(s.billed.USD) }, paid: { UYU: cents(s.paid.UYU), USD: cents(s.paid.USD) } };
}

/**
 * What the clients owe the company and what it holds in their favor, per currency, and how many owe. They are separate
 * accounts: what one client holds in its favor does not pay what another owes.
 */
export function clientBalances(clients: readonly Pick<Client, 'accounts'>[]): { owed: Record<Currency, number>; credit: Record<Currency, number>; owing: number } {
  const owed = { UYU: 0, USD: 0 };
  const credit = { UYU: 0, USD: 0 };
  let owing = 0;
  for (const c of clients) {
    let owes = false;
    for (const a of c.accounts) {
      if (a.balance > 0) {
        owed[a.currency] = cents(owed[a.currency] + a.balance);
        owes = true;
      } else if (a.balance < 0) credit[a.currency] = cents(credit[a.currency] - a.balance);
    }
    if (owes) owing++;
  }
  return { owed, credit, owing };
}

/** The trips in the accounts whose amount the office has to complete. */
export const withoutAmount = (clients: readonly Pick<Client, 'accounts'>[]) => clients.reduce((n, c) => n + c.accounts.reduce((m, a) => m + a.withoutAmount, 0), 0);

/** The clients whose name holds the text, written in any way. */
export function filterClients<C extends Pick<Client, 'name'>>(list: readonly C[], q: string): C[] {
  const needle = clientName(q);
  return needle ? list.filter((c) => clientName(c.name).includes(needle)) : [...list];
}

export interface CollectionFilter {
  q?: string;
  /** Inclusive days. */
  from?: string;
  to?: string;
  /** The annulled ones (collections and opening balances), to bring them back; otherwise the collections that count. */
  annulled?: boolean;
  /** Each client's name as the screens show it, searched too. */
  names?: ReadonlyMap<string, string>;
}

/** Collections of a period, newest first: the ones that count, or the annulled ones with the annulled opening balances. */
export function filterCollections(list: readonly ClientMovement[], { q = '', from, to, annulled = false, names }: CollectionFilter = {}): ClientMovement[] {
  const needle = fold(q);
  return list
    .filter((m) => {
      if (m.deleted !== annulled || (!annulled && m.kind !== 'payment')) return false;
      if (!within(m.day, from, to)) return false;
      if (!needle) return true;
      const method = PAYMENT_METHODS.find((p) => p.value === m.method)?.label ?? null;
      return [m.clientName, names?.get(m.clientKey), m.notes, method].some((v) => v != null && fold(v).includes(needle));
    })
    .sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

/** What a list of collections adds up to, per currency. */
export function collectionTotals(list: readonly ClientMovement[]): { count: number; amounts: Record<Currency, number> } {
  const amounts = { UYU: 0, USD: 0 };
  for (const m of list) amounts[m.currency] = cents(amounts[m.currency] + m.amount);
  return { count: list.length, amounts };
}

/**
 * Parses the client part of a page address: "name:…" (written in any way, it is the client's key), or the trips billed
 * without a client ("name:").
 */
export function parseClientKey(key: string | undefined): string | null {
  if (key === undefined || !key.startsWith(NO_CLIENT)) return null;
  return key === NO_CLIENT ? NO_CLIENT : clientKey(key.slice(NO_CLIENT.length));
}
