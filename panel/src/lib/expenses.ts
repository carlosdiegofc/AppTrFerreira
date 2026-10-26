// Gastos (Gastos y finanzas, decision of 26/10/2026): each expense of the company with its invoice, what it goes to (the
// company, a truck, a trailer, a driver or a trip), the filters, the sums and the form. Pesos and dollars are never
// converted or added together, as in Combustible. The fuel, the electronic tolls and the salaries stay in their
// sections: here go the other expenses. Pure functions: no network, no React.
import type { Tables, TablesInsert } from './database.types';
import { calendarDay, formatDay } from './dates';
import { type FileType, fileType } from './documents';
import { amount, type Driver } from './drivers';
import { text } from './fleet';
import type { Currency } from './fuel';
import { fold, toNumber } from './numbers';
import { trailerLabel, type TruckEntry, type Vehicle } from './vehicles';

export type ExpenseRow = Tables<'trf_expenses'>;

/** The kinds the panel offers (decision of 26/10/2026); any other can be written. */
export const EXPENSE_CATEGORIES = ['Reparación y repuestos', 'Cubiertas', 'Service', 'Seguro', 'Patente e impuestos', 'Peajes en efectivo', 'Multas', 'Lavado', 'Viáticos', 'Otros'] as const;
/** The choice of the list that lets the kind be written. */
export const OTHER_CATEGORY = '__otro__';
export const EXPENSE_LIMITS = { category: 60, supplier: 120, notes: 1000, targetName: 200 } as const;

export type ExpenseMethod = 'efectivo' | 'transferencia' | 'cheque' | 'tarjeta' | 'otro';
export const EXPENSE_METHODS: readonly { value: ExpenseMethod; label: string }[] = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'otro', label: 'Otro' },
];
export const methodLabel = (m: ExpenseMethod) => EXPENSE_METHODS.find((x) => x.value === m)?.label ?? 'Otro';

export type ExpenseTarget = 'company' | 'truck' | 'trailer' | 'driver' | 'trip';
/** What an expense can go to; the address names a whole kind by its word («camiones»). */
export const EXPENSE_TARGETS: readonly { value: ExpenseTarget; label: string; kind: string; plural: string; all: string; word: string }[] = [
  { value: 'company', label: 'La empresa', kind: 'Empresa', plural: 'La empresa', all: 'La empresa', word: 'empresa' },
  { value: 'truck', label: 'Un camión', kind: 'Camión', plural: 'Camiones', all: 'Todos los camiones', word: 'camiones' },
  { value: 'trailer', label: 'Un acoplado', kind: 'Acoplado', plural: 'Acoplados', all: 'Todos los acoplados', word: 'acoplados' },
  { value: 'driver', label: 'Un chofer', kind: 'Chofer', plural: 'Choferes', all: 'Todos los choferes', word: 'choferes' },
  { value: 'trip', label: 'Un viaje', kind: 'Viaje', plural: 'Viajes', all: 'Todos los viajes', word: 'viajes' },
];

export interface Expense {
  id: string;
  spentOn: string;
  category: string;
  amount: number;
  currency: Currency;
  target: ExpenseTarget;
  /** What it goes to, as the address names it: «empresa», «camion:plate:abc1234», «acoplado:<id>», «chofer:<id>», «viaje:app:<id>». */
  targetKey: string;
  vehicleKey: string | null;
  trailerId: string | null;
  driverId: string | null;
  /** The trip as the panel names it: «app:» and the app's trip, or «web:» and the one typed in the panel. */
  tripKey: string | null;
  /** How that was named when the expense was saved: it names it even after it changes. */
  targetName: string;
  /** The service done whose cost it is, when it was noted from Mantenimiento. */
  serviceId: string | null;
  supplier: string;
  method: ExpenseMethod;
  notes: string;
  file: { path: string; type: FileType } | null;
  /** Annulled: it stays saved, but does not count. */
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

const TARGET_PREFIX: Record<Exclude<ExpenseTarget, 'company'>, string> = { truck: 'camion:', trailer: 'acoplado:', driver: 'chofer:', trip: 'viaje:' };

/** The key of what an expense goes to, as the address names it. */
export function targetKey(target: ExpenseTarget, ref: string | null): string {
  return target === 'company' ? 'empresa' : TARGET_PREFIX[target] + (ref ?? '');
}

const targetRef = (r: Pick<ExpenseRow, 'vehicle_key' | 'trailer_id' | 'driver_id' | 'trip_key'>, target: ExpenseTarget) =>
  target === 'truck' ? r.vehicle_key : target === 'trailer' ? r.trailer_id : target === 'driver' ? r.driver_id : target === 'trip' ? r.trip_key : null;

export function expenseFromRow(r: ExpenseRow): Expense {
  const target = EXPENSE_TARGETS.find((t) => t.value === r.target)?.value ?? 'company';
  const path = text(r.file_path);
  return {
    id: r.id,
    spentOn: calendarDay(r.spent_on) ?? r.spent_on,
    category: text(r.category) ?? 'Otros',
    amount: toNumber(r.amount) ?? 0,
    currency: r.currency === 'USD' ? 'USD' : 'UYU',
    target,
    targetKey: targetKey(target, targetRef(r, target)),
    vehicleKey: r.vehicle_key,
    trailerId: r.trailer_id,
    driverId: r.driver_id,
    tripKey: r.trip_key,
    targetName: text(r.target_name) ?? '',
    serviceId: r.service_id,
    supplier: text(r.supplier) ?? '',
    method: EXPENSE_METHODS.find((m) => m.value === r.method)?.value ?? 'otro',
    notes: text(r.notes) ?? '',
    file: path === null ? null : { path, type: fileType(path) },
    deleted: r.deleted_at !== null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** How the lists name what an expense can go to now: each truck by its key, each trailer and driver by its card. */
export interface TargetNames {
  trucks: ReadonlyMap<string, string>;
  trailers: ReadonlyMap<string, string>;
  drivers: ReadonlyMap<string, string>;
}

export const NO_NAMES: TargetNames = { trucks: new Map(), trailers: new Map(), drivers: new Map() };

export interface TargetChoice {
  /** The truck's key, or the id of the trailer's or the driver's card. */
  ref: string;
  label: string;
}

/** What the form offers for each kind: the ones in use, and apart the ones sold or that no longer work. */
export type TargetChoices = Record<'trucks' | 'trailers' | 'drivers', { current: TargetChoice[]; gone: TargetChoice[] }>;

/** Nothing to choose: for a form where what the expense goes to is fixed (a service's cost, a trip's expense). */
export const NO_CHOICES: TargetChoices = { trucks: { current: [], gone: [] }, trailers: { current: [], gone: [] }, drivers: { current: [], gone: [] } };

const byLabel = (a: TargetChoice, b: TargetChoice) => a.label.localeCompare(b.label, 'es');

/** What an expense can go to, and how each is named now: the trucks of the catalog and of the cards, the trailers and the drivers. */
export function targetChoices(
  trucks: { current: readonly Pick<TruckEntry, 'key' | 'label'>[]; gone: readonly Pick<TruckEntry, 'key' | 'label'>[] },
  vehicles: readonly Vehicle[],
  drivers: readonly Pick<Driver, 'id' | 'name' | 'active'>[],
): { choices: TargetChoices; names: TargetNames } {
  const truck = (e: Pick<TruckEntry, 'key' | 'label'>): TargetChoice => ({ ref: e.key, label: e.label });
  const trailers = vehicles.filter((v) => v.kind === 'trailer').map((v) => ({ ref: v.id, label: trailerLabel(v), gone: v.leftOn !== null }));
  const people = drivers.map((d) => ({ ref: d.id, label: d.name, gone: !d.active }));
  const split = (list: { ref: string; label: string; gone: boolean }[]) => ({
    current: list.filter((x) => !x.gone).map(({ ref, label }) => ({ ref, label })).sort(byLabel),
    gone: list.filter((x) => x.gone).map(({ ref, label }) => ({ ref, label })).sort(byLabel),
  });
  const choices: TargetChoices = {
    trucks: { current: trucks.current.map(truck), gone: trucks.gone.map(truck) },
    trailers: split(trailers),
    drivers: split(people),
  };
  const names = (c: { current: TargetChoice[]; gone: TargetChoice[] }) => new Map([...c.current, ...c.gone].map((x) => [x.ref, x.label]));
  return { choices, names: { trucks: names(choices.trucks), trailers: names(choices.trailers), drivers: names(choices.drivers) } };
}

/** A truck's key without its name: its plate in capitals («plate:abc1234» → «ABC1234»). */
const keyName = (key: string | null) => (key ?? '').replace(/^(plate|model):/, '').toUpperCase();

/** What an expense goes to, named as the lists name it now, or as it was named when it was saved. */
export function targetLabel(e: Pick<Expense, 'target' | 'vehicleKey' | 'trailerId' | 'driverId' | 'targetName'>, names: TargetNames): string {
  switch (e.target) {
    case 'company':
      return 'La empresa';
    case 'truck':
      return names.trucks.get(e.vehicleKey ?? '') ?? (e.targetName || keyName(e.vehicleKey) || 'Camión sin indicar');
    case 'trailer':
      return names.trailers.get(e.trailerId ?? '') ?? (e.targetName || 'Acoplado sin indicar');
    case 'driver':
      return names.drivers.get(e.driverId ?? '') ?? (e.targetName || 'Chofer sin indicar');
    default:
      return e.targetName || 'Viaje sin indicar';
  }
}

export const targetKind = (t: ExpenseTarget) => EXPENSE_TARGETS.find((x) => x.value === t)?.kind ?? 'Empresa';

/** «2026-10-01» to «2026-10-31», inclusive; a whole kind («camiones») or one thing (its key) or everything. */
export interface ExpenseFilters {
  from?: string;
  to?: string;
  category?: string;
  target?: string;
  q?: string;
  /** The annulled ones, instead of the ones that count. */
  annulled?: boolean;
}

/** Whether an expense goes to what the filter names: «empresa», a whole kind («camiones») or one thing by its key. */
export function goesTo(e: Pick<Expense, 'target' | 'targetKey'>, filter: string): boolean {
  if (!filter) return true;
  const kind = EXPENSE_TARGETS.find((t) => t.word === filter);
  return kind ? e.target === kind.value : e.targetKey === filter;
}

/** The address of the expenses of one thing, of every day: «Ver sus gastos» of a truck, a trailer, a driver or a trip. */
export const expensesLink = (filter: string) => `/finanzas?periodo=todo&destino=${encodeURIComponent(filter)}`;

/** How the filter «A qué va» names what it shows. */
export function filterLabel(filter: string, names: TargetNames, list: readonly Expense[]): string {
  const kind = EXPENSE_TARGETS.find((t) => t.word === filter);
  if (kind) return kind.all;
  const one = list.find((e) => e.targetKey === filter);
  if (one) return targetLabel(one, names);
  for (const [target, prefix] of Object.entries(TARGET_PREFIX) as [Exclude<ExpenseTarget, 'company'>, string][]) {
    if (!filter.startsWith(prefix)) continue;
    const ref = filter.slice(prefix.length);
    return targetLabel({ target, vehicleKey: ref, trailerId: ref, driverId: ref, targetName: '' }, names);
  }
  return filter;
}

/**
 * What a new expense starts with when the list shows one thing: that thing (a trip only from its own page, which names
 * it). Null for a whole kind or everything.
 */
export function presetOf(filter: string): ExpensePreset | null {
  if (filter === 'empresa') return { target: 'company' };
  for (const [target, prefix] of Object.entries(TARGET_PREFIX) as [Exclude<ExpenseTarget, 'company'>, string][]) {
    if (target !== 'trip' && filter.startsWith(prefix) && filter.length > prefix.length) return { target, ref: filter.slice(prefix.length) };
  }
  return null;
}

/** The same kind, however it was written: «cubiertas» is «Cubiertas». */
const sameCategory = (a: string, b: string) => fold(a).replace(/\s+/g, ' ') === fold(b).replace(/\s+/g, ' ');

/** The expenses of the filters, the newest first. */
export function filterExpenses(list: readonly Expense[], f: ExpenseFilters, names: TargetNames = NO_NAMES): Expense[] {
  const words = fold(f.q).split(/\s+/).filter(Boolean);
  return list
    .filter((e) => {
      if (e.deleted !== Boolean(f.annulled)) return false;
      if (f.from && e.spentOn < f.from) return false;
      if (f.to && e.spentOn > f.to) return false;
      if (f.category && !sameCategory(e.category, f.category)) return false;
      if (f.target && !goesTo(e, f.target)) return false;
      if (words.length === 0) return true;
      const hay = fold([e.category, e.supplier, e.notes, targetLabel(e, names), e.targetName].join(' '));
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

/** Cents, so sums of many amounts do not drift. */
const cents = (n: number) => Math.round(n * 100) / 100;

export interface ExpenseTotals {
  count: number;
  amounts: Record<Currency, number>;
  /** Without the photo or the PDF of the invoice. */
  withoutFile: number;
}

/** What a list of expenses adds up to, pesos and dollars apart. */
export function expenseTotals(list: readonly Pick<Expense, 'amount' | 'currency' | 'file'>[]): ExpenseTotals {
  const out: ExpenseTotals = { count: 0, amounts: { UYU: 0, USD: 0 }, withoutFile: 0 };
  for (const e of list) {
    out.count++;
    out.amounts[e.currency] = cents(out.amounts[e.currency] + e.amount);
    if (!e.file) out.withoutFile++;
  }
  return out;
}

export interface ExpenseGroup {
  /** The kind (as the list writes it) or what it goes to (its key). */
  key: string;
  label: string;
  count: number;
  amounts: Record<Currency, number>;
}

/** The biggest first: by pesos, then by dollars, then by name. */
const biggest = (a: ExpenseGroup, b: ExpenseGroup) => b.amounts.UYU - a.amounts.UYU || b.amounts.USD - a.amounts.USD || a.label.localeCompare(b.label, 'es');

function group(list: readonly Expense[], keyOf: (e: Expense) => string, labelOf: (e: Expense) => string): ExpenseGroup[] {
  const groups = new Map<string, ExpenseGroup>();
  for (const e of list) {
    const key = keyOf(e);
    const g = groups.get(key) ?? { key, label: labelOf(e), count: 0, amounts: { UYU: 0, USD: 0 } };
    g.count++;
    g.amounts[e.currency] = cents(g.amounts[e.currency] + e.amount);
    groups.set(key, g);
  }
  return [...groups.values()].sort(biggest);
}

/** Each kind with what it adds up to; a kind written in another way counts with the listed one. */
export function byCategory(list: readonly Expense[]): ExpenseGroup[] {
  const listed = (c: string) => EXPENSE_CATEGORIES.find((x) => sameCategory(x, c));
  const first = new Map<string, string>();
  for (const e of [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const k = fold(e.category).replace(/\s+/g, ' ');
    if (!first.has(k)) first.set(k, listed(e.category) ?? e.category);
  }
  const keyOf = (e: Expense) => fold(e.category).replace(/\s+/g, ' ');
  return group(list, keyOf, (e) => first.get(keyOf(e)) ?? e.category).map((g) => ({ ...g, key: g.label }));
}

/** Each thing the expenses went to, with what it adds up to. */
export function byTarget(list: readonly Expense[], names: TargetNames): ExpenseGroup[] {
  return group(list, (e) => e.targetKey, (e) => targetLabel(e, names));
}

/** The kind of expense of a service's cost: the listed kind it is named after («Cubiertas»), or «Service». */
export function serviceCategory(kind: string): string {
  return EXPENSE_CATEGORIES.find((c) => sameCategory(c, kind)) ?? 'Service';
}

/** A trip as an expense names it: «Orden de carga 24129 · Paysandú → Salto», or by its driver and its day. */
export function tripTargetName(trip: { orderNumber: string | null; driverName: string | null; originName: string | null; destinationName: string | null; departureAt: string | null }): string {
  const head = trip.orderNumber ? `Orden de carga ${trip.orderNumber}` : `Viaje de ${trip.driverName ?? 'chofer sin indicar'}`;
  const route = trip.originName && trip.destinationName ? `${trip.originName} → ${trip.destinationName}` : trip.destinationName ? `a ${trip.destinationName}` : null;
  const day = calendarDay(trip.departureAt);
  return [head, route ?? (day ? `del ${formatDay(day)}` : null)].filter(Boolean).join(' · ').slice(0, EXPENSE_LIMITS.targetName);
}

/** Where the invoice of an expense goes: «<expense>/<file>.jpg» or «.pdf», the rule of the folder. */
export const expenseFilePath = (expenseId: string, fileId: string, type: FileType) => `${expenseId}/${fileId}.${type === 'pdf' ? 'pdf' : 'jpg'}`;

// ---- The form ----

export interface ExpenseFormValues {
  spentOn: string;
  /** One of the kinds of the list, or OTHER_CATEGORY. */
  categoryChoice: string;
  /** The kind written by hand, with OTHER_CATEGORY. */
  category: string;
  amount: string;
  currency: Currency;
  target: ExpenseTarget;
  vehicleKey: string;
  trailerId: string;
  driverId: string;
  tripKey: string;
  supplier: string;
  method: ExpenseMethod;
  notes: string;
}

export type ExpenseField = keyof ExpenseFormValues;

/** What a new expense starts with when it is noted from somewhere: a service done, a trip, a truck… */
export interface ExpensePreset {
  target?: ExpenseTarget;
  ref?: string;
  spentOn?: string;
  category?: string;
  notes?: string;
}

const choiceOf = (category: string) => {
  const listed = EXPENSE_CATEGORIES.find((c) => c === category);
  return listed ? { categoryChoice: listed, category: '' } : { categoryChoice: OTHER_CATEGORY, category };
};

/** The expense as it is, or a new one: today, in pesos, by transfer, for the company unless a preset says otherwise. */
export function expenseFormValues(e: Expense | null, today: string, preset: ExpensePreset = {}): ExpenseFormValues {
  if (e) {
    return {
      spentOn: e.spentOn,
      ...choiceOf(e.category),
      amount: String(e.amount).replace('.', ','),
      currency: e.currency,
      target: e.target,
      vehicleKey: e.vehicleKey ?? '',
      trailerId: e.trailerId ?? '',
      driverId: e.driverId ?? '',
      tripKey: e.tripKey ?? '',
      supplier: e.supplier,
      method: e.method,
      notes: e.notes,
    };
  }
  const target = preset.target ?? 'company';
  const ref = preset.ref ?? '';
  return {
    spentOn: preset.spentOn && preset.spentOn <= today ? preset.spentOn : today,
    ...(preset.category ? choiceOf(preset.category) : { categoryChoice: '', category: '' }),
    amount: '',
    currency: 'UYU',
    target,
    vehicleKey: target === 'truck' ? ref : '',
    trailerId: target === 'trailer' ? ref : '',
    driverId: target === 'driver' ? ref : '',
    tripKey: target === 'trip' ? ref : '',
    supplier: '',
    method: 'transferencia',
    notes: preset.notes ?? '',
  };
}

/** The reference of what the form says the expense goes to. */
export function formRef(v: Pick<ExpenseFormValues, 'target' | 'vehicleKey' | 'trailerId' | 'driverId' | 'tripKey'>): string | null {
  const ref = v.target === 'truck' ? v.vehicleKey : v.target === 'trailer' ? v.trailerId : v.target === 'driver' ? v.driverId : v.target === 'trip' ? v.tripKey : '';
  return v.target === 'company' ? null : ref || null;
}

export type ExpensePayload = Omit<TablesInsert<'trf_expenses'>, 'id' | 'service_id' | 'file_path'>;

const MISSING_TARGET: Record<Exclude<ExpenseTarget, 'company'>, string> = {
  truck: 'Elegí el camión.',
  trailer: 'Elegí el acoplado.',
  driver: 'Elegí el chofer.',
  trip: 'Elegí el viaje.',
};

/** The field that holds what the expense goes to. */
export const targetField = (t: ExpenseTarget): ExpenseField => (t === 'truck' ? 'vehicleKey' : t === 'trailer' ? 'trailerId' : t === 'driver' ? 'driverId' : t === 'trip' ? 'tripKey' : 'target');

/**
 * The row to save, or what is wrong with each field. name is how the lists name what it goes to now: it is saved with
 * the expense, so the expense names it even after it changes.
 */
export function validateExpense(v: ExpenseFormValues, today: string, name: string): { row: ExpensePayload | null; errors: Partial<Record<ExpenseField, string>> } {
  const errors: Partial<Record<ExpenseField, string>> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.spentOn) || v.spentOn < '2000-01-01' || calendarDay(v.spentOn) === null) errors.spentOn = 'Elegí la fecha del gasto.';
  else if (v.spentOn > today) errors.spentOn = 'La fecha no puede ser posterior a hoy.';
  let category = '';
  if (v.categoryChoice === OTHER_CATEGORY) {
    category = v.category.trim().replace(/\s+/g, ' ');
    if (!category) errors.category = 'Escribí el tipo de gasto.';
    else if (category.length > EXPENSE_LIMITS.category) errors.category = `Hasta ${EXPENSE_LIMITS.category} caracteres.`;
  } else if ((EXPENSE_CATEGORIES as readonly string[]).includes(v.categoryChoice)) {
    category = v.categoryChoice;
  } else {
    errors.categoryChoice = 'Elegí el tipo de gasto.';
  }
  const a = amount(v.amount);
  if (a.error) errors.amount = a.error;
  if (v.currency !== 'UYU' && v.currency !== 'USD') errors.currency = 'Elegí la moneda.';
  if (!EXPENSE_TARGETS.some((t) => t.value === v.target)) errors.target = 'Elegí a qué va.';
  const ref = formRef(v);
  if (v.target !== 'company' && EXPENSE_TARGETS.some((t) => t.value === v.target)) {
    const field = targetField(v.target);
    if (!ref) errors[field] = MISSING_TARGET[v.target];
    else if (v.target === 'trip' && !/^(app|web):[0-9a-f-]{36}$/.test(ref)) errors[field] = 'Elegí el viaje de la lista.';
  }
  const supplier = v.supplier.trim().replace(/\s+/g, ' ');
  if (supplier.length > EXPENSE_LIMITS.supplier) errors.supplier = `Hasta ${EXPENSE_LIMITS.supplier} caracteres.`;
  const notes = v.notes.trim();
  if (notes.length > EXPENSE_LIMITS.notes) errors.notes = `Hasta ${EXPENSE_LIMITS.notes} caracteres.`;
  if (!EXPENSE_METHODS.some((m) => m.value === v.method)) errors.method = 'Elegí cómo se pagó.';
  if (Object.keys(errors).length > 0 || a.value === null) return { row: null, errors };
  return {
    row: {
      spent_on: v.spentOn,
      category,
      amount: a.value,
      currency: v.currency,
      target: v.target,
      vehicle_key: v.target === 'truck' ? ref : null,
      trailer_id: v.target === 'trailer' ? ref : null,
      driver_id: v.target === 'driver' ? ref : null,
      trip_key: v.target === 'trip' ? ref : null,
      target_name: v.target === 'company' ? '' : name.trim().slice(0, EXPENSE_LIMITS.targetName),
      supplier,
      method: v.method,
      notes,
    },
    errors,
  };
}

/** The suppliers written before, the latest first, for the form to suggest them. */
export function knownSuppliers(list: readonly Pick<Expense, 'supplier' | 'createdAt'>[]): string[] {
  const seen = new Map<string, string>();
  for (const e of [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const k = fold(e.supplier);
    if (k && !seen.has(k)) seen.set(k, e.supplier);
  }
  return [...seen.values()];
}

/** The kinds written by hand before, to offer them again. */
export function writtenCategories(list: readonly Pick<Expense, 'category'>[]): string[] {
  const seen = new Map<string, string>();
  for (const e of list) {
    const k = fold(e.category).replace(/\s+/g, ' ');
    if (!EXPENSE_CATEGORIES.some((c) => sameCategory(c, e.category)) && !seen.has(k)) seen.set(k, e.category);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

/** The cost noted for each service done, by the id of the service: the one that counts. */
export function serviceCosts(list: readonly Expense[]): Map<string, Expense> {
  const out = new Map<string, Expense>();
  for (const e of list) if (e.serviceId && !e.deleted) out.set(e.serviceId, e);
  return out;
}
