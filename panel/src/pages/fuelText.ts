// How Combustible and a station's page say amounts and balances.
import { money } from '../lib/format';
import type { Account } from '../lib/fuel';
import type { Tone } from '../components/ui';

/** Pesos and dollars, each on its own and never added together: ["$ 41.000", "US$ 310"]. */
export function amountParts(a: { UYU: number; USD: number }, empty = '—'): string[] {
  const parts = [a.UYU !== 0 ? money(a.UYU, 'UYU') : null, a.USD !== 0 ? money(a.USD, 'USD') : null].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts : [empty];
}

/** The same in one line: "$ 41.000 · US$ 310". */
export const amounts = (a: { UYU: number; USD: number }, empty = '—') => amountParts(a, empty).join(' · ');

/** A station's balance in one currency, in the office's words. */
export function balanceText(a: Account): string {
  if (a.balance === 0) return `Al día en ${a.currency === 'USD' ? 'dólares' : 'pesos'}`;
  return a.balance > 0 ? `Se le debe ${money(a.balance, a.currency)}` : `A favor ${money(-a.balance, a.currency)}`;
}

export const balanceTone = (a: Account): Tone => (a.balance > 0 ? 'amber' : a.balance < 0 ? 'green' : 'grey');

/** The address of a station's page. */
export const stationPath = (key: string) => `/combustible/estaciones/${encodeURIComponent(key)}`;
