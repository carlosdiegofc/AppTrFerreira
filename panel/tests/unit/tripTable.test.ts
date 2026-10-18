import { describe, expect, it } from 'vitest';
import { wallClock } from '../../src/lib/dates';
import { money, number } from '../../src/lib/format';
import { kmText, PRINT_HEADERS, printRow, routeText, SHEET_COLUMNS, totalsText, tripFacts, tripTotals } from '../../src/lib/tripTable';
import { type PanelTripRow, type SessionRow, tripFromPanel, tripFromSession } from '../../src/lib/trips';

const session = (over: Partial<SessionRow> = {}): SessionRow => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000001', driver_id: 'd1', driver_name: 'Ana Pereira', vehicle: 'Volvo FH 460 · ABC1234',
  started_at: '2026-10-15T12:05:00Z', ended_at: '2026-10-15T16:40:00Z', active: false, paused: false, load_type: 'loaded',
  distance_meters: 152_340, origin_lat: null, origin_lng: null, arrival_lat: null, arrival_lng: null, ...over,
});
const panel = (over: Partial<PanelTripRow> = {}): PanelTripRow => ({
  id: 'p1', source: 'app', app_trip_id: 'aaaaaaaa-0000-4000-8000-000000000001', departure_at: null, arrival_at: null, driver_id: null,
  driver_name: null, vehicle: null, order_number: '24129', product: 'Soja', client: 'Navios', origin_name: 'Young', origin_lat: null,
  origin_lng: null, destination_name: 'Nueva Palmira', destination_lat: null, destination_lng: null, billable_km: 160, kg: 30000,
  amount: 41000, currency: 'UYU', notes: null, deleted_at: null, created_at: '2026-10-15T17:00:00Z', created_by: null, updated_at: 'u1',
  updated_by: null, ...over,
});

describe('the trip as the screen and the files show it', () => {
  const trip = tripFromSession(session(), panel(), null);

  it('one line per trip for PDF and Word, with the times of Uruguay', () => {
    expect(PRINT_HEADERS).toHaveLength(printRow(trip).length);
    expect(printRow(trip)).toEqual(['15/10/2026 09:05', 'Ana Pereira', 'ABC1234', '24129', 'Navios', 'Soja', 'Young – Nueva Palmira', '160 km fact.', '30.000', '$ 41.000', 'Completo']);
  });

  it('says what is missing instead of leaving it blank', () => {
    expect(routeText({ originName: null, destinationName: 'Young' })).toBe('¿origen? – Young');
    expect(routeText({ originName: null, destinationName: null })).toBe('');
    expect(kmText({ billableKm: null, gpsKm: 152.34 })).toBe('152,3 km GPS');
    expect(kmText({ billableKm: null, gpsKm: null })).toBe('');
  });

  it('every spreadsheet column has a value for a complete trip', () => {
    const values = Object.fromEntries(SHEET_COLUMNS.map((c) => [c.header, c.value(trip)]));
    expect(values).toMatchObject({ Salida: '2026-10-15T12:05:00Z', Camión: 'Volvo FH 460', Matrícula: 'ABC1234', 'Km GPS': 152.3, 'Km facturables': 160, Kilos: 30000, Importe: 41000, Moneda: 'UYU', 'Falta completar': null, Registro: 'App GPS' });
  });

  it('the spreadsheet shows the clock time of Uruguay', () => {
    expect(wallClock(Date.parse('2026-10-15T12:05:00Z')).toISOString()).toBe('2026-10-15T09:05:00.000Z');
  });

  it('totals never add pesos and dollars together', () => {
    const usd = tripFromPanel(panel({ id: 'm1', source: 'manual', app_trip_id: null, departure_at: '2026-10-14T12:00:00Z', amount: 1250.5, currency: 'USD', billable_km: 40, kg: 0 }));
    const totals = tripTotals([trip, usd]);
    expect(totals).toEqual({ trips: 2, deleted: 0, billableKm: 200, gpsKm: 152.34, kg: 30000, amount: { UYU: 41000, USD: 1250.5 } });
    expect(totalsText(totals)).toBe('2 viajes · 200 km facturables · 152,3 km GPS · 30.000 kg · $ 41.000 · US$ 1.250,50');
  });

  it('deleted trips are listed but never added up', () => {
    const binned = tripFromPanel(panel({ id: 'm2', source: 'manual', app_trip_id: null, departure_at: '2026-10-14T12:00:00Z', amount: 900, billable_km: 40, deleted_at: '2026-10-15T00:00:00Z' }));
    expect(tripTotals([binned])).toEqual({ trips: 0, deleted: 1, billableKm: 0, gpsKm: 0, kg: 0, amount: { UYU: 0, USD: 0 } });
    expect(totalsText(tripTotals([binned]))).toBe('1 viaje eliminado, que no se suma');
    expect(totalsText(tripTotals([binned, binned]))).toBe('2 viajes eliminados, que no se suman');
    expect(totalsText(tripTotals([trip, binned]))).toBe('1 viaje · 160 km facturables · 152,3 km GPS · 30.000 kg · $ 41.000 · además, 1 viaje eliminado, que no se suma');
  });

  it('the load order lists every fact, with a dash for what is not known', () => {
    const facts = Object.fromEntries(tripFacts(tripFromSession(session({ active: true, ended_at: null, load_type: 'empty' }), null, null)));
    expect(facts).toMatchObject({ Chofer: 'Ana Pereira', Matrícula: 'ABC1234', 'Orden de carga': '—', Llegada: 'En curso', Carga: 'Retorno vacío', Importe: '—' });
  });

  it('numbers and money the Uruguayan way', () => {
    expect(number(1234.5, 1)).toBe('1.234,5');
    expect(money(41000, 'UYU')).toBe('$ 41.000');
    expect(money(1250.5, 'USD')).toBe('US$ 1.250,50');
  });
});
