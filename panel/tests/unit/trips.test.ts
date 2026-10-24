import { describe, expect, it } from 'vitest';
import { asObject, fold, parseNumber, toNumber } from '../../src/lib/numbers';
import {
  countByStatus,
  type DetailRow,
  filterTrips,
  type FuelRow,
  fuelFromReceipt,
  knownValues,
  mergeTrips,
  type PanelTripRow,
  parseTripKey,
  periodRange,
  periodToIso,
  routeStats,
  type SessionRow,
  tripFromPanel,
  tripFromSession,
} from '../../src/lib/trips';

// Same cases as the current panel (web/tests/unit/trips.test.mjs), so both panels read a trip alike.
const ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const session = (over: Partial<SessionRow> = {}): SessionRow => ({
  id: ID, driver_id: 'd1', driver_name: 'Immer Sampayo', vehicle: 'Ford Cargo 1722 · ITP2187',
  started_at: '2025-07-30T11:00:00+00:00', ended_at: '2025-07-30T13:40:00+00:00', active: false, paused: false,
  load_type: 'loaded', distance_meters: 184200, origin_lat: -32.698, origin_lng: -57.627, arrival_lat: -33.87, arrival_lng: -58.411, ...over,
});
const panel = (over: Partial<PanelTripRow> = {}): PanelTripRow => ({
  id: 'p1', source: 'app', app_trip_id: ID, departure_at: null, arrival_at: null, driver_id: null, driver_name: null, vehicle: null,
  order_number: null, product: null, client: null, origin_name: null, origin_lat: null, origin_lng: null, destination_name: null,
  destination_lat: null, destination_lng: null, billable_km: null, kg: null, amount: null, currency: 'UYU', notes: null,
  deleted_at: null, created_at: '2025-07-30T14:00:00Z', created_by: null, updated_at: 'u1', updated_by: null, ...over,
});
const details: DetailRow = { trip_id: ID, data: { destino: 'Navios (N. Palmira)', destination_lat: -33.87, destination_lng: -58.411, cliente: 'Navios', tipoCarga: 'Soja', kg: 30000 } };

describe('a trip of the app', () => {
  it('shows up with the data typed on the phone, pending what the office must add', () => {
    const t = tripFromSession(session(), null, details);
    expect(t.key).toBe('app:' + ID);
    expect(t.client).toBe('Navios');
    expect(t.product).toBe('Soja');
    expect(t.destinationName).toBe('Navios (N. Palmira)');
    expect(t.destination).toEqual([-33.87, -58.411]);
    expect(t.origin).toEqual([-32.698, -57.627]);
    expect(t.kg).toBe(30000);
    expect(t.gpsKm).toBe(184.2);
    expect(t.vehicle).toBe('Ford Cargo 1722 · ITP2187');
    expect(t.status.code).toBe('pending');
    expect(t.status.missing).toEqual(['Origen']);
  });

  it('what the office typed wins over the phone, and the GPS facts stay', () => {
    const t = tripFromSession(session(), panel({ origin_name: 'Santa Cecilia (Young)', client: 'Navios S.A.', order_number: '24129', billable_km: 184, kg: 29500, amount: 41000, currency: 'USD' }), details);
    expect(t.client).toBe('Navios S.A.');
    expect(t.kg).toBe(29500);
    expect(t.orderNumber).toBe('24129');
    expect(t.currency).toBe('USD');
    expect(t.gpsKm).toBe(184.2);
    expect(t.departureAt).toBe('2025-07-30T11:00:00+00:00');
    expect(t.status.code).toBe('complete');
    expect(t.panelId).toBe('p1');
    expect(t.updatedAt).toBe('u1');
  });

  it('without a truck, in progress, an empty return and deleted get the right status', () => {
    expect(tripFromSession(session({ vehicle: 'Sin camión asignado' }), null, details).status.missing).toEqual(['Camión', 'Origen']);
    expect(tripFromSession(session({ active: true, ended_at: null }), null, details).status.code).toBe('running');
    expect(tripFromSession(session({ active: true, paused: true, ended_at: null }), null, details).status.label).toBe('En curso · pausado');
    const empty = tripFromSession(session({ load_type: 'empty' }), panel({ origin_name: 'Nueva Palmira', destination_name: 'Young' }), null);
    expect(empty.product).toBe('Retorno vacío');
    expect(empty.status.code).toBe('complete');
    expect(tripFromSession(session(), panel({ deleted_at: '2025-08-01T00:00:00Z' }), details).status.code).toBe('deleted');
  });

  it('bad coordinates from the phone are ignored instead of drawing a wrong map', () => {
    const t = tripFromSession(session({ origin_lat: 0, origin_lng: 0 }), null, { trip_id: 'x', data: { destination_lat: 'abc', destination_lng: null } });
    expect(t.origin).toBeNull();
    expect(t.destination).toBeNull();
  });

  it('an older truck label counts for its catalog truck', () => {
    const catalog = [{ model: 'Ford Cargo 1722', plate: 'ITP2187' }, { model: 'Leyland', plate: 'HTP1545' }];
    expect(tripFromSession(session({ vehicle: 'Ford Cargo' }), null, details, catalog).vehicle).toBe('Ford Cargo 1722 · ITP2187');
  });

  it('details saved as text read the same as real JSON', () => {
    expect(tripFromSession(session(), null, { trip_id: ID, data: JSON.stringify(details.data) }).client).toBe('Navios');
  });
});

describe('the list', () => {
  it('merges app trips, office rows and manual trips, newest first, without duplicates', () => {
    const sessions = [session(), session(), session({ id: 'aaaaaaaa-0000-4000-8000-000000000002', started_at: '2025-08-02T10:00:00Z' })];
    const panelRows = [
      panel({ origin_name: 'Young' }),
      panel({ id: 'm1', source: 'manual', app_trip_id: null, departure_at: '2025-08-01T10:00:00Z', vehicle: 'Leyland', product: 'Trigo' }),
      panel({ id: 'p9', app_trip_id: 'not-loaded' }),
    ];
    const list = mergeTrips({ sessions, panelRows, details: [details] });
    expect(list.map((t) => t.key)).toEqual(['app:aaaaaaaa-0000-4000-8000-000000000002', 'web:m1', 'app:' + ID]);
    expect(list[2]?.originName).toBe('Young');
    expect(list[1]?.source).toBe('manual');
  });

  it('filters, counts and lists trucks and drivers', () => {
    const list = mergeTrips({
      sessions: [session(), session({ id: 's2', active: true, ended_at: null, driver_name: 'Hugo Silva', vehicle: 'Mercedes · SAB1234', started_at: '2025-08-03T00:00:00Z' })],
      panelRows: [
        panel({ id: 'm1', source: 'manual', app_trip_id: null, departure_at: '2025-08-01T10:00:00Z', vehicle: 'Leyland', product: 'Trigo', client: 'COOPAR', origin_name: 'Paysandú', destination_name: 'Montevideo' }),
        panel({ id: 'm2', source: 'manual', app_trip_id: null, departure_at: '2025-08-01T10:00:00Z', vehicle: 'Leyland', deleted_at: '2025-08-02T00:00:00Z' }),
      ],
      details: [details],
    });
    expect(countByStatus(list)).toEqual({ all: 3, pending: 1, running: 1, complete: 1, deleted: 1 });
    expect(filterTrips(list, { status: 'pending' })).toHaveLength(1);
    expect(filterTrips(list, { q: 'paysandu' })[0]?.key).toBe('web:m1');
    expect(filterTrips(list, { q: 'NAVIOS' })[0]?.client).toBe('Navios');
    expect(filterTrips(list, { driver: 'Hugo Silva' })).toHaveLength(1);
    expect(filterTrips(list, { vehicle: 'Leyland' })).toHaveLength(1);
    expect(filterTrips(list, { bin: true }).map((t) => t.key)).toEqual(['web:m2']);
    expect(knownValues(list)).toEqual({ vehicles: ['Ford Cargo 1722 · ITP2187', 'Leyland', 'Mercedes · SAB1234'], drivers: ['Hugo Silva', 'Immer Sampayo'] });
  });

  it('a driver card brings its account\'s trips under any name and the ones typed with its name, nobody else\'s', () => {
    const list = mergeTrips({
      sessions: [
        session({ id: 'a1', driver_id: 'luis', driver_name: 'Luis Ferreira', started_at: '2025-08-03T00:00:00Z' }),
        session({ id: 'a2', driver_id: 'luis', driver_name: 'Los Ferreira', started_at: '2025-08-02T00:00:00Z' }),
        session({ id: 'a3', driver_id: 'otro', driver_name: 'Luis Ferreira', started_at: '2025-08-01T00:00:00Z' }),
      ],
      panelRows: [panel({ id: 'm1', source: 'manual', app_trip_id: null, departure_at: '2025-08-01T10:00:00Z', vehicle: 'Leyland', driver_name: 'luis  ferreira' })],
      details: [],
    });
    expect(filterTrips(list, { card: { userId: 'luis', name: 'Luis Ferreira' } }).map((t) => t.key)).toEqual(['app:a1', 'app:a2', 'web:m1']);
    // A card without the app: by its name.
    expect(filterTrips(list, { card: { userId: null, name: 'Luis Ferreira' } }).map((t) => t.key)).toEqual(['app:a1', 'web:m1', 'app:a3']);
    // ...but not the trips of an account another card has; until the cards are read, only the ones typed by hand.
    expect(filterTrips(list, { card: { userId: null, name: 'Luis Ferreira', claimed: new Set(['luis']) } }).map((t) => t.key)).toEqual(['web:m1', 'app:a3']);
    expect(filterTrips(list, { card: { userId: null, name: 'Luis Ferreira', claimed: null } }).map((t) => t.key)).toEqual(['web:m1']);
    expect(filterTrips(list, { driver: 'Luis Ferreira' })).toHaveLength(2);
  });

  it('a manual trip keeps what was typed', () => {
    const t = tripFromPanel(panel({ id: 'm1', source: 'manual', app_trip_id: null, departure_at: '2025-08-01T10:00:00Z', vehicle: 'Leyland', billable_km: 320, amount: 52000 }));
    expect(t.key).toBe('web:m1');
    expect(t.gpsKm).toBeNull();
    expect(t.billableKm).toBe(320);
    expect(t.status.missing).toEqual(['Origen', 'Destino', 'Cliente', 'Producto']);
  });
});

describe('addresses and periods', () => {
  it('trip keys from the address bar are validated', () => {
    expect(parseTripKey('app:' + ID.toUpperCase())).toEqual({ kind: 'app', id: ID });
    expect(parseTripKey('web:nope')).toBeNull();
    expect(parseTripKey(undefined)).toBeNull();
  });

  it('periods count days in Uruguay', () => {
    expect(periodRange('30', '2026-10-18')).toEqual({ from: '2026-09-19', to: '2026-10-18' });
    expect(periodRange('month', '2026-10-18')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(periodRange('prev-month', '2026-03-05')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRange('90', '2026-10-18')).toEqual({ from: '2026-07-21', to: '2026-10-18' });
    expect(periodToIso('2026-10-01', '2026-10-31')).toEqual({ fromIso: '2026-10-01T03:00:00.000Z', toIso: '2026-11-01T03:00:00.000Z' });
    expect(periodToIso('2026-10-31', '2026-10-01')).toBeNull();
    expect(periodToIso('', '2026-10-01')).toBeNull();
  });
});

describe('fuel, route and numbers', () => {
  it('fuel receipts use the corrections made in the panel', () => {
    const r = { id: 'f1', trip_id: ID, driver_id: 'd1', driver_name: 'Immer', vehicle: 'Leyland · HTP1545', recorded_at: '2025-07-30T12:00:00Z', receipt_date: '2025-07-30', distance_meters: 0, object_path: 'd1/f1.jpg', archived: false, station_id: '', station_name: 'Ancap Young', liters: 100, total: 6000, panel_data: { litros: '120,5', moneda: 'USD', monto: '150' }, updated_at: null, updated_by: null, full_tank: null } as FuelRow;
    expect(fuelFromReceipt(r)).toMatchObject({ liters: 120.5, total: 150, currency: 'USD', station: 'Ancap Young', date: '2025-07-30', objectPath: 'd1/f1.jpg' });
    // Without a receipt day, the day it was loaded in Uruguay: 22:30 of the 29th is not the 30th.
    expect(fuelFromReceipt({ ...r, receipt_date: '', recorded_at: '2025-07-30T01:30:00Z', panel_data: {} } as FuelRow).date).toBe('2025-07-29');
    expect(fuelFromReceipt({ ...r, panel_data: { fecha: '28/07/2025' } } as FuelRow).date).toBe('2025-07-28');
  });

  it('route stats leave out readings without a fix and speeds that are GPS noise', () => {
    const at = (m: number) => new Date(Date.parse('2025-07-30T11:00:00Z') + m * 60_000).toISOString();
    expect(routeStats([
      { latitude: -34.9, longitude: -56.1, recorded_at: at(0), speed_kmh: 70 },
      { latitude: 0, longitude: 0, recorded_at: at(5), speed_kmh: 300 },
      { latitude: -34.8, longitude: -56.2, recorded_at: at(10), speed_kmh: 200 },
    ])).toEqual({ count: 2, durationMs: 10 * 60_000, maxSpeedKmh: 70 });
    expect(routeStats([])).toEqual({ count: 0, durationMs: null, maxSpeedKmh: null });
  });

  it('numbers are read the Uruguayan way', () => {
    expect(toNumber('30.000')).toBe(30000);
    expect(toNumber('1.234,5')).toBe(1234.5);
    expect(toNumber('12,5')).toBe(12.5);
    expect(toNumber('1234.5')).toBe(1234.5);
    expect(toNumber('abc')).toBeNull();
    expect(parseNumber('-3')).toEqual({ ok: false, error: 'No puede ser negativo.' });
    expect(fold('  Paysandú ')).toBe('paysandu');
    expect(asObject('{"a":1}')).toEqual({ a: 1 });
    expect(asObject('[1]')).toEqual({});
  });
});
