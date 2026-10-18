import { describe, expect, it } from 'vitest';
import { fromZoneInput, toZoneInput } from '../../src/lib/dates';
import { formChanged, formValues, type TripFormValues, validateTripForm } from '../../src/lib/tripForm';
import { type PanelTripRow, type SessionRow, tripFromPanel, tripFromSession } from '../../src/lib/trips';

// Same cases as the current panel (web/tests/unit/trips.test.mjs), so both panels save a trip alike.
const session = (over: Partial<SessionRow> = {}): SessionRow => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000001', driver_id: 'd1', driver_name: 'Immer Sampayo', vehicle: 'Ford Cargo 1722 · ITP2187',
  started_at: '2025-07-30T11:00:00+00:00', ended_at: '2025-07-30T13:40:00+00:00', active: false, paused: false, load_type: 'loaded',
  distance_meters: 184200, origin_lat: -32.698, origin_lng: -57.627, arrival_lat: -33.87, arrival_lng: -58.411, ...over,
});
const panel = (over: Partial<PanelTripRow> = {}): PanelTripRow => ({
  id: 'm1', source: 'manual', app_trip_id: null, departure_at: '2025-07-30T13:00:00+00:00', arrival_at: null, driver_id: null,
  driver_name: 'Luis', vehicle: 'Leyland · HTP1545', order_number: null, product: null, client: null, origin_name: null, origin_lat: null,
  origin_lng: null, destination_name: null, destination_lat: null, destination_lng: null, billable_km: null, kg: 28000, amount: 45000.5,
  currency: 'UYU', notes: null, deleted_at: null, created_at: '2025-07-30T14:00:00Z', created_by: null, updated_at: 'u1', updated_by: null, ...over,
});
const blank = (over: Partial<TripFormValues> = {}): TripFormValues => ({ ...formValues(null, Date.parse('2025-07-30T13:00:00Z')), ...over });

describe('the trip form', () => {
  it('opens with what the screen shows, the Uruguayan way', () => {
    const v = formValues(tripFromPanel(panel()));
    expect(v).toMatchObject({ vehicle: 'Leyland · HTP1545', driver_name: 'Luis', kg: '28.000', amount: '45.000,5', currency: 'UYU', departure_at: '2025-07-30T10:00' });
    // The empty return the screen shows is not something the office typed.
    expect(formValues(tripFromSession(session({ load_type: 'empty' }), null, null)).product).toBe('');
    // A new trip starts at the current minute, in Uruguay.
    expect(blank().departure_at).toBe('2025-07-30T10:00');
  });

  it('turns an app trip into the row to save, without the GPS dates or the driver', () => {
    const ok = validateTripForm(blank({ order_number: ' 24129 ', client: 'Navios', product: 'Soja', origin_name: 'Young', origin: [-32.7, -57.6], destination_name: 'Nueva Palmira', billable_km: '184', kg: '30.000', amount: '41.000,50', departure_at: 'x', driver_name: 'x' }), 'app');
    expect(ok.ok).toBe(true);
    expect(ok.payload).toEqual({
      order_number: '24129', client: 'Navios', product: 'Soja', origin_name: 'Young', destination_name: 'Nueva Palmira', vehicle: null, notes: null,
      billable_km: 184, kg: 30000, amount: 41000.5, currency: 'UYU', origin_lat: -32.7, origin_lng: -57.6, destination_lat: null, destination_lng: null,
    });
  });

  it('stops wrong data before it reaches the database', () => {
    const r = validateTripForm(blank({ kg: '-3', billable_km: '9.000', amount: 'mucho', currency: 'EUR' as 'UYU', order_number: 'x'.repeat(61), origin: [200, 5], departure_at: '', vehicle: '' }), 'manual');
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(['amount', 'billable_km', 'currency', 'departure_at', 'kg', 'order_number', 'origin_name', 'vehicle']);
    expect(validateTripForm(blank({ departure_at: '2025-07-30T10:00', arrival_at: '2025-07-30T09:00', vehicle: 'Leyland' }), 'manual').errors.arrival_at).toBe('La llegada no puede ser antes de la salida.');
    const good = validateTripForm(blank({ departure_at: '2025-07-30T10:00', arrival_at: '2025-07-30T15:00', vehicle: 'Leyland', driver_name: ' Luis ' }), 'manual');
    expect(good.ok).toBe(true);
    expect(good.payload).toMatchObject({ driver_name: 'Luis', departure_at: '2025-07-30T13:00:00.000Z', arrival_at: '2025-07-30T18:00:00.000Z' });
  });

  it('knows when nothing changed', () => {
    const v = formValues(tripFromPanel(panel()));
    expect(formChanged(v, { ...v })).toBe(false);
    expect(formChanged(v, { ...v, kg: '28.001' })).toBe(true);
  });
});

describe('date and time in Uruguay, whatever the zone of the computer', () => {
  it('goes both ways', () => {
    expect(toZoneInput('2026-10-16T01:30:00Z')).toBe('2026-10-15T22:30');
    expect(fromZoneInput('2026-10-15T22:30')).toBe('2026-10-16T01:30:00.000Z');
    expect(toZoneInput(null)).toBe('');
    expect(fromZoneInput('')).toBeNull();
    expect(fromZoneInput('2026-02-31T10:00')).toBeUndefined();
    expect(fromZoneInput('mañana')).toBeUndefined();
  });
});
