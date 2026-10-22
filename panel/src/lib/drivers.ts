// Drivers (Choferes, decision of 22/10/2026): each driver's card, the salary of each month and what is paid to them.
// The adelantos and the sueldo paid for a month are subtracted from that month's salary; the aguinaldo, the leave pay,
// the viáticos and the rest show apart. Pesos and dollars are never converted or added together, as in Combustible.
// Pure functions: no network, no React.
import type { Tables, TablesInsert } from './database.types';
import { firstOfMonth, firstOfNextMonth } from './dates';
import { text } from './fleet';
import { type Currency, PAYMENT_METHODS, type PaymentMethod } from './fuel';
import { fold, parseNumber, toNumber } from './numbers';
import { type PaperState, paperState } from './papers';
import type { DriverPresence } from './presence';

export type DriverRow = Tables<'trf_drivers'>;
export type SalaryRow = Tables<'trf_driver_salaries'>;
export type PaymentRow = Tables<'trf_driver_payments'>;

export type PayConcept = 'adelanto' | 'sueldo' | 'aguinaldo' | 'vacaciones' | 'viatico' | 'otro';
/** What a payment is. Only the ones that count for the salary are subtracted from the month's salary. */
export const PAY_CONCEPTS: readonly { value: PayConcept; label: string; salary: boolean }[] = [
  { value: 'adelanto', label: 'Adelanto', salary: true },
  { value: 'sueldo', label: 'Sueldo', salary: true },
  { value: 'aguinaldo', label: 'Aguinaldo', salary: false },
  { value: 'vacaciones', label: 'Licencia y salario vacacional', salary: false },
  { value: 'viatico', label: 'Viático', salary: false },
  { value: 'otro', label: 'Otro', salary: false },
];

/** The categories of the Uruguayan driving licence; any other can be written. */
export const LICENSE_CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'F', 'G1', 'G2', 'G3', 'H'] as const;
export const DRIVER_LIMITS = { name: 120, phone: 40, documentId: 20, licenseCategory: 20, bank: 80, bankAccount: 60, notes: 1000, moneyNotes: 500 } as const;
/** Below 100 million, as the database checks. */
export const MAX_AMOUNT = 99_999_999.99;

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

/** «octubre de 2026» for the first day of a month (or any day of it); «Octubre de 2026» to start a line. */
export function monthLabel(month: string, start = false): string {
  const [y, m] = month.split('-');
  const name = MONTH_NAMES[Number(m) - 1] ?? '?';
  return `${start ? name.charAt(0).toUpperCase() + name.slice(1) : name} de ${y}`;
}

export interface Driver {
  id: string;
  /** The app account: the same of the driver's trips, papers and position. Null for a driver without the app. */
  userId: string | null;
  name: string;
  phone: string;
  documentId: string;
  hiredOn: string | null;
  licenseCategory: string;
  payMethod: PaymentMethod | null;
  bank: string;
  bankAccount: string;
  notes: string;
  active: boolean;
  /** The day the driver stopped working (only for a card that is not active): the salary stops with that month. */
  leftOn: string | null;
  updatedAt: string;
}

export function driverFromRow(r: DriverRow): Driver {
  return {
    id: r.id,
    userId: r.user_id,
    name: text(r.name) ?? 'Sin nombre',
    phone: text(r.phone) ?? '',
    documentId: text(r.document_id) ?? '',
    hiredOn: r.hired_on,
    licenseCategory: text(r.license_category) ?? '',
    payMethod: PAYMENT_METHODS.find((p) => p.value === r.pay_method)?.value ?? null,
    bank: text(r.bank) ?? '',
    bankAccount: text(r.bank_account) ?? '',
    notes: text(r.notes) ?? '',
    active: r.active,
    leftOn: r.active ? null : r.left_on,
    updatedAt: r.updated_at,
  };
}

export interface Salary {
  id: string;
  driverId: string;
  /** The first day of the month it starts. */
  startsOn: string;
  amount: number;
  currency: Currency;
  notes: string;
  /** Annulled: it does not count. */
  deleted: boolean;
  updatedAt: string;
}

export function salaryFromRow(r: SalaryRow): Salary {
  return {
    id: r.id,
    driverId: r.driver_id,
    startsOn: firstOfMonth(r.starts_on),
    amount: toNumber(r.amount) ?? 0,
    currency: r.currency === 'USD' ? 'USD' : 'UYU',
    notes: text(r.notes) ?? '',
    deleted: r.deleted_at !== null,
    updatedAt: r.updated_at,
  };
}

export interface Payment {
  id: string;
  driverId: string;
  paidOn: string;
  /** The first day of the month of the salary it belongs to. */
  period: string;
  amount: number;
  currency: Currency;
  concept: PayConcept;
  method: PaymentMethod;
  notes: string;
  /** Annulled: it does not count. */
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export function paymentFromRow(r: PaymentRow): Payment {
  return {
    id: r.id,
    driverId: r.driver_id,
    paidOn: r.paid_on,
    period: firstOfMonth(r.period),
    amount: toNumber(r.amount) ?? 0,
    currency: r.currency === 'USD' ? 'USD' : 'UYU',
    concept: PAY_CONCEPTS.find((c) => c.value === r.concept)?.value ?? 'otro',
    method: PAYMENT_METHODS.find((p) => p.value === r.method)?.value ?? 'otro',
    notes: text(r.notes) ?? '',
    deleted: r.deleted_at !== null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const conceptLabel = (c: PayConcept) => PAY_CONCEPTS.find((p) => p.value === c)?.label ?? 'Otro';
const countsForSalary = (c: PayConcept) => PAY_CONCEPTS.find((p) => p.value === c)?.salary ?? false;
/** Cents, so sums of many amounts do not drift. */
const cents = (n: number) => Math.round(n * 100) / 100;

/** The salary in force in a month: the latest one that started that month or before. Annulled ones do not count. */
export function salaryFor(salaries: readonly Salary[], month: string): Salary | null {
  let found: Salary | null = null;
  for (const s of salaries) {
    if (s.deleted || s.startsOn > month) continue;
    if (!found || s.startsOn > found.startsOn) found = s;
  }
  return found;
}

export interface MonthLine {
  /** The first day of the month. */
  month: string;
  salary: Salary | null;
  /** The adelantos and the sueldo of the month in the salary's currency (pesos without a salary). */
  paid: number;
  currency: Currency;
  /** What is left of the salary; negative, paid above it. Null without a salary. */
  pending: number | null;
  /** What does not go against the salary, by what it is and its currency. */
  others: { label: string; currency: Currency; amount: number }[];
  /** The month's payments that are not annulled, in the order they were made. */
  payments: Payment[];
  /** After the month the driver stopped working: it has no salary, only the payments made for it (a settlement). */
  afterLeaving: boolean;
}

/**
 * Each month (as given) with its salary, what was paid against it and what is left. For a driver who stopped working
 * (leftOn), the months after that one have no salary.
 */
export function monthLines(salaries: readonly Salary[], payments: readonly Payment[], months: readonly string[], leftOn: string | null = null): MonthLine[] {
  const lastMonth = leftOn ? firstOfMonth(leftOn) : null;
  return months.map((month) => {
    const afterLeaving = lastMonth !== null && month > lastMonth;
    const salary = afterLeaving ? null : salaryFor(salaries, month);
    const currency = salary?.currency ?? 'UYU';
    const mine = payments
      .filter((p) => !p.deleted && p.period === month)
      .sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.createdAt.localeCompare(b.createdAt));
    let paid = 0;
    const others = new Map<string, { label: string; currency: Currency; amount: number }>();
    for (const p of mine) {
      if (countsForSalary(p.concept) && p.currency === currency) {
        paid += p.amount;
        continue;
      }
      // A salary payment in the other currency is not converted: it shows apart, as what it is.
      const label = countsForSalary(p.concept) ? `${conceptLabel(p.concept)} en ${p.currency === 'USD' ? 'dólares' : 'pesos'}` : conceptLabel(p.concept);
      const key = `${label}|${p.currency}`;
      const o = others.get(key) ?? { label, currency: p.currency, amount: 0 };
      o.amount = cents(o.amount + p.amount);
      others.set(key, o);
    }
    paid = cents(paid);
    return { month, salary, paid, currency, pending: salary ? cents(salary.amount - paid) : null, others: [...others.values()], payments: mine, afterLeaving };
  });
}

export type MonthTone = 'ok' | 'warn' | 'blue' | 'muted';

/** What the list and the month say of a month: what is left, up to date, paid above, or that there is no salary. */
export function monthStatus(line: Pick<MonthLine, 'salary' | 'paid' | 'pending' | 'currency' | 'payments'> & { afterLeaving?: boolean }, money: (n: number, c: Currency) => string): { tone: MonthTone; text: string } {
  if (line.afterLeaving) return { tone: 'muted', text: 'Después del egreso' };
  if (line.pending === null) return line.payments.length > 0 ? { tone: 'muted', text: 'Sin sueldo cargado' } : { tone: 'muted', text: 'Sin sueldo ni pagos' };
  if (line.pending > 0) return { tone: 'warn', text: `Falta ${money(line.pending, line.currency)}` };
  if (line.pending === 0) return { tone: 'ok', text: 'Al día' };
  return { tone: 'blue', text: `Pagado de más ${money(-line.pending, line.currency)}` };
}

export interface MoneyHistory {
  salaries: readonly Salary[];
  payments: readonly Payment[];
  /** The day the driver stopped working: no salary after that month. */
  leftOn?: string | null;
}

/**
 * The span of months worth showing: from the first salary or payment up to today's month (the month the driver
 * stopped working, for one who did), or later if a payment is for a later month.
 */
function span({ salaries, payments, leftOn }: MoneyHistory, today: string): { first: string; last: string } {
  const end = firstOfMonth(leftOn ?? today);
  const months = [...salaries.filter((s) => !s.deleted).map((s) => s.startsOn), ...payments.filter((p) => !p.deleted).map((p) => p.period)];
  const first = months.reduce((min, m) => (m < min ? m : min), end);
  const last = payments.filter((p) => !p.deleted).reduce((max, p) => (p.period > max ? p.period : max), end);
  return { first, last };
}

/** The years worth showing, the newest first; there is always the current one. */
export function moneyYears(history: MoneyHistory, today: string): number[] {
  const { first, last } = span(history, today);
  const years: number[] = [];
  for (let y = Number(last.slice(0, 4)); y >= Number(first.slice(0, 4)); y--) years.push(y);
  return years;
}

/** The months of a year worth showing, the newest first. */
export function yearMonths(year: number, today: string, history: MoneyHistory): string[] {
  const { first, last } = span(history, today);
  const out: string[] = [];
  for (let m = 12; m >= 1; m--) {
    const month = `${year}-${String(m).padStart(2, '0')}-01`;
    if (month >= first && month <= last) out.push(month);
  }
  return out;
}

/** How long a driver has been in the company: «1 año y 7 meses», «3 meses», «menos de un mes». */
export function seniority(hiredOn: string, today: string): string | null {
  const [hy, hm, hd] = hiredOn.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  if (!hy || !hm || !hd || !ty || !tm || !td || hiredOn > today) return null;
  let months = (ty - hy) * 12 + (tm - hm) - (td < hd ? 1 : 0);
  const years = Math.floor(months / 12);
  months -= years * 12;
  const y = years === 0 ? '' : years === 1 ? '1 año' : `${years} años`;
  const m = months === 0 ? '' : months === 1 ? '1 mes' : `${months} meses`;
  if (!y && !m) return 'menos de un mes';
  return [y, m].filter(Boolean).join(' y ');
}

/**
 * Whether a trip, a paper or a receipt is the driver's: by the app account when both have it, by the name otherwise
 * (trips typed in the panel, or a driver without the app). The names the account used in the app count too (aliases),
 * so a trip typed with one of them stays the driver's after the card's name is corrected.
 */
export function belongsTo(driver: Pick<Driver, 'userId' | 'name'> & { aliases?: readonly string[] }, row: { driverId: string | null; driverName: string | null }): boolean {
  if (driver.userId && row.driverId) return driver.userId === row.driverId;
  const name = sameName(row.driverName);
  return name !== '' && [driver.name, ...(driver.aliases ?? [])].some((n) => sameName(n) === name);
}

/** The names an app account's rows were saved with («Luis Ferreira», «Los Ferreira»): a card's aliases. */
export function accountNames(rows: readonly { driverId: string | null; driverName: string | null }[], userId: string | null): string[] {
  if (!userId) return [];
  return [...new Set(rows.filter((r) => r.driverId === userId && r.driverName).map((r) => r.driverName as string))];
}

/** A name to compare: no accents, lower case, single spaces. */
const sameName = (name: string | null) => fold(name).replace(/\s+/g, ' ');

/** The app drivers that have no card yet. */
export function withoutCard(drivers: readonly Pick<Driver, 'userId'>[], appDrivers: readonly { id: string; name: string }[]): { id: string; name: string }[] {
  const linked = new Set(drivers.map((d) => d.userId).filter((id): id is string => id !== null));
  return appDrivers.filter((a) => !linked.has(a.id));
}

/** What the list shows of each driver: the card (or none yet), the app, the month's work, the papers and the salary. */
export interface DriverSummary {
  /** «ficha:<id>» for a card, «app:<account>» for an app driver without a card. */
  key: string;
  driver: Driver | null;
  userId: string | null;
  name: string;
  presence: DriverPresence | null;
  /** This month's trips that are not in the trash, and their kilometres measured by the GPS. */
  trips: number;
  km: number;
  papers: { late: number; soon: number };
  /** The driving licence among the papers, with its state. */
  license: { expiresOn: string | null; state: PaperState } | null;
  /** This month's salary; null without a card. */
  month: MonthLine | null;
}

export interface SummaryInput {
  drivers: readonly Driver[];
  appDrivers: readonly { id: string; name: string }[];
  presence: readonly DriverPresence[];
  trips: readonly { driverId: string | null; driverName: string | null; gpsKm: number | null; deleted: boolean }[];
  papers: readonly { scope: 'driver' | 'vehicle'; driverId: string | null; driverName: string; kind: string; expiresOn: string | null }[];
  salaries: readonly Salary[];
  payments: readonly Payment[];
}

const LICENSE = fold('Licencia de conducir');

/** Whether a paper is a driving licence. */
export const isLicense = (p: { kind: string }) => fold(p.kind) === LICENSE;

/** The driving licence among a driver's papers: the one that expires last, so a renewed one wins over the old one. */
export function latestLicense<T extends { kind: string; expiresOn: string | null }>(papers: readonly T[]): T | null {
  return papers.filter(isLicense).sort((a, b) => (b.expiresOn ?? '').localeCompare(a.expiresOn ?? ''))[0] ?? null;
}

/** Every card and every app driver without one, each with its summary; the ones with a card first, by name. */
export function driverSummaries(input: SummaryInput, today: string): DriverSummary[] {
  const month = firstOfMonth(today);
  const summary = (driver: Driver | null, userId: string | null, name: string): DriverSummary => {
    const who = { userId, name, aliases: accountNames(input.trips, userId) };
    const mine = input.trips.filter((t) => !t.deleted && belongsTo(who, t));
    const papers = input.papers.filter((p) => p.scope === 'driver' && belongsTo(who, { driverId: p.driverId, driverName: p.driverName }));
    const license = latestLicense(papers);
    // A licence that was renewed does not count as expired: only the latest one does.
    const states = papers.filter((p) => !isLicense(p) || p === license).map((p) => paperState(p.expiresOn, today));
    return {
      key: driver ? `ficha:${driver.id}` : `app:${userId}`,
      driver,
      userId,
      name,
      presence: userId ? (input.presence.find((p) => p.driverId === userId) ?? null) : null,
      trips: mine.length,
      km: mine.reduce((sum, t) => sum + (t.gpsKm ?? 0), 0),
      papers: { late: states.filter((s) => s === 'late').length, soon: states.filter((s) => s === 'soon').length },
      license: license ? { expiresOn: license.expiresOn, state: paperState(license.expiresOn, today) } : null,
      // A driver who stopped working before this month has no salary in it.
      month:
        driver && (!driver.leftOn || firstOfMonth(driver.leftOn) >= month)
          ? (monthLines(
              input.salaries.filter((x) => x.driverId === driver.id),
              input.payments.filter((x) => x.driverId === driver.id),
              [month],
              driver.leftOn,
            )[0] ?? null)
          : null,
    };
  };
  return [
    ...input.drivers.map((d) => summary(d, d.userId, d.name)),
    ...withoutCard(input.drivers, input.appDrivers)
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
      .map((a) => summary(null, a.id, a.name)),
  ];
}

/** What is left to pay this month, by currency, of the drivers with a salary in it (also one who stopped working this month). */
export function pendingThisMonth(list: readonly DriverSummary[]): Record<Currency, number> {
  const out: Record<Currency, number> = { UYU: 0, USD: 0 };
  for (const s of list) {
    if (!s.driver || !s.month || s.month.pending === null || s.month.pending <= 0) continue;
    out[s.month.currency] = cents(out[s.month.currency] + s.month.pending);
  }
  return out;
}

// ---- The forms ----

export interface DriverFormValues {
  name: string;
  userId: string;
  phone: string;
  documentId: string;
  hiredOn: string;
  licenseCategory: string;
  payMethod: string;
  bank: string;
  bankAccount: string;
  notes: string;
  active: boolean;
  /** The day the driver stopped working, while «Ya no trabaja» is checked. */
  leftOn: string;
}

export type DriverField = keyof DriverFormValues;

/** What the form starts with: the card as it is, or a new one (for an app driver, with the account and its name). */
export function driverFormValues(d: Driver | null, preset?: { userId: string; name: string }): DriverFormValues {
  if (!d) return { name: preset?.name ?? '', userId: preset?.userId ?? '', phone: '', documentId: '', hiredOn: '', licenseCategory: '', payMethod: '', bank: '', bankAccount: '', notes: '', active: true, leftOn: '' };
  return {
    name: d.name,
    userId: d.userId ?? '',
    phone: d.phone,
    documentId: d.documentId,
    hiredOn: d.hiredOn ?? '',
    licenseCategory: d.licenseCategory,
    payMethod: d.payMethod ?? '',
    bank: d.bank,
    bankAccount: d.bankAccount,
    notes: d.notes,
    active: d.active,
    leftOn: d.leftOn ?? '',
  };
}

const tooLong = (v: string, max: number) => (v.length > max ? `Hasta ${max} caracteres.` : null);

/**
 * Whether who stopped working can be marked as working again: in the month they left or the next one, when no whole month
 * without work is left in between. Later, the card would count salary for the months they did not work: whoever comes
 * back gets a new card. The database keeps the same rule.
 */
export function canComeBack(leftOn: string, today: string): boolean {
  return firstOfMonth(today) <= firstOfNextMonth(leftOn);
}

/**
 * The row to save, or what is wrong with each field. An account can have one card: linkedElsewhere are the others'.
 * leftBefore is the day the card says the driver stopped working, if it does.
 */
export function validateDriver(
  v: DriverFormValues,
  today: string,
  linkedElsewhere: ReadonlySet<string>,
  leftBefore: string | null = null,
): { row: TablesInsert<'trf_drivers'> | null; errors: Partial<Record<DriverField, string>> } {
  const errors: Partial<Record<DriverField, string>> = {};
  const name = v.name.trim().replace(/\s+/g, ' ');
  if (!name) errors.name = 'Escribí el nombre.';
  const checks: [DriverField, string, number][] = [
    ['name', name, DRIVER_LIMITS.name],
    ['phone', v.phone.trim(), DRIVER_LIMITS.phone],
    ['documentId', v.documentId.trim(), DRIVER_LIMITS.documentId],
    ['licenseCategory', v.licenseCategory.trim(), DRIVER_LIMITS.licenseCategory],
    ['bank', v.bank.trim(), DRIVER_LIMITS.bank],
    ['bankAccount', v.bankAccount.trim(), DRIVER_LIMITS.bankAccount],
    ['notes', v.notes.trim(), DRIVER_LIMITS.notes],
  ];
  for (const [field, value, max] of checks) {
    const e = tooLong(value, max);
    if (e && !errors[field]) errors[field] = e;
  }
  if (v.hiredOn && (!/^\d{4}-\d{2}-\d{2}$/.test(v.hiredOn) || v.hiredOn < '1950-01-01')) errors.hiredOn = 'Fecha no válida.';
  else if (v.hiredOn > today) errors.hiredOn = 'La fecha de ingreso no puede ser posterior a hoy.';
  if (!v.active) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.leftOn) || v.leftOn < '1950-01-01') errors.leftOn = 'Elegí el día en que dejó de trabajar.';
    else if (v.leftOn > today) errors.leftOn = 'No puede ser posterior a hoy.';
    else if (v.hiredOn && !errors.hiredOn && v.leftOn < v.hiredOn) errors.leftOn = 'No puede ser anterior a la fecha de ingreso.';
  } else if (leftBefore && !canComeBack(leftBefore, today)) {
    errors.active = 'Dejó de trabajar hace más de un mes: si vuelve, creá una ficha nueva.';
  }
  if (v.payMethod && !PAYMENT_METHODS.some((p) => p.value === v.payMethod)) errors.payMethod = 'Elegí un medio de la lista.';
  if (v.userId && linkedElsewhere.has(v.userId)) errors.userId = 'Esa cuenta de la app ya tiene su ficha.';
  if (Object.keys(errors).length > 0) return { row: null, errors };
  return {
    row: {
      name,
      user_id: v.userId || null,
      phone: v.phone.trim(),
      document_id: v.documentId.trim(),
      hired_on: v.hiredOn || null,
      license_category: v.licenseCategory.trim().toUpperCase(),
      pay_method: v.payMethod,
      bank: v.bank.trim(),
      bank_account: v.bankAccount.trim(),
      notes: v.notes.trim(),
      active: v.active,
      left_on: v.active ? null : v.leftOn,
    },
    errors,
  };
}

/** An amount as typed in Uruguay, above zero and with cents at most. */
function amount(raw: string): { value: number | null; error: string | null } {
  const parsed = parseNumber(raw);
  if (!parsed.ok) return { value: null, error: parsed.error };
  if (parsed.value === null) return { value: null, error: 'Escribí el importe.' };
  if (parsed.value <= 0) return { value: null, error: 'Tiene que ser mayor que cero.' };
  if (parsed.value > MAX_AMOUNT) return { value: null, error: 'Es demasiado grande.' };
  if (Math.abs(Math.round(parsed.value * 100) - parsed.value * 100) > 1e-6) return { value: null, error: 'Hasta dos decimales.' };
  return { value: Math.round(parsed.value * 100) / 100, error: null };
}

/** «2026-10» (the month input) to the first day of the month, or null. */
export function monthStart(value: string): string | null {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value >= '2000-01' ? `${value}-01` : null;
}

export interface SalaryFormValues {
  amount: string;
  currency: Currency;
  /** «2026-10». */
  startsOn: string;
  notes: string;
}

export type SalaryField = keyof SalaryFormValues;

export function salaryFormValues(s: Salary | null, today: string, current: Salary | null): SalaryFormValues {
  if (s) return { amount: String(s.amount).replace('.', ','), currency: s.currency, startsOn: s.startsOn.slice(0, 7), notes: s.notes };
  return { amount: '', currency: current?.currency ?? 'UYU', startsOn: today.slice(0, 7), notes: '' };
}

/** The row to save, or what is wrong. Two salaries in force cannot start the same month. */
export function validateSalary(v: SalaryFormValues, others: readonly Salary[], editingId: string | null): { row: Omit<TablesInsert<'trf_driver_salaries'>, 'driver_id'> | null; errors: Partial<Record<SalaryField, string>> } {
  const errors: Partial<Record<SalaryField, string>> = {};
  const a = amount(v.amount);
  if (a.error) errors.amount = a.error;
  const startsOn = monthStart(v.startsOn);
  if (!startsOn) errors.startsOn = 'Elegí el mes.';
  else if (others.some((s) => !s.deleted && s.id !== editingId && s.startsOn === startsOn)) errors.startsOn = 'Ya hay un sueldo desde ese mes: corregilo en vez de cargar otro.';
  const notes = v.notes.trim();
  if (notes.length > DRIVER_LIMITS.moneyNotes) errors.notes = `Hasta ${DRIVER_LIMITS.moneyNotes} caracteres.`;
  if (Object.keys(errors).length > 0 || a.value === null || !startsOn) return { row: null, errors };
  return { row: { amount: a.value, currency: v.currency, starts_on: startsOn, notes }, errors };
}

export interface PaymentFormValues {
  paidOn: string;
  /** «2026-10». */
  period: string;
  amount: string;
  currency: Currency;
  concept: PayConcept;
  method: PaymentMethod;
  notes: string;
}

export type PaymentField = keyof PaymentFormValues;

/** A new payment: today, for this month, in the salary's currency and by the usual means; or the payment as it is. */
export function paymentFormValues(p: Payment | null, today: string, driver: Pick<Driver, 'payMethod'>, salary: Salary | null): PaymentFormValues {
  if (p) return { paidOn: p.paidOn, period: p.period.slice(0, 7), amount: String(p.amount).replace('.', ','), currency: p.currency, concept: p.concept, method: p.method, notes: p.notes };
  return { paidOn: today, period: today.slice(0, 7), amount: '', currency: salary?.currency ?? 'UYU', concept: 'adelanto', method: driver.payMethod ?? 'efectivo', notes: '' };
}

export function validatePayment(v: PaymentFormValues, today: string): { row: Omit<TablesInsert<'trf_driver_payments'>, 'driver_id'> | null; errors: Partial<Record<PaymentField, string>> } {
  const errors: Partial<Record<PaymentField, string>> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.paidOn) || v.paidOn < '2000-01-01') errors.paidOn = 'Elegí la fecha del pago.';
  else if (v.paidOn > today) errors.paidOn = 'La fecha no puede ser posterior a hoy.';
  const period = monthStart(v.period);
  if (!period) errors.period = 'Elegí el mes al que corresponde.';
  const a = amount(v.amount);
  if (a.error) errors.amount = a.error;
  if (!PAY_CONCEPTS.some((c) => c.value === v.concept)) errors.concept = 'Elegí qué es.';
  if (!PAYMENT_METHODS.some((m) => m.value === v.method)) errors.method = 'Elegí cómo se pagó.';
  const notes = v.notes.trim();
  if (notes.length > DRIVER_LIMITS.moneyNotes) errors.notes = `Hasta ${DRIVER_LIMITS.moneyNotes} caracteres.`;
  if (Object.keys(errors).length > 0 || a.value === null || !period) return { row: null, errors };
  return { row: { paid_on: v.paidOn, period, amount: a.value, currency: v.currency, concept: v.concept, method: v.method, notes }, errors };
}

/**
 * Whether the row that came back is the one sent: a save tried again may bring back an earlier attempt with other data.
 * An annulment is the same whenever it was made: each try sends its own instant.
 */
export function savedAsSent(saved: Readonly<Record<string, unknown>>, sent: Readonly<Record<string, unknown>>): boolean {
  return Object.entries(sent).every(([k, v]) => {
    if (k === 'id') return true;
    if (k === 'deleted_at') return (saved[k] == null) === (v == null);
    return typeof v === 'number' ? Number(saved[k]) === v : (saved[k] ?? null) === (v ?? null);
  });
}
