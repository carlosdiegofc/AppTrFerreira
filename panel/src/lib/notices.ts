// What else the bell says (decision of 28/10/2026), besides papers, services and trucks low on fuel: trips that look
// left open, receipts without an amount or litres, trips with cargo the office has not billed yet, and drivers with an
// older app than the rest. Pure functions: no network, no React.
import { missingAmount } from './clients';
import { addDays } from './dates';
import type { Receipt } from './fuel';
import type { DriverPresence } from './presence';
import type { Trip } from './trips';

/** A trip this long in progress looks left open; the app asks its driver the same (Notices.kt). */
export const TRIP_LONG_HOURS = 14;
/** The receipts the bell looks at: the last days, so a gap left long ago does not stay forever. */
export const RECEIPT_DAYS = 30;
/** The trips whose amount the bell looks for: the ones that started in the last days. */
export const UNBILLED_DAYS = 60;
/** A driver seen in the last days with an older app than another phone of the fleet is told to update it. */
export const OLD_APP_DAYS = 30;

export interface LongTrip {
  id: string;
  driver: string;
  vehicle: string;
  /** Whole hours in progress. */
  hours: number;
}

/** The trips in progress for 14 hours or more, the longest first. */
export function longTrips(active: readonly { id: string; driver_name: string; vehicle: string; started_at: string }[], now: number): LongTrip[] {
  return active
    .flatMap((t) => {
      const started = Date.parse(t.started_at);
      const hours = Math.floor((now - started) / 3_600_000);
      return Number.isFinite(started) && hours >= TRIP_LONG_HOURS ? [{ id: t.id, driver: t.driver_name.trim(), vehicle: t.vehicle.trim(), hours }] : [];
    })
    .sort((a, b) => b.hours - a.hours);
}

/**
 * The receipts of the last 30 days, out of the trash, without an amount or without litres (empty or in zero), as the
 * office left them: what Combustible needs completed.
 */
export function receiptsMissing(receipts: readonly Receipt[], today: string): Receipt[] {
  const from = addDays(today, -RECEIPT_DAYS);
  const gap = (n: number | null) => n === null || n === 0;
  return receipts.filter((r) => !r.archived && r.date !== null && r.date >= from && r.date <= today && (gap(r.total) || gap(r.liters)));
}

/** The trips of the period whose amount the office has to complete, by the rule of Cobros (missingAmount). */
export const unbilledTrips = (trips: readonly Trip[]) => trips.filter(missingAmount);

/** The drivers seen in the last 30 days whose app is older than the newest one in the fleet. */
export function oldApps(drivers: readonly DriverPresence[], now: number): DriverPresence[] {
  return drivers.filter((d) => d.newer !== null && Number.isFinite(d.seenAt) && now - d.seenAt <= OLD_APP_DAYS * 86_400_000);
}
