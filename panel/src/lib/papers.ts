// Due dates of truck services and expiry of papers, with the thresholds of the Android app, and services due by
// kilometres against the estimate of each truck (see maintenance.ts).
import { daysBetween, formatDay, inDays } from './dates';
import { number } from './format';

/** A paper shows as about to expire this many days before. */
export const PAPER_SOON_DAYS = 30;
/** A pending service shows as coming up this many days before. */
export const SERVICE_SOON_DAYS = 15;
/** A service due by kilometres shows as coming up when the truck is estimated this close. */
export const SERVICE_SOON_KM = 1000;

export type PaperState = 'nodate' | 'late' | 'soon' | 'ok';
export type ServiceState = 'done' | 'pending' | 'late' | 'soon' | 'planned';
/** By kilometres: unknown when the truck has no kilometres to estimate from. */
export type KmState = 'late' | 'soon' | 'planned' | 'unknown';

const day = (v: string | null | undefined) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

export function paperState(expiresOn: string | null | undefined, today: string): PaperState {
  const exp = day(expiresOn);
  if (exp === null) return 'nodate';
  const n = daysBetween(today, exp);
  if (n < 0) return 'late';
  return n <= PAPER_SOON_DAYS ? 'soon' : 'ok';
}

export function serviceState(dueOn: string | null | undefined, doneOn: string | null | undefined, today: string): ServiceState {
  if (day(doneOn) !== null) return 'done';
  const due = day(dueOn);
  if (due === null) return 'pending';
  const n = daysBetween(today, due);
  if (n < 0) return 'late';
  return n <= SERVICE_SOON_DAYS ? 'soon' : 'planned';
}

/** A service due at dueKm, against the truck's estimated kilometres; null when it is not due by kilometres. */
export function kmState(dueKm: number | null | undefined, estimate: number | null | undefined): KmState | null {
  if (dueKm === null || dueKm === undefined) return null;
  if (estimate === null || estimate === undefined) return 'unknown';
  const left = dueKm - estimate;
  if (left <= 0) return 'late';
  return left <= SERVICE_SOON_KM ? 'soon' : 'planned';
}

export interface PaperRow {
  id: string;
  scope: string;
  driver_name: string;
  vehicle: string;
  kind: string;
  expires_on: string | null;
}

export interface ServiceRow {
  id: string;
  vehicle: string;
  kind: string;
  due_on: string | null;
  done_on: string | null;
  due_km?: number | null;
}

export interface ServiceStatus {
  /** The worse of the two: by date and by kilometres. */
  state: ServiceState;
  /** "Era para el 13/10/2026", "25/10/2026 · en 7 días", "Para el 12/12/2026", "Hecho el 02/10/2026"; null without a date. */
  byDate: string | null;
  dateState: ServiceState;
  /** "A los 412.500 km · faltan unos 405 km"; null when it is not due by kilometres. */
  byKm: string | null;
  kmState: KmState | null;
}

const RANK: Record<Exclude<ServiceState, 'done'>, number> = { pending: 0, planned: 1, soon: 2, late: 3 };

/** What a service shows: its state, by date and by kilometres, with estimate the truck's estimated kilometres. */
export function serviceStatus(s: Pick<ServiceRow, 'due_on' | 'done_on' | 'due_km'>, today: string, estimate: number | null): ServiceStatus {
  const dateState = serviceState(s.due_on, s.done_on, today);
  const done = day(s.done_on);
  const due = day(s.due_on);
  if (dateState === 'done') return { state: 'done', byDate: `Hecho el ${formatDay(done as string)}`, dateState, byKm: null, kmState: null };
  const byDate =
    due === null ? null : dateState === 'late' ? `Era para el ${formatDay(due)}` : dateState === 'soon' ? `${formatDay(due)} · ${inDays(due, today)}` : `Para el ${formatDay(due)}`;
  const dueKm = s.due_km ?? null;
  const km = kmState(dueKm, estimate);
  let byKm: string | null = null;
  if (dueKm !== null && km !== null) {
    const at = `${number(dueKm)} km`;
    const left = estimate === null ? 0 : dueKm - estimate;
    byKm =
      km === 'unknown'
        ? `A los ${at} · sin kilometraje para estimar cuánto falta`
        : km === 'late'
          ? `Era a los ${at} · ${left === 0 ? 'ya llegó' : `se pasó unos ${number(-left)} km`}`
          : `A los ${at} · faltan unos ${number(left)} km`;
  }
  const kmRank = km === null || km === 'unknown' ? 0 : RANK[km];
  const state = due === null && km === null ? 'pending' : kmRank > RANK[dateState] ? (km as Exclude<KmState, 'unknown'>) : dateState;
  return { state, byDate: byDate ?? (km === null ? 'Sin fecha prevista' : null), dateState, byKm, kmState: km };
}

export interface Alert {
  id: string;
  type: 'paper' | 'service';
  state: 'late' | 'soon';
  /** What it is: "Licencia de conducir", "Cambio de aceite". */
  kind: string;
  /** Whose it is: the driver or the truck. */
  owner: string;
  /** Date that decides the order: by kilometres, today. */
  date: string;
  detail: string;
}

const plateOrModel = (vehicle: string) => {
  const cut = vehicle.indexOf(' · ');
  return cut < 0 ? vehicle.trim() : vehicle.slice(cut + 3).trim();
};

/**
 * Papers and services that are late or coming up, earliest first: what the start screen asks to keep in mind. A service
 * due by kilometres counts with the estimate of its truck (estimateOf); without it, only by date.
 */
export function alerts(papers: readonly PaperRow[], services: readonly ServiceRow[], today: string, estimateOf: (vehicle: string) => number | null = () => null): Alert[] {
  const out: Alert[] = [];
  for (const p of papers) {
    const state = paperState(p.expires_on, today);
    const exp = day(p.expires_on);
    if ((state !== 'late' && state !== 'soon') || exp === null) continue;
    out.push({
      id: 'paper:' + p.id,
      type: 'paper',
      state,
      kind: p.kind,
      owner: p.scope === 'driver' ? p.driver_name.trim() : plateOrModel(p.vehicle),
      date: exp,
      detail: state === 'late' ? `Venció el ${formatDay(exp)}` : `Vence el ${formatDay(exp)} · ${inDays(exp, today)}`,
    });
  }
  for (const s of services) {
    const status = serviceStatus(s, today, estimateOf(s.vehicle));
    const { state } = status;
    if (state !== 'late' && state !== 'soon') continue;
    // What makes it late or coming up: the date, the kilometres, or both.
    const byDate = status.dateState === state ? status.byDate : null;
    const byKm = status.kmState === state ? status.byKm : null;
    const due = day(s.due_on);
    out.push({
      id: 'service:' + s.id,
      type: 'service',
      state,
      kind: s.kind,
      owner: plateOrModel(s.vehicle),
      date: byDate !== null && due !== null ? due : today,
      detail: [byDate, byKm].filter((t): t is string => t !== null).join(' · '),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind, 'es'));
}
