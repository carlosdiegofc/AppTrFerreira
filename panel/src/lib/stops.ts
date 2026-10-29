// The stops of a trip with several unloadings (app 0.27.0, migration 0014): which state each is in, how long the
// unloading took, and the kilometres between one stop and the next, from the GPS route.
import { metersBetween, type Reading, routeLink } from './route';

export interface Stop {
  id: string;
  position: number;
  client: string;
  place: string;
  arrived_at: string | null;
  arrived_lat: number | null;
  arrived_lng: number | null;
  finished_at: string | null;
  finished_by: string | null;
  kg: number | null;
}

export type StopState = 'waiting' | 'unloading' | 'done';

export const stopState = (s: Pick<Stop, 'arrived_at' | 'finished_at'>): StopState => (s.arrived_at === null ? 'waiting' : s.finished_at === null ? 'unloading' : 'done');

export const STOP_STATE_LABEL: Record<StopState, string> = { waiting: 'Por llegar', unloading: 'Descargando', done: 'Descargó' };

/** «Molino San José · San José», or what there is of the two. */
export function stopTitle(s: Pick<Stop, 'client' | 'place' | 'position'>): string {
  return [s.client, s.place].filter((t) => t.trim() !== '').join(' · ') || `Parada ${s.position}`;
}

/** How long the unloading took, or has taken so far, in milliseconds; null while the truck has not arrived. */
export function unloadMs(s: Pick<Stop, 'arrived_at' | 'finished_at'>, now: number): number | null {
  if (s.arrived_at === null) return null;
  const from = Date.parse(s.arrived_at);
  const to = s.finished_at === null ? now : Date.parse(s.finished_at);
  return Number.isFinite(from) && Number.isFinite(to) ? Math.max(0, to - from) : null;
}

/** The order of the trip: by position, then by when it was added. */
export const inOrder = <T extends Pick<Stop, 'position'>>(stops: readonly T[]): T[] => [...stops].sort((a, b) => a.position - b.position);

export interface Leg {
  /** Where the leg starts and ends: «Salida», the title of a stop or «Llegada». */
  from: string;
  to: string;
  meters: number;
}

/**
 * The kilometres of each leg of the trip: from the start to the first arrival, from the end of one unloading to the
 * next arrival, and from the last unloading to the end of the trip. Only what the route counts (a pause, or a cut the app
 * left unfilled, adds nothing). A stop the truck has not reached yet does not cut a leg; the trip in progress ends at its
 * last reading.
 */
export function legs(route: readonly Reading[], stops: readonly Stop[], tripStart: string, tripEnd: string | null): Leg[] {
  const ordered = inOrder(stops).filter((s) => s.arrived_at !== null);
  if (ordered.length === 0 || route.length < 2) return [];
  const read = [...route].sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
  const meters = (from: number, to: number) => {
    let sum = 0;
    for (let i = 1; i < read.length; i++) {
      const a = read[i - 1] as Reading;
      const b = read[i] as Reading;
      const at = Date.parse(b.recorded_at);
      if (at <= from || at > to) continue;
      if (routeLink(a, b) !== 'none') sum += metersBetween(a, b);
    }
    return sum;
  };
  const end = tripEnd !== null ? Date.parse(tripEnd) : Date.parse((read.at(-1) as Reading).recorded_at);
  const out: Leg[] = [];
  let from = Date.parse(tripStart);
  let name = 'Salida';
  for (const s of ordered) {
    const arrived = Date.parse(s.arrived_at as string);
    out.push({ from: name, to: stopTitle(s), meters: meters(from, arrived) });
    // While it is still being unloaded the leg after it has not started.
    if (s.finished_at === null) return out;
    from = Date.parse(s.finished_at);
    name = stopTitle(s);
  }
  out.push({ from: name, to: 'Llegada', meters: meters(from, end) });
  return out;
}
