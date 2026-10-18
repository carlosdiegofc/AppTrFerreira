// Due dates of truck services and expiry of papers, with the thresholds of the Android app.
import { daysBetween, formatDay, inDays } from './dates';

/** A paper shows as about to expire this many days before. */
export const PAPER_SOON_DAYS = 30;
/** A pending service shows as coming up this many days before. */
export const SERVICE_SOON_DAYS = 15;

export type PaperState = 'nodate' | 'late' | 'soon' | 'ok';
export type ServiceState = 'done' | 'pending' | 'late' | 'soon' | 'planned';

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
}

export interface Alert {
  id: string;
  type: 'paper' | 'service';
  state: 'late' | 'soon';
  /** What it is: "Licencia de conducir", "Cambio de aceite". */
  kind: string;
  /** Whose it is: the driver or the truck. */
  owner: string;
  /** Date that decides the order. */
  date: string;
  detail: string;
}

const plateOrModel = (vehicle: string) => {
  const cut = vehicle.indexOf(' · ');
  return cut < 0 ? vehicle.trim() : vehicle.slice(cut + 3).trim();
};

/** Papers and services that are late or coming up, earliest first: what the start screen asks to keep in mind. */
export function alerts(papers: readonly PaperRow[], services: readonly ServiceRow[], today: string): Alert[] {
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
    const state = serviceState(s.due_on, s.done_on, today);
    const due = day(s.due_on);
    if ((state !== 'late' && state !== 'soon') || due === null) continue;
    out.push({
      id: 'service:' + s.id,
      type: 'service',
      state,
      kind: s.kind,
      owner: plateOrModel(s.vehicle),
      date: due,
      detail: state === 'late' ? `Era para el ${formatDay(due)}` : `${formatDay(due)} · ${inDays(due, today)}`,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind, 'es'));
}
