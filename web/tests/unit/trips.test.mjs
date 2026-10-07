import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeTrips, tripFromSession, tripFromPanel, tripStatus, filterTrips, countByStatus, validateTripForm, formValues,
  samePayload, routeSegments, routeStats, fuelFromReceipt, summarize, parseTripKey, asObject,
} from '../../js/trips.js';

const session = (over = {}) => ({
  id: 'aaaaaaaa-0000-0000-0000-000000000001', driver_id: 'd1', driver_name: 'Immer Sampayo', vehicle: 'Ford Cargo 1722 · ITP2187',
  started_at: '2025-07-30T11:00:00+00:00', ended_at: '2025-07-30T13:40:00+00:00', active: false, paused: false,
  load_type: 'loaded', distance_meters: 184200, origin_lat: -32.698, origin_lng: -57.627, arrival_lat: -33.87, arrival_lng: -58.411, ...over,
});
const details = { trip_id: 'aaaaaaaa-0000-0000-0000-000000000001', data: { destino: 'Navios (N. Palmira)', destination_lat: -33.87, destination_lng: -58.411, cliente: 'Navios', tipoCarga: 'Soja', kg: 30000 } };

test('an app trip shows up with the data typed on the phone, pending what the office must add', () => {
  const t = tripFromSession(session(), null, details);
  assert.equal(t.key, 'app:aaaaaaaa-0000-0000-0000-000000000001');
  assert.equal(t.client, 'Navios');
  assert.equal(t.product, 'Soja');
  assert.equal(t.destinationName, 'Navios (N. Palmira)');
  assert.deepEqual(t.destination, [-33.87, -58.411]);
  assert.deepEqual(t.origin, [-32.698, -57.627]);
  assert.equal(t.kg, 30000);
  assert.equal(t.gpsKm, 184.2);
  assert.equal(t.vehicle, 'Ford Cargo 1722 · ITP2187');
  assert.equal(t.status.code, 'pendiente');
  assert.deepEqual(t.status.missing, ['Origen']);
});

test('what the office typed wins over the phone, and the GPS facts stay', () => {
  const panel = { id: 'p1', source: 'app', app_trip_id: 'aaaaaaaa-0000-0000-0000-000000000001', updated_at: 'u1', origin_name: 'Santa Cecilia (Young)', client: 'Navios S.A.', order_number: '24129', billable_km: 184, kg: 29500, amount: 41000, currency: 'USD' };
  const t = tripFromSession(session(), panel, details);
  assert.equal(t.client, 'Navios S.A.');
  assert.equal(t.kg, 29500);
  assert.equal(t.orderNumber, '24129');
  assert.equal(t.currency, 'USD');
  assert.equal(t.gpsKm, 184.2);
  assert.equal(t.departureAt, '2025-07-30T11:00:00+00:00');
  assert.equal(t.status.code, 'completo');
  assert.equal(t.panelId, 'p1');
  assert.equal(t.panelUpdatedAt, 'u1');
});

test('trips without a truck, in progress, empty returns and deleted ones get the right status', () => {
  assert.deepEqual(tripFromSession(session({ vehicle: 'Sin camión asignado' }), null, details).status.missing, ['Camión', 'Origen']);
  assert.equal(tripFromSession(session({ active: true, ended_at: null }), null, details).status.code, 'en_curso');
  assert.equal(tripFromSession(session({ active: true, paused: true, ended_at: null }), null, details).status.label, 'En curso · pausado');
  const empty = tripFromSession(session({ load_type: 'empty' }), { id: 'p', origin_name: 'Nueva Palmira', destination_name: 'Young' }, null);
  assert.equal(empty.product, 'Retorno vacío');
  assert.equal(empty.status.code, 'completo');
  assert.equal(formValues(empty).product, '');
  const deleted = tripFromSession(session(), { id: 'p', deleted_at: '2025-08-01T00:00:00Z' }, details);
  assert.equal(deleted.status.code, 'eliminado');
});

test('bad coordinates from the phone are ignored instead of drawing a wrong map', () => {
  const t = tripFromSession(session({ origin_lat: 0, origin_lng: 0 }), null, { trip_id: 'x', data: { destination_lat: 'abc', destination_lng: null } });
  assert.equal(t.origin, null);
  assert.equal(t.destination, null);
});

test('merge: app trips, office rows and manual trips, newest first, no duplicates', () => {
  const sessions = [session(), session(), session({ id: 'aaaaaaaa-0000-0000-0000-000000000002', started_at: '2025-08-02T10:00:00Z' })];
  const panelRows = [
    { id: 'p1', source: 'app', app_trip_id: 'aaaaaaaa-0000-0000-0000-000000000001', origin_name: 'Young' },
    { id: 'm1', source: 'manual', departure_at: '2025-08-01T10:00:00Z', vehicle: 'Leyland', product: 'Trigo' },
    { id: 'p9', source: 'app', app_trip_id: 'not-loaded' },
  ];
  const list = mergeTrips({ sessions, panelRows, details: [details] });
  assert.deepEqual(list.map((t) => t.key), ['app:aaaaaaaa-0000-0000-0000-000000000002', 'web:m1', 'app:aaaaaaaa-0000-0000-0000-000000000001']);
  assert.equal(list[2].originName, 'Young');
  assert.equal(list[1].source, 'manual');
});

test('filters and counters', () => {
  const list = mergeTrips({
    sessions: [session(), session({ id: 's2', active: true, ended_at: null, driver_name: 'Hugo Silva', vehicle: 'Mercedes · SAB1234', started_at: '2025-08-03T00:00:00Z' })],
    panelRows: [{ id: 'm1', source: 'manual', departure_at: '2025-08-01T10:00:00Z', vehicle: 'Leyland', product: 'Trigo', client: 'COOPAR', origin_name: 'Paysandú', destination_name: 'Montevideo' },
                { id: 'm2', source: 'manual', departure_at: '2025-08-01T10:00:00Z', vehicle: 'Leyland', deleted_at: '2025-08-02T00:00:00Z' }],
    details: [details],
  });
  assert.deepEqual(countByStatus(list), { all: 3, pendiente: 1, en_curso: 1, completo: 1, eliminado: 1 });
  assert.equal(filterTrips(list, { status: 'pendiente' }).length, 1);
  assert.equal(filterTrips(list, { q: 'paysandu' })[0].key, 'web:m1');
  assert.equal(filterTrips(list, { q: 'NAVIOS' })[0].client, 'Navios');
  assert.equal(filterTrips(list, { driver: 'Hugo Silva' }).length, 1);
  assert.equal(filterTrips(list, { vehicle: 'Leyland' }).length, 1);
  assert.deepEqual(filterTrips(list, { bin: true }).map((t) => t.key), ['web:m2']);
});

test('form validation for a trip completed from the app', () => {
  const ok = validateTripForm({ order_number: ' 24129 ', client: 'Navios', product: 'Soja', origin_name: 'Young', origin: [-32.7, -57.6],
    destination_name: 'Nueva Palmira', destination: null, vehicle: '', billable_km: '184', kg: '30.000', amount: '41.000,50', currency: 'UYU',
    notes: '', departure_at: 'ignored', driver_name: 'ignored' }, 'app');
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.payload, {
    order_number: '24129', client: 'Navios', product: 'Soja', origin_name: 'Young', destination_name: 'Nueva Palmira', vehicle: null, notes: null,
    billable_km: 184, kg: 30000, amount: 41000.5, currency: 'UYU', origin_lat: -32.7, origin_lng: -57.6, destination_lat: null, destination_lng: null,
  });
});

test('form validation stops wrong data before it reaches the database', () => {
  const r = validateTripForm({ kg: '-3', billable_km: '9.000', amount: 'mucho', currency: 'EUR', order_number: 'x'.repeat(61),
    origin: [200, 5], departure_at: '', arrival_at: '', vehicle: '' }, 'manual');
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['amount', 'billable_km', 'currency', 'departure_at', 'kg', 'order_number', 'origin_name', 'vehicle']);
  const dates = validateTripForm({ departure_at: '2025-07-30T10:00', arrival_at: '2025-07-30T09:00', vehicle: 'Leyland' }, 'manual');
  assert.equal(dates.errors.arrival_at, 'La llegada no puede ser antes de la salida.');
  const good = validateTripForm({ departure_at: '2025-07-30T10:00', arrival_at: '2025-07-30T15:00', vehicle: 'Leyland', driver_name: ' Luis ' }, 'manual');
  assert.equal(good.ok, true);
  assert.equal(good.payload.driver_name, 'Luis');
  assert.equal(good.payload.departure_at, new Date('2025-07-30T10:00').toISOString());
});

test('unchanged forms are detected (no useless saves)', () => {
  const t = tripFromPanel({ id: 'm1', source: 'manual', departure_at: '2025-07-30T13:00:00+00:00', vehicle: 'Leyland', kg: 28000, amount: 45000, currency: 'UYU' });
  const v = formValues(t);
  const a = validateTripForm({ ...v, departure_at: '2025-07-30T13:00:00+00:00' }, 'manual');
  assert.equal(samePayload({ kg: 28000, departure_at: '2025-07-30T13:00:00.000Z' }, { kg: 28000, departure_at: '2025-07-30T13:00:00+00:00' }), true);
  assert.equal(samePayload({ kg: 28000 }, { kg: 28001 }), false);
  assert.ok(a);
});

test('trip keys from the address bar are validated', () => {
  assert.deepEqual(parseTripKey('app:AAAAAAAA-0000-0000-0000-000000000001'), { kind: 'app', id: 'aaaaaaaa-0000-0000-0000-000000000001' });
  assert.equal(parseTripKey('app:1;drop'), null);
  assert.equal(parseTripKey('xyz:aaaaaaaa-0000-0000-0000-000000000001'), null);
});

test('GPS route: lines break on pauses and signal gaps; bad points are dropped', () => {
  const p = (i, seg = 0, gap = 0) => ({ latitude: -33 - i * 0.01, longitude: -58, recorded_at: new Date(Date.UTC(2025, 6, 30, 11, 0, i * 30 + gap)).toISOString(), segment: seg, speed_kmh: 60 + i });
  const points = [p(0), p(1), p(2), p(3, 1), p(4, 1), p(5, 1, 600), p(6, 1, 600), { latitude: 0, longitude: 0, recorded_at: 'x' }];
  const lines = routeSegments(points);
  assert.deepEqual(lines.map((l) => l.length), [3, 2, 2]);
  const s = routeStats(points);
  assert.equal(s.count, 7);
  assert.equal(s.maxSpeedKmh, 66);
  assert.equal(s.durationMs, (6 * 30 + 600) * 1000);
});

test('fuel receipts use the corrections made in the panel', () => {
  const f = fuelFromReceipt({ id: 'f', trip_id: 't', vehicle: 'Ford · ITP2187', liters: 10, total: 100, station_name: 'Ancap', receipt_date: '2025-07-30',
    panel_data: { litros: '98,2', monto: 5120, moneda: 'USD', estacionNombre: 'Petrobras Durazno' } });
  assert.deepEqual([f.liters, f.total, f.currency, f.station], [98.2, 5120, 'USD', 'Petrobras Durazno']);
  assert.equal(fuelFromReceipt({ id: 'g', liters: 5, total: 50, vehicle: 'Sin camión asignado' }).vehicle, null);
});

test('summary per truck never mixes currencies', () => {
  const trips = [
    { vehicle: 'A', gpsKm: 100, billableKm: 110, kg: 1000, amount: 500, currency: 'UYU', deleted: false },
    { vehicle: 'A', gpsKm: 50, billableKm: 0, kg: 0, amount: 100, currency: 'USD', deleted: false },
    { vehicle: 'B', gpsKm: 999, amount: 1, currency: 'UYU', deleted: true },
  ];
  const fuel = [{ vehicle: 'A', liters: 30, total: 300, currency: 'UYU' }, { vehicle: null, liters: 10, total: 10, currency: 'USD' }];
  const s = summarize(trips, fuel);
  assert.deepEqual(s.rows.map((r) => r.vehicle), ['A', 'Sin camión asignado']);
  assert.deepEqual(s.rows[0].billed, { UYU: 500, USD: 100 });
  assert.equal(s.rows[0].gpsKm, 150);
  assert.equal(s.total.trips, 2);
  assert.deepEqual(s.total.fuel, { UYU: 300, USD: 10 });
});

test('JSON saved as text is read the same as real JSON', () => {
  assert.deepEqual(asObject('{"cliente":"Navios"}'), { cliente: 'Navios' });
  assert.deepEqual(asObject({ a: 1 }), { a: 1 });
  assert.deepEqual(asObject('roto{'), {});
  assert.deepEqual(asObject('[1,2]'), {});
  assert.deepEqual(asObject(null), {});
  const t = tripFromSession(session(), null, { trip_id: 'x', data: JSON.stringify(details.data) });
  assert.equal(t.client, 'Navios');
  assert.equal(fuelFromReceipt({ id: 'f', liters: 1, panel_data: '{"litros":"7,5"}' }).liters, 7.5);
});
