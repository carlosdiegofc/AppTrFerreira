import { type CatalogTruck, canonical } from './fleet';

export interface MonthTotals {
  trips: number;
  meters: number;
  /** Share of the GPS kilometres driven with cargo, from 0 to 1; null without kilometres. */
  loadedShare: number | null;
  /** Trucks that made at least one trip. */
  trucks: number;
}

/** Month figures for the start screen, from the app trips of the month (already without the deleted ones). */
export function monthTotals(trips: readonly { distance_meters: number; load_type: string; vehicle: string }[], catalog: readonly CatalogTruck[]): MonthTotals {
  let meters = 0;
  let loaded = 0;
  const trucks = new Set<string>();
  for (const t of trips) {
    const m = Number.isFinite(t.distance_meters) ? Math.max(0, t.distance_meters) : 0;
    meters += m;
    if (t.load_type !== 'empty') loaded += m;
    const label = canonical(t.vehicle, catalog);
    if (label !== null) trucks.add(label);
  }
  return { trips: trips.length, meters, loadedShare: meters > 0 ? loaded / meters : null, trucks: trucks.size };
}
