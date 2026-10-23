import { ago } from '../lib/dates';
import type { DriverPresence } from '../lib/presence';

const version = (p: DriverPresence) => (p.version ? `app ${p.version}${p.newer ? ` (hay una más nueva: ${p.newer})` : ''}` : 'app anterior a la 0.17.0');

/** What a list says of a driver: on a trip, active and since when, or when the app was last open. */
export function presenceLine(p: DriverPresence, now: number): string {
  if (p.state === 'trip') return ['En viaje', version(p)].join(' · ');
  if (p.state === 'active')
    return [`Activo ${ago(p.seenAt, now)}`, 'sin viaje', p.place ? null : 'sin posición', version(p)].filter(Boolean).join(' · ');
  return [`Abrió la app ${ago(p.seenAt, now)}`, version(p)].join(' · ');
}

/** The same line after a pill that already says the state: «app 0.19.0», «hace 3 min · sin viaje · app 0.19.0». */
export function presenceDetail(p: DriverPresence, now: number): string {
  if (p.state === 'trip') return version(p);
  if (p.state === 'active') return [ago(p.seenAt, now), 'sin viaje', version(p)].join(' · ');
  return [`abrió la app ${ago(p.seenAt, now)}`, version(p)].join(' · ');
}
