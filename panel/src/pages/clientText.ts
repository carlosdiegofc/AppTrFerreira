// How Cobros and a client's page say balances, trips and collections.
import type { Tone } from '../components/ui';
import { DataError, TOO_MANY } from '../data/api';
import type { ClientAccount, ClientMovement } from '../lib/clients';
import { money } from '../lib/format';
import { PAYMENT_METHODS } from '../lib/fuel';
import type { Trip } from '../lib/trips';

/** A client's balance in one currency, in the office's words. */
export function clientBalanceText(a: Pick<ClientAccount, 'balance' | 'currency'>): string {
  if (a.balance === 0) return `Al día en ${a.currency === 'USD' ? 'dólares' : 'pesos'}`;
  return a.balance > 0 ? `Nos debe ${money(a.balance, a.currency)}` : `A favor del cliente ${money(-a.balance, a.currency)}`;
}

export const clientBalanceTone = (a: Pick<ClientAccount, 'balance'>): Tone => (a.balance > 0 ? 'amber' : a.balance < 0 ? 'blue' : 'grey');

/** The address of a client's page. */
export const clientPath = (key: string) => `/finanzas/cobros/${encodeURIComponent(key)}`;

/** Why the accounts could not be read, in the office's words. */
export const clientsReadError = (e: unknown) =>
  e instanceof DataError && e.code === TOO_MANY
    ? 'Hay demasiados viajes o cobros para leerlos todos de una vez, y una cuenta con una parte daría mal. Avisá para pasar las cuentas a la base.'
    : 'No se pudieron leer las cuentas de los clientes.';

/** How a collection was made: «Transferencia», «Cheque»… */
export const methodText = (m: Pick<ClientMovement, 'method'>) => PAYMENT_METHODS.find((p) => p.value === m.method)?.label ?? 'Cobro';

/** A trip as a statement names it: «Viaje · orden 24129 · Paysandú → Salto · Trigo · Ford Cargo 1722 · JKL3456». */
export function tripConcept(t: Pick<Trip, 'orderNumber' | 'originName' | 'destinationName' | 'product' | 'vehicle'>): string {
  const route = t.originName && t.destinationName ? `${t.originName} → ${t.destinationName}` : t.destinationName ? `a ${t.destinationName}` : t.originName ? `desde ${t.originName}` : null;
  return ['Viaje', t.orderNumber ? `orden ${t.orderNumber}` : null, route, t.product, t.vehicle].filter(Boolean).join(' · ');
}
