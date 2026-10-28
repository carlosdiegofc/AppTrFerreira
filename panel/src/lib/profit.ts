// Ganancia (decisions of 26/10/2026 and 27/10/2026): what each trip, each truck each month and the company each month
// left. Billed minus the fuel, the tolls and the expenses; the company's month also takes the salary of that month and
// its viáticos. Pesos and dollars are never added together. What was billed, the fuel and the expenses are declared by
// the office and the drivers; the tolls are estimated: the passages the GPS saw, at the rate of each truck, in pesos.
// Pure functions: no network, no React.
import { billedAmount, missingAmount, tripDay } from './clients';
import { addDays, calendarDay, firstOfMonth } from './dates';
import { type Payment, type Salary, salaryFor } from './drivers';
import type { Expense } from './expenses';
import { NO_TRUCK } from './fleet';
import type { Currency, Receipt } from './fuel';
import { type RoadEvent, roadVehicleKey } from './road';
import type { Trip } from './trips';
import type { Hitch } from './vehicles';

export type Money = Record<Currency, number>;

export const noMoney = (): Money => ({ UYU: 0, USD: 0 });
/** Cents, so sums of many amounts do not drift. */
const cents = (n: number) => Math.round(n * 100) / 100;
const addTo = (m: Money, currency: Currency, amount: number) => {
  m[currency] = cents(m[currency] + amount);
};

/** The key of what has no truck: the trips, receipts and trip expenses without one. */
export const NO_TRUCK_KEY = 'none:';

/** A toll passage the GPS saw on a trip: its charge is the truck's rate when it passed, in pesos; null without a rate. */
export interface TollPassage {
  id: string;
  tripId: string;
  /** The truck as GPS names it: «plate:abc1234». */
  vehicleKey: string;
  vehicleName: string;
  /** The day it happened, in Uruguay. */
  day: string;
  amount: number | null;
  pointName: string;
}

export type TollRow = Pick<RoadEvent, 'id' | 'trip_id' | 'vehicle_key' | 'vehicle_name' | 'happened_at' | 'amount' | 'point_name'>;

export function tollPassageFromRow(r: TollRow): TollPassage | null {
  const day = calendarDay(r.happened_at);
  if (day === null) return null;
  const amount = r.amount === null ? null : Number(r.amount);
  return { id: r.id, tripId: r.trip_id, vehicleKey: r.vehicle_key, vehicleName: r.vehicle_name, day, amount: amount !== null && Number.isFinite(amount) ? amount : null, pointName: r.point_name };
}

/** What a trip, a truck or the fleet spent: the fuel and the expenses as declared, the tolls as estimated. */
export interface Costs {
  fuel: Money;
  /** Receipts that still have no amount, or are in zero: they add nothing until they are completed in Combustible. */
  fuelMissing: number;
  /** Pesos: the passages with the truck's rate. */
  tolls: number;
  /** Passages that had no rate: they add nothing until it is loaded. */
  tollsWithoutRate: number;
  expenses: Money;
}

const noCosts = (): Costs => ({ fuel: noMoney(), fuelMissing: 0, tolls: 0, tollsWithoutRate: 0, expenses: noMoney() });

/** Billed minus the costs, in each currency. */
export function resultOf(billed: Money, c: Costs): Money {
  return { UYU: cents(billed.UYU - c.fuel.UYU - c.tolls - c.expenses.UYU), USD: cents(billed.USD - c.fuel.USD - c.expenses.USD) };
}

/**
 * What a receipt adds to the fuel; null while its amount is not known: it has none, or it is in zero (the app lets a
 * driver save a 0, and nobody fills a tank for free). Combustible counts only the first kind as «sin importe».
 */
const fuelAmount = (r: Pick<Receipt, 'total'>): number | null => (r.total !== null && r.total > 0 ? r.total : null);

/** The truck's key of a label as the trips and receipts write it; trips without a truck go apart. */
export const truckKeyOf = (label: string | null) => (label ? roadVehicleKey(label) : NO_TRUCK_KEY);

// ---- Each trip ----

export interface TripProfit extends Costs {
  trip: Trip;
  billed: Money;
  result: Money;
  /** Finished with cargo, or typed by hand, and still without its amount: what it left is not known yet. */
  missing: boolean;
}

/** What is needed to tell what each trip left. */
export interface TripCosts {
  receipts: readonly Receipt[];
  passages: readonly TollPassage[];
  expenses: readonly Expense[];
}

/**
 * Each trip with what it billed and what it cost: its fuel receipts, its toll passages and the expenses noted to it,
 * whatever their day. Trips in the trash do not count.
 */
export function tripProfits(trips: readonly Trip[], { receipts, passages, expenses }: TripCosts): TripProfit[] {
  const fuel = new Map<string, Receipt[]>();
  for (const r of receipts) {
    if (r.archived || r.tripId === null) continue;
    fuel.set(r.tripId, [...(fuel.get(r.tripId) ?? []), r]);
  }
  const tolls = new Map<string, TollPassage[]>();
  for (const p of passages) tolls.set(p.tripId, [...(tolls.get(p.tripId) ?? []), p]);
  const spent = new Map<string, Expense[]>();
  for (const e of expenses) {
    if (e.deleted || e.target !== 'trip' || e.tripKey === null) continue;
    spent.set(e.tripKey, [...(spent.get(e.tripKey) ?? []), e]);
  }
  return trips
    .filter((t) => !t.deleted)
    .map((trip) => {
      const billed = noMoney();
      const amount = billedAmount(trip);
      if (amount !== null) addTo(billed, trip.currency, amount);
      const costs = noCosts();
      for (const r of trip.appTripId ? (fuel.get(trip.appTripId) ?? []) : []) {
        const spent = fuelAmount(r);
        if (spent === null) costs.fuelMissing++;
        else addTo(costs.fuel, r.currency, spent);
      }
      for (const p of trip.appTripId ? (tolls.get(trip.appTripId) ?? []) : []) {
        if (p.amount === null) costs.tollsWithoutRate++;
        else costs.tolls = cents(costs.tolls + p.amount);
      }
      for (const e of spent.get(trip.key) ?? []) addTo(costs.expenses, e.currency, e.amount);
      return { trip, billed, ...costs, result: resultOf(billed, costs), missing: missingAmount(trip) };
    });
}

// ---- Each month ----

export interface TruckMonth extends Costs {
  /** «plate:abc1234», or NO_TRUCK_KEY for what has no truck. */
  key: string;
  label: string;
  trips: number;
  /** Trips that still need their amount. */
  missing: number;
  billed: Money;
  result: Money;
}

/** What is spent on no truck: the company's expenses, the drivers' and those of a trailer no truck took that day. */
export interface General {
  company: Money;
  drivers: Money;
  trailers: Money;
}

export interface CompanyMonth {
  /** The first day of the month. */
  month: string;
  /** Each truck that worked or spent something, by name; what has no truck, last. */
  trucks: TruckMonth[];
  /** The trucks added up, with what has no truck. */
  fleet: TruckMonth;
  general: General;
  /** The salary in force that month for each driver, whatever was paid. */
  salaries: Money;
  /** The viáticos paid to the drivers for that month. */
  viaticos: Money;
  /** The fleet's result minus the general expenses, the salaries and the viáticos. */
  result: Money;
}

/** A driver's money, as Choferes keeps it: the salaries, the payments and the day the driver stopped working. */
export interface Payroll {
  leftOn: string | null;
  salaries: readonly Salary[];
  payments: readonly Payment[];
}

export interface ProfitInput extends TripCosts {
  /** Every trip, also the ones of other months: an expense noted to a trip goes with that trip's truck. */
  trips: readonly Trip[];
  hitches: readonly Hitch[];
  payroll: readonly Payroll[];
  /** How the trucks are named now, by key; the others go by the name they were written with. */
  names?: ReadonlyMap<string, string>;
}

/** The truck that took a trailer on a day, by the hitches of Flota; null when none did. */
export function trailerTruck(trailerId: string, day: string, hitches: readonly Hitch[]): string | null {
  const h = hitches.find((x) => !x.deleted && x.trailerId === trailerId && x.fromOn <= day && (x.toOn === null || day <= x.toOn));
  return h ? h.truckKey : null;
}

/** The months up to the one of day, oldest first: count of them. */
export function monthsUpTo(day: string, count: number): string[] {
  const list = [firstOfMonth(day)];
  while (list.length < count) list.unshift(firstOfMonth(addDays(list[0] as string, -1)));
  return list;
}

const sumMoney = (list: readonly Money[]): Money => {
  const out = noMoney();
  for (const m of list) {
    addTo(out, 'UYU', m.UYU);
    addTo(out, 'USD', m.USD);
  }
  return out;
};

const minus = (a: Money, ...rest: Money[]): Money => ({ UYU: cents(rest.reduce((n, m) => n - m.UYU, a.UYU)), USD: cents(rest.reduce((n, m) => n - m.USD, a.USD)) });

/**
 * The company's months as asked, each with its trucks. Each thing counts on its own day: a trip on its departure, a
 * receipt on its day, a toll on the day it was passed and an expense on the day it was spent. An expense noted to a trip
 * goes with that trip's truck, and one of a trailer with the truck that took it that day. With until, what happened after
 * that day does not count (to compare a month going on with the same days of another); salaries and viáticos are of the
 * whole month.
 */
export function monthlyProfit(input: ProfitInput, months: readonly string[], until: ReadonlyMap<string, string> = new Map()): CompanyMonth[] {
  const { trips, receipts, passages, expenses, hitches, payroll, names = new Map<string, string>() } = input;
  const wanted = new Set(months);
  const counts = (day: string | null): day is string => {
    if (day === null) return false;
    const month = firstOfMonth(day);
    const last = until.get(month);
    return wanted.has(month) && (last === undefined || day <= last);
  };
  const trucks = new Map<string, Map<string, TruckMonth>>();
  const general = new Map<string, General>(months.map((m) => [m, { company: noMoney(), drivers: noMoney(), trailers: noMoney() }]));
  const truck = (day: string, key: string, label: string | null): TruckMonth => {
    const month = firstOfMonth(day);
    const byKey = trucks.get(month) ?? new Map<string, TruckMonth>();
    trucks.set(month, byKey);
    let t = byKey.get(key);
    if (!t) {
      t = { key, label: key === NO_TRUCK_KEY ? NO_TRUCK : (names.get(key) ?? label ?? key), trips: 0, missing: 0, billed: noMoney(), result: noMoney(), ...noCosts() };
      byKey.set(key, t);
    }
    return t;
  };

  const byTripKey = new Map(trips.map((t) => [t.key, t]));
  for (const t of trips) {
    const day = tripDay(t);
    if (t.deleted || !counts(day)) continue;
    const row = truck(day, truckKeyOf(t.vehicle), t.vehicle);
    row.trips++;
    const amount = billedAmount(t);
    if (amount !== null) addTo(row.billed, t.currency, amount);
    if (missingAmount(t)) row.missing++;
  }
  for (const r of receipts) {
    if (r.archived || !counts(r.date)) continue;
    const row = truck(r.date, truckKeyOf(r.vehicle), r.vehicle);
    // A receipt without its amount adds nothing, and the page says so.
    const spent = fuelAmount(r);
    if (spent === null) row.fuelMissing++;
    else addTo(row.fuel, r.currency, spent);
  }
  for (const p of passages) {
    if (!counts(p.day)) continue;
    const row = truck(p.day, p.vehicleKey, p.vehicleName);
    if (p.amount === null) row.tollsWithoutRate++;
    else row.tolls = cents(row.tolls + p.amount);
  }
  for (const e of expenses) {
    if (e.deleted || !counts(e.spentOn)) continue;
    const g = general.get(firstOfMonth(e.spentOn)) as General;
    if (e.target === 'truck') addTo(truck(e.spentOn, e.vehicleKey ?? NO_TRUCK_KEY, e.targetName || null).expenses, e.currency, e.amount);
    else if (e.target === 'trip') {
      const trip = e.tripKey === null ? undefined : byTripKey.get(e.tripKey);
      addTo(truck(e.spentOn, truckKeyOf(trip?.vehicle ?? null), trip?.vehicle ?? null).expenses, e.currency, e.amount);
    } else if (e.target === 'trailer') {
      const key = e.trailerId === null ? null : trailerTruck(e.trailerId, e.spentOn, hitches);
      if (key === null) addTo(g.trailers, e.currency, e.amount);
      else addTo(truck(e.spentOn, key, null).expenses, e.currency, e.amount);
    } else if (e.target === 'driver') addTo(g.drivers, e.currency, e.amount);
    else addTo(g.company, e.currency, e.amount);
  }

  return months.map((month) => {
    const list = [...(trucks.get(month)?.values() ?? [])].map((t) => ({ ...t, result: resultOf(t.billed, t) }));
    list.sort((a, b) => Number(a.key === NO_TRUCK_KEY) - Number(b.key === NO_TRUCK_KEY) || a.label.localeCompare(b.label, 'es'));
    const fleet: TruckMonth = {
      key: 'fleet:',
      label: 'Toda la flota',
      trips: list.reduce((n, t) => n + t.trips, 0),
      missing: list.reduce((n, t) => n + t.missing, 0),
      billed: sumMoney(list.map((t) => t.billed)),
      fuel: sumMoney(list.map((t) => t.fuel)),
      fuelMissing: list.reduce((n, t) => n + t.fuelMissing, 0),
      tolls: cents(list.reduce((n, t) => n + t.tolls, 0)),
      tollsWithoutRate: list.reduce((n, t) => n + t.tollsWithoutRate, 0),
      expenses: sumMoney(list.map((t) => t.expenses)),
      result: noMoney(),
    };
    fleet.result = resultOf(fleet.billed, fleet);
    const salaries = noMoney();
    const viaticos = noMoney();
    for (const p of payroll) {
      // A driver who stopped working has no salary after that month, as in Choferes.
      const gone = p.leftOn !== null && month > firstOfMonth(p.leftOn);
      const s = gone ? null : salaryFor(p.salaries, month);
      if (s) addTo(salaries, s.currency, s.amount);
      for (const pay of p.payments) if (!pay.deleted && pay.concept === 'viatico' && pay.period === month) addTo(viaticos, pay.currency, pay.amount);
    }
    const g = general.get(month) as General;
    return { month, trucks: list, fleet, general: g, salaries, viaticos, result: minus(fleet.result, g.company, g.drivers, g.trailers, salaries, viaticos) };
  });
}

/** The general expenses added up. */
export const generalTotal = (g: General): Money => sumMoney([g.company, g.drivers, g.trailers]);

/** All the costs of a month: the fleet's, the general ones, the salaries and the viáticos. */
export function monthCosts(m: CompanyMonth): Money {
  const fleetCosts: Money = { UYU: cents(m.fleet.fuel.UYU + m.fleet.tolls + m.fleet.expenses.UYU), USD: cents(m.fleet.fuel.USD + m.fleet.expenses.USD) };
  return sumMoney([fleetCosts, generalTotal(m.general), m.salaries, m.viaticos]);
}
