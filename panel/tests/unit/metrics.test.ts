import { describe, expect, it } from 'vitest';
import type { Receipt } from '../../src/lib/fuel';
import { billingByMonth, fuelInPeriod, idleTrucks, kmByDay, litersPer100, loadedShare, monthsBefore, niceTicks, NO_DRIVER, NO_TRUCK, sortRows, summarize } from '../../src/lib/metrics';
import type { Trip } from '../../src/lib/trips';

let n = 0;
/** An app trip that started at noon in Uruguay of a day; manual ones have no GPS kilometres. */
function trip(over: Partial<Trip> & { day?: string } = {}): Trip {
  const { day = '2026-10-10', ...rest } = over;
  n++;
  return {
    key: 'app:' + n,
    source: 'app',
    appTripId: String(n),
    panelId: null,
    deleted: false,
    deletedAt: null,
    active: false,
    paused: false,
    driverId: null,
    driverName: null,
    vehicle: 'A',
    departureAt: `${day}T15:00:00Z`,
    arrivalAt: null,
    gpsKm: 0,
    loadType: 'loaded',
    orderNumber: null,
    client: null,
    product: null,
    originName: null,
    origin: null,
    gpsStart: null,
    destinationName: null,
    destination: null,
    gpsEnd: null,
    billableKm: null,
    kg: null,
    amount: null,
    currency: 'UYU',
    notes: null,
    updatedAt: null,
    status: { code: 'complete', label: 'Completo', missing: [] },
    ...rest,
  };
}
const manual = (over: Partial<Trip> & { day?: string } = {}) => trip({ source: 'manual', gpsKm: null, loadType: null, ...over });

function receipt(over: Partial<Receipt> = {}): Receipt {
  n++;
  return {
    id: 'r' + n,
    tripId: null,
    driverId: 'd',
    driverName: null,
    recordedAt: '2026-10-10T15:00:00Z',
    date: '2026-10-10',
    vehicle: 'A',
    stationKey: 'id:1',
    station: null,
    liters: null,
    total: null,
    currency: 'UYU',
    objectPath: null,
    archived: false,
    updatedAt: null,
    declared: { date: '2026-10-10', vehicle: 'A', stationId: '1', station: null, liters: null, total: null },
    panelData: {},
    ...over,
  };
}

// The same cases as the app's FleetStatsTest, so the panel and «Rendimiento» add up alike.
describe('the totals of a period, as «Rendimiento» in the app', () => {
  it('per truck, never adding pesos and dollars, and without the trips in the trash', () => {
    const trips = [trip({ gpsKm: 100, billableKm: 110, kg: 1000, amount: 500 }), trip({ gpsKm: 50, amount: 100, currency: 'USD' }), trip({ vehicle: 'B', gpsKm: 999, amount: 1, deleted: true })];
    const s = summarize(trips, [receipt({ liters: 30, total: 300 }), receipt({ vehicle: null, liters: 10, total: 10, currency: 'USD' })], 'vehicle');
    expect(s.rows.map((r) => r.name)).toEqual(['A', NO_TRUCK]);
    expect(s.rows[0]).toMatchObject({ billed: { UYU: 500, USD: 100 }, gpsKm: 150, billableKm: 110, kg: 1000 });
    expect(s.total).toMatchObject({ trips: 2, fuel: { UYU: 300, USD: 10 }, liters: 40 });
  });
  it('the kilometres split with cargo and without; a trip typed by hand has none to split', () => {
    const a = summarize([trip({ gpsKm: 300 }), trip({ gpsKm: 100, loadType: 'empty' }), manual({ billableKm: 250 })], [], 'vehicle').rows[0]!;
    expect(a).toMatchObject({ trips: 3, gpsKm: 400, loadedKm: 300, emptyKm: 100, billableKm: 250 });
    expect(loadedShare(a)).toBe(0.75);
    expect(loadedShare({ loadedKm: 0, emptyKm: 0 })).toBeNull();
  });
  it('the consumption needs 300 km or more, and litres', () => {
    expect(litersPer100(summarize([trip({ gpsKm: 299.9 })], [receipt({ liters: 90, total: 5000 })], 'vehicle').rows[0]!)).toBeNull();
    expect(litersPer100(summarize([trip({ gpsKm: 200 }), trip({ gpsKm: 200 })], [receipt({ liters: 130, total: 7000 })], 'vehicle').rows[0]!)).toBe(32.5);
    expect(litersPer100(summarize([trip({ gpsKm: 900 })], [], 'vehicle').rows[0]!)).toBeNull();
  });
  it('counts the trips with cargo, or typed by hand, that have no amount', () => {
    const a = summarize([trip({ gpsKm: 10, amount: 500 }), trip({ gpsKm: 10 }), trip({ gpsKm: 10, loadType: 'empty' }), manual()], [], 'vehicle').rows[0]!;
    expect(a.unbilled).toBe(2);
    expect(a.billed.UYU).toBe(500);
  });
  it('the same trips per driver, with the receipts of whoever loaded them', () => {
    const trips = [trip({ gpsKm: 100, driverName: 'Hugo Silva' }), trip({ vehicle: 'B', gpsKm: 40, driverName: 'Hugo Silva' }), trip({ gpsKm: 60, driverName: 'Immer Sampayo' }), trip({ gpsKm: 5 })];
    const s = summarize(trips, [receipt({ liters: 20, total: 100, driverName: 'Immer Sampayo' })], 'driver');
    expect(s.rows.map((r) => r.name)).toEqual(['Hugo Silva', 'Immer Sampayo', NO_DRIVER]);
    expect(s.rows[0]!.gpsKm).toBe(140);
    expect(s.rows[1]!.liters).toBe(20);
    expect(s.total).toMatchObject({ gpsKm: 205, trips: 4 });
  });
  it('sorted by name, with the trips without a truck last', () => {
    const s = summarize([trip({ vehicle: null }), trip({ vehicle: 'mercedes 1618' }), trip({ vehicle: 'Ford Cargo' }), trip({ vehicle: 'Leyland' })], [], 'vehicle');
    expect(s.rows.map((r) => r.name)).toEqual(['Ford Cargo', 'Leyland', 'mercedes 1618', NO_TRUCK]);
  });
});

describe('what the page adds', () => {
  it('fuel counts on the day of its receipt, without the trash', () => {
    const late = receipt({ date: '2026-09-30', recordedAt: '2026-10-02T12:00:00Z' });
    const kept = receipt({ date: '2026-10-01' });
    const binned = receipt({ date: '2026-10-05', archived: true });
    expect(fuelInPeriod([late, kept, binned], '2026-10-01', '2026-10-31')).toEqual([kept]);
  });
  it('the catalog trucks without trips or fuel in the period', () => {
    const s = summarize([trip({ vehicle: 'Ford Cargo 1722 · JKL3456' })], [receipt({ vehicle: 'Scania R450 · DEF5678' })], 'vehicle');
    expect(idleTrucks(s.rows, ['Ford Cargo 1722 · JKL3456', 'Scania R450 · DEF5678', 'Volvo FH 460 · ABC1234'])).toEqual(['Volvo FH 460 · ABC1234']);
  });
  it('sorts by a column, largest first, with the unnamed row last and no value after the rest', () => {
    const s = summarize([trip({ vehicle: 'B', gpsKm: 500 }), trip({ vehicle: 'C', gpsKm: 900 }), trip({ vehicle: null, gpsKm: 2000 }), trip({ vehicle: 'A', gpsKm: 100 })], [receipt({ vehicle: 'B', liters: 100 })], 'vehicle');
    expect(sortRows(s.rows, 'gpsKm').map((r) => r.name)).toEqual(['C', 'B', 'A', NO_TRUCK]);
    expect(sortRows(s.rows, 'gpsKm', true).map((r) => r.name)).toEqual(['A', 'B', 'C', NO_TRUCK]);
    expect(sortRows(s.rows, 'litersPer100').map((r) => r.name)).toEqual(['B', 'A', 'C', NO_TRUCK]);
    expect(sortRows(s.rows, 'name', true).map((r) => r.name)).toEqual(['A', 'B', 'C', NO_TRUCK]);
  });
  it('the kilometres day by day, by the day each trip started in Uruguay', () => {
    // 01:00 UTC of the 11th is still the 10th in Uruguay.
    const trips = [trip({ gpsKm: 120, departureAt: '2026-10-11T01:00:00Z' }), trip({ gpsKm: 30, loadType: 'empty', day: '2026-10-10' }), trip({ gpsKm: 80, day: '2026-10-12' }), trip({ gpsKm: 999, day: '2026-10-12', deleted: true }), manual({ day: '2026-10-12' })];
    const { step, buckets } = kmByDay(trips, '2026-10-10', '2026-10-12');
    expect(step).toBe('day');
    expect(buckets).toEqual([
      { from: '2026-10-10', to: '2026-10-10', trips: 2, loadedKm: 120, emptyKm: 30 },
      { from: '2026-10-11', to: '2026-10-11', trips: 0, loadedKm: 0, emptyKm: 0 },
      { from: '2026-10-12', to: '2026-10-12', trips: 1, loadedKm: 80, emptyKm: 0 },
    ]);
  });
  it('week by week when the period is longer than a month, the last week cut at its end', () => {
    const { step, buckets } = kmByDay([trip({ gpsKm: 50, day: '2026-09-02' }), trip({ gpsKm: 70, day: '2026-10-15' })], '2026-08-01', '2026-10-15');
    expect(step).toBe('week');
    expect(buckets).toHaveLength(11);
    expect(buckets[4]).toMatchObject({ from: '2026-08-29', to: '2026-09-04', loadedKm: 50 });
    expect(buckets.at(-1)).toMatchObject({ from: '2026-10-10', to: '2026-10-15', loadedKm: 70 });
  });
  it('round axis ticks from zero that cover the largest value', () => {
    expect(niceTicks(412)).toEqual([0, 200, 400, 600]);
    expect(niceTicks(400)).toEqual([0, 100, 200, 300, 400]);
    expect(niceTicks(41_000)).toEqual([0, 20_000, 40_000, 60_000]);
    expect(niceTicks(0.5)).toEqual([0, 0.2, 0.4, 0.6]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });
  it('the billing of the last 12 months, each currency apart', () => {
    expect(monthsBefore('2026-10-21', 0)).toBe('2026-10-01');
    expect(monthsBefore('2026-01-31', 1)).toBe('2025-12-01');
    const months = billingByMonth([trip({ day: '2026-10-03', amount: 41_000 }), trip({ day: '2026-10-04', amount: 1_250.5, currency: 'USD' }), trip({ day: '2026-09-30' }), trip({ day: '2025-10-31', amount: 9 }), manual({ day: '2026-09-02', amount: 15_000, deleted: true })], '2026-10-21');
    expect(months).toHaveLength(12);
    expect(months[0]!.month).toBe('2025-11-01');
    expect(months.at(-1)).toEqual({ month: '2026-10-01', trips: 2, billed: { UYU: 41_000, USD: 1_250.5 }, unbilled: 0 });
    expect(months.at(-2)).toEqual({ month: '2026-09-01', trips: 1, billed: { UYU: 0, USD: 0 }, unbilled: 1 });
  });
});
