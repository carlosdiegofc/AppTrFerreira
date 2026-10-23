// «Chofer activo» (decision of 18/10/2026): while the app is open, each phone says so when it starts and every 5
// minutes, with the app version and, without a trip, where it is. With the app closed nothing is sent. Pure functions:
// no network, no React.
import { text } from './fleet';
import { validPosition } from './route';

/** A row of trf_driver_presence, one per driver. */
export interface PresenceRow {
  driver_id: string;
  driver_name: string;
  vehicle: string | null;
  app_version: string;
  /** Server time of the last notice. */
  seen_at: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  located_at: string | null;
}

/** The phone says it is open every 5 minutes: a driver seen in the last 10 counts as active. */
export const ACTIVE_FOR_MS = 10 * 60_000;
/** How far ahead of the server a phone clock may be for its position to count. */
const CLOCK_SLACK_MS = 2 * 60_000;

/** On a trip (the trip says so), active with the app open, or only seen some time ago. */
export type PresenceState = 'trip' | 'active' | 'seen';

export interface DriverPresence {
  driverId: string;
  name: string;
  /** The truck the phone has saved for the driver. */
  vehicle: string | null;
  /** null: the phone does not say it (a version before 0.17.0, on a trip). */
  version: string | null;
  /** A newer version some other phone of the fleet already has, when this one is older. */
  newer: string | null;
  seenAt: number;
  state: PresenceState;
  /** Where the phone is with the app open and no trip, while it is active and the position is recent. */
  place: { lat: number; lng: number; at: number; accuracy: number | null } | null;
}

/** Compares versions like 0.16.3 and 0.17.0 part by part; a part that is not a number counts as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((p) => Number.parseInt(p, 10) || 0);
  const pb = b.split('.').map((p) => Number.parseInt(p, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const ORDER: Record<PresenceState, number> = { trip: 0, active: 1, seen: 2 };

/**
 * Every driver who has the app (version 0.17.0 or later; older versions do not say it), newest notice first within
 * each state: on a trip, active, seen. `onTrip` holds the drivers with a trip in progress.
 */
export function driverPresence(rows: readonly PresenceRow[], onTrip: ReadonlySet<string>, now: number): DriverPresence[] {
  const newest = rows.map((r) => r.app_version.trim()).reduce<string | null>((best, v) => (best === null || compareVersions(v, best) > 0 ? v : best), null);
  return rows
    .map((r): DriverPresence => {
      const seenAt = Date.parse(r.seen_at);
      const fresh = (ms: number) => Number.isFinite(ms) && now - ms < ACTIVE_FOR_MS;
      const state: PresenceState = onTrip.has(r.driver_id) ? 'trip' : fresh(seenAt) ? 'active' : 'seen';
      const located = r.located_at ? Date.parse(r.located_at) : Number.NaN;
      // The position's time is the phone's; it is checked against the notice's, which is the server's: taken in the
      // 10 minutes before it (a notice without a fix leaves the last one, which ages) and not after it, give or take
      // a phone clock off by up to 2 minutes.
      const locatedFresh = Number.isFinite(located) && seenAt - located < ACTIVE_FOR_MS && located - seenAt <= CLOCK_SLACK_MS;
      const version = r.app_version.trim();
      return {
        driverId: r.driver_id,
        name: text(r.driver_name) ?? 'Chofer',
        vehicle: text(r.vehicle),
        version,
        newer: newest !== null && compareVersions(newest, version) > 0 ? newest : null,
        seenAt,
        state,
        place:
          state === 'active' && locatedFresh && validPosition(r.latitude, r.longitude)
            ? { lat: r.latitude as number, lng: r.longitude as number, at: located, accuracy: r.accuracy_m }
            : null,
      };
    })
    .sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.seenAt - a.seenAt || a.name.localeCompare(b.name, 'es'));
}

export const PRESENCE_LABEL: Record<PresenceState, string> = { trip: 'En viaje', active: 'Activo', seen: 'Sin la app abierta' };

/**
 * The drivers as the lists of drivers show them: driverPresence, plus the drivers on a trip whose phone does not send the
 * notice (versions before 0.17.0), on their trip with what it says and without a version.
 */
export function withTripDrivers(present: readonly DriverPresence[], active: readonly { driver_id: string; driver_name: string | null; vehicle: string | null; started_at: string }[]): DriverPresence[] {
  const known = new Set(present.map((p) => p.driverId));
  const added = new Map<string, DriverPresence>();
  for (const t of active) {
    if (known.has(t.driver_id) || added.has(t.driver_id)) continue;
    added.set(t.driver_id, { driverId: t.driver_id, name: text(t.driver_name) ?? 'Chofer', vehicle: text(t.vehicle), version: null, newer: null, seenAt: Date.parse(t.started_at), state: 'trip', place: null });
  }
  return [...present, ...added.values()].sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.seenAt - a.seenAt || a.name.localeCompare(b.name, 'es'));
}
