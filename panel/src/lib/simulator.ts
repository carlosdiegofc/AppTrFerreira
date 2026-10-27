// The freight simulator (decisions of 26/10/2026 and 27/10/2026): with the kilometres with cargo and back, the truck's
// consumption, the price of diesel, the route's tolls and what the driver is paid for the trip, what a freight costs
// and what to charge for it. The margin is added to the cost: the price is the cost plus that share of it. Nothing else
// goes per kilometre. It only calculates: no quote is saved. Pesos. Pure functions.
import { checkNumber } from './fuelForm';
import type { Receipt } from './fuel';

export interface SimulatorValues {
  loadedKm: string;
  returnKm: string;
  /** Kilometres per litre, as Combustible shows a truck's consumption. */
  kmPerLiter: string;
  /** Pesos per litre. */
  dieselPrice: string;
  /** Pesos: the tolls of the whole trip, there and back. */
  tolls: string;
  /** Pesos: what the driver is paid for this trip. */
  driverPay: string;
  /** Percent of the cost. */
  margin: string;
}

export type SimulatorField = keyof SimulatorValues;

export const EMPTY_SIMULATOR: SimulatorValues = { loadedKm: '', returnKm: '', kmPerLiter: '', dieselPrice: '', tolls: '', driverPay: '', margin: '' };

export const SIMULATOR_LIMITS = { km: 20_000, kmPerLiter: 50, dieselPrice: 1_000, money: 100_000_000, margin: 1_000 } as const;

export interface Quote {
  loadedKm: number;
  returnKm: number;
  liters: number;
  fuel: number;
  tolls: number;
  driverPay: number;
  cost: number;
  margin: number;
  /** What the margin adds: the profit of the freight at that price. */
  profit: number;
  price: number;
  /** The price over the kilometres with cargo, as freights are often quoted; null without them. */
  pricePerLoadedKm: number | null;
  /** The cost over all the kilometres, there and back. */
  costPerKm: number;
}

/** Cents, so the sums do not drift. */
const cents = (n: number) => Math.round(n * 100) / 100;

/** The cost and the price of a freight, or what has to be fixed in the form. */
export function simulate(v: SimulatorValues): { quote: Quote | null; errors: Partial<Record<SimulatorField, string>> } {
  const errors: Partial<Record<SimulatorField, string>> = {};
  const read = (field: SimulatorField, max: number) => {
    const r = checkNumber(v[field], max);
    if (r.error) errors[field] = r.error;
    return r.value;
  };
  const loadedKm = read('loadedKm', SIMULATOR_LIMITS.km) ?? 0;
  const returnKm = read('returnKm', SIMULATOR_LIMITS.km) ?? 0;
  const kmPerLiter = read('kmPerLiter', SIMULATOR_LIMITS.kmPerLiter);
  const dieselPrice = read('dieselPrice', SIMULATOR_LIMITS.dieselPrice);
  const tolls = read('tolls', SIMULATOR_LIMITS.money) ?? 0;
  const driverPay = read('driverPay', SIMULATOR_LIMITS.money) ?? 0;
  const margin = read('margin', SIMULATOR_LIMITS.margin) ?? 0;
  if (!errors.loadedKm && !errors.returnKm && loadedKm + returnKm === 0) errors.loadedKm = 'Escribí los kilómetros del viaje.';
  if (!errors.kmPerLiter && !kmPerLiter) errors.kmPerLiter = 'Escribí cuántos kilómetros hace por litro.';
  if (!errors.dieselPrice && !dieselPrice) errors.dieselPrice = 'Escribí el precio del litro de gasoil.';
  if (Object.keys(errors).length > 0 || !kmPerLiter || !dieselPrice) return { quote: null, errors };
  const km = loadedKm + returnKm;
  const liters = km / kmPerLiter;
  const fuel = cents(liters * dieselPrice);
  const cost = cents(fuel + tolls + driverPay);
  const profit = cents((cost * margin) / 100);
  const price = cents(cost + profit);
  return {
    quote: { loadedKm, returnKm, liters, fuel, tolls, driverPay, cost, margin, profit, price, pricePerLoadedKm: loadedKm > 0 ? price / loadedKm : null, costPerKm: cost / km },
    errors,
  };
}

/** A price of diesel to start from: the pesos per litre of the last receipt in pesos with litres and amount. */
export function lastDieselPrice(receipts: readonly Receipt[]): { price: number; date: string; station: string | null } | null {
  let found: Receipt | null = null;
  for (const r of receipts) {
    if (r.archived || r.currency !== 'UYU' || !r.liters || !r.total || r.date === null) continue;
    if (!found || r.date > (found.date as string) || (r.date === found.date && (r.recordedAt ?? '') > (found.recordedAt ?? ''))) found = r;
  }
  return found ? { price: cents((found.total as number) / (found.liters as number)), date: found.date as string, station: found.station } : null;
}
