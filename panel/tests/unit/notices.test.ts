import { describe, expect, it } from 'vitest';
import type { Receipt } from '../../src/lib/fuel';
import { longTrips, oldApps, receiptsMissing, unbilledTrips } from '../../src/lib/notices';
import { driverPresence, type PresenceRow } from '../../src/lib/presence';
import type { Trip } from '../../src/lib/trips';

const NOW = Date.parse('2026-10-28T15:00:00Z');
const TODAY = '2026-10-28';
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

let n = 0;
function receipt(over: Partial<Receipt> = {}): Receipt {
  n++;
  return {
    id: 'r' + n,
    tripId: null,
    driverId: 'd1',
    driverName: null,
    recordedAt: null,
    date: '2026-10-20',
    vehicle: 'Volvo FH 460 · ABC1234',
    stationKey: 'name:',
    station: null,
    liters: 100,
    total: 5000,
    currency: 'UYU',
    fullTank: false,
    tripMeters: null,
    objectPath: null,
    archived: false,
    updatedAt: null,
    declared: { date: null, vehicle: null, stationId: null, station: null, liters: null, total: null, fullTank: null },
    panelData: {},
    ...over,
  };
}

/** A finished app trip with cargo and its amount, as the trip list builds it. */
function trip(over: Partial<Trip> = {}): Trip {
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
    vehicle: 'Volvo FH 460 · ABC1234',
    departureAt: '2026-10-20T15:00:00Z',
    arrivalAt: null,
    gpsKm: 100,
    loadType: 'loaded',
    orderNumber: null,
    client: 'Molino San José',
    product: null,
    originName: null,
    origin: null,
    gpsStart: null,
    destinationName: null,
    destination: null,
    gpsEnd: null,
    billableKm: null,
    kg: null,
    amount: 10000,
    currency: 'UYU',
    notes: null,
    updatedAt: null,
    status: { code: 'complete', label: 'Completo', missing: [] },
    ...over,
  } as Trip;
}

describe('trips that look left open', () => {
  it('14 hours or more in progress, the longest first; the app asks its driver at the same time', () => {
    const active = [
      { id: 'a', driver_name: ' Ana Pereira ', vehicle: 'Volvo FH 460 · ABC1234', started_at: hoursAgo(13.9) },
      { id: 'b', driver_name: 'Bruno Díaz', vehicle: 'Scania R450 · DEF5678', started_at: hoursAgo(14) },
      { id: 'c', driver_name: 'Carla Méndez', vehicle: 'Mercedes Benz Actros', started_at: hoursAgo(30.5) },
      { id: 'd', driver_name: 'Diego Silva', vehicle: '', started_at: 'sin fecha' },
    ];
    expect(longTrips(active, NOW)).toEqual([
      { id: 'c', driver: 'Carla Méndez', vehicle: 'Mercedes Benz Actros', hours: 30 },
      { id: 'b', driver: 'Bruno Díaz', vehicle: 'Scania R450 · DEF5678', hours: 14 },
    ]);
  });
});

describe('receipts to complete', () => {
  it('the last 30 days, out of the trash, without an amount or litres or with them in zero', () => {
    const list = [
      receipt({ id: 'ok' }),
      receipt({ id: 'sin-importe', total: null }),
      receipt({ id: 'importe-cero', total: 0 }),
      receipt({ id: 'sin-litros', liters: null }),
      receipt({ id: 'litros-cero', liters: 0, date: '2026-09-28' }),
      receipt({ id: 'vieja', total: null, date: '2026-09-27' }),
      receipt({ id: 'papelera', total: null, archived: true }),
      receipt({ id: 'sin-dia', total: null, date: null }),
      receipt({ id: 'futura', total: null, date: '2026-10-29' }),
    ];
    expect(receiptsMissing(list, TODAY).map((r) => r.id)).toEqual(['sin-importe', 'importe-cero', 'sin-litros', 'litros-cero']);
  });
});

describe('trips without an amount', () => {
  it('the rule of Cobros: finished, with cargo or typed by hand, out of the trash', () => {
    const list = [
      trip({ key: 'cobrado' }),
      trip({ key: 'sin-importe', amount: null }),
      trip({ key: 'en-cero', amount: 0 }),
      trip({ key: 'vacio', amount: null, loadType: 'empty' }),
      trip({ key: 'en-ruta', amount: null, active: true }),
      trip({ key: 'papelera', amount: null, deleted: true }),
    ];
    expect(unbilledTrips(list).map((t) => t.key)).toEqual(['sin-importe', 'en-cero']);
  });
});

describe('drivers with an older app', () => {
  const row = (id: string, name: string, version: string, seenHours: number): PresenceRow => ({
    driver_id: id,
    driver_name: name,
    vehicle: null,
    app_version: version,
    seen_at: hoursAgo(seenHours),
    latitude: null,
    longitude: null,
    accuracy_m: null,
    located_at: null,
  });
  it('seen in the last 30 days with a version older than another phone of the fleet', () => {
    const drivers = driverPresence(
      [row('a', 'Ana', '0.22.0', 1), row('b', 'Bruno', '0.21.0', 2), row('c', 'Carla', '0.20.0', 24 * 31), row('d', 'Diego', '0.22.0', 5)],
      new Set(),
      NOW,
    );
    expect(oldApps(drivers, NOW).map((d) => [d.name, d.version, d.newer])).toEqual([['Bruno', '0.21.0', '0.22.0']]);
  });
});
