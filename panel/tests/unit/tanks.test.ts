import { describe, expect, it } from 'vitest';
import { type FuelRow, receiptFromRow } from '../../src/lib/fuel';
import type { TankReference } from '../../src/lib/road';
import {
  consumptionFrom,
  defaultWarning,
  kmPerLiter,
  litersPer100,
  measuredConsumption,
  type TankSettings,
  tankFormValues,
  tankStart,
  tankState,
  type TankTrip,
  tripsInCatalog,
  tripsSince,
  validateMeasurement,
  validateTankForm,
} from '../../src/lib/tanks';

const TRUCK = 'Volvo FH 460 · ABC1234';
const KEY = 'plate:abc1234';
// 400 litres, 3 km per litre, an alert at 80.
const settings: TankSettings = { key: KEY, name: TRUCK, capacity: 400, consumption: 100 / 3, warning: 80, updatedAt: '2026-10-01T12:00:00Z' };
const at = (h: number) => new Date(Date.UTC(2026, 9, 20, h)).toISOString();

const receipt = (id: string, over: Partial<FuelRow> = {}) =>
  receiptFromRow({
    id, trip_id: null, driver_id: 'd1', driver_name: 'Ana Pereira', vehicle: TRUCK, recorded_at: at(10), receipt_date: '2026-10-20', distance_meters: 0, object_path: null,
    archived: false, station_id: '', station_name: 'Ancap Ruta 5', liters: 100, total: 6000, panel_data: null, updated_at: null, updated_by: null, full_tank: null, ...over,
  });
const trip = (id: string, startedAt: string, km: number, over: Partial<TankTrip> = {}): TankTrip => ({ id, vehicle: TRUCK, startedAt, endedAt: null, active: false, meters: km * 1000, ...over });
const reference = (over: Partial<TankReference> = {}): TankReference => ({
  vehicle_key: KEY, vehicle_name: TRUCK, capacity_l: 400, liters: 200, consumption: 100 / 3, warning_l: 80, trip_meters: {}, receipt_liters: {}, measured_at: at(10), updated_at: at(10), ...over,
});

describe('tanques: dónde arranca el cálculo', () => {
  it('sin tanque cargado no hay nada; con el tanque y sin saber cuánto tiene, espera', () => {
    expect(tankState(null, null, [], []).status).toBe('unset');
    expect(tankState(settings, null, [], []).status).toBe('waiting');
    // A full tank in the trash, or one the office said was not full, does not start it.
    expect(tankState(settings, null, [], [receipt('r1', { full_tank: true, archived: true }), receipt('r2', { full_tank: true, panel_data: { tanque_lleno: false } })]).status).toBe('waiting');
  });

  it('arranca en lo último que se supo: la medición o la carga que llenó el tanque', () => {
    const full = receipt('f', { full_tank: true, recorded_at: at(12) });
    expect(tankStart(settings, reference(), [full])).toMatchObject({ kind: 'full', liters: 400 });
    expect(tankStart(settings, reference({ measured_at: at(13), liters: 250 }), [full])).toMatchObject({ kind: 'measured', liters: 250 });
    // The office can say a load filled the tank.
    expect(tankStart(settings, null, [receipt('o', { panel_data: { tanque_lleno: true } })])).toMatchObject({ kind: 'full' });
    expect(tripsSince([tankStart(settings, reference(), [])?.at ?? null, null, at(12)])).toBe(new Date(Date.parse(at(10)) - 7 * 86_400_000).toISOString());
    expect(tripsSince([null])).toBeNull();
  });

  it('un viaje guardado con el nombre viejo del camión cuenta para su camión del catálogo, como las boletas', () => {
    const full = receipt('f', { full_tank: true, recorded_at: at(8) });
    const old = [trip('t1', at(9), 300, { vehicle: 'Volvo FH 460', endedAt: at(12) })];
    // Without the catalog the trip is another truck's, and the tank stays full.
    expect(tankState(settings, null, old, [full])).toMatchObject({ status: 'known', km: 0, liters: 400 });
    expect(tankState(settings, null, tripsInCatalog(old, [{ model: 'Volvo FH 460', plate: 'ABC1234' }]), [full])).toMatchObject({ status: 'known', km: 300, liters: 300 });
    // A label the catalog does not tell apart keeps its own.
    expect(tripsInCatalog(old, [{ model: 'Volvo FH 460', plate: 'ABC1234' }, { model: 'Volvo FH 460', plate: 'XYZ9876' }])[0]?.vehicle).toBe('Volvo FH 460');
  });
});

describe('tanques: el cálculo', () => {
  it('desde una medición: los kilómetros nuevos de cada viaje y las cargas posteriores', () => {
    // At the measurement t1 had 100 km and a load was known; later t1 did 60 km more and t2 90 km: 150 km, 50 litres.
    const ref = reference({ trip_meters: { t1: 100_000 }, receipt_liters: { known: 100 } });
    const trips = [trip('t1', at(8), 160, { active: true }), trip('t2', at(11), 90), trip('otro', at(11), 500, { vehicle: 'Scania · DEF5678' })];
    const loads = [
      receipt('known', { recorded_at: at(9) }),
      // Loaded before the measurement and sent later: the measured litres already had it.
      receipt('late', { recorded_at: at(9), liters: 70 }),
      receipt('after', { recorded_at: at(14), liters: 40 }),
      receipt('trash', { recorded_at: at(14), liters: 300, archived: true }),
    ];
    const state = tankState(settings, ref, trips, loads);
    expect(state).toMatchObject({ status: 'known', km: 150, loaded: 40, low: false, approximate: false, belowZero: false });
    if (state.status !== 'known') throw new Error('known');
    expect(state.liters).toBeCloseTo(190, 6);
    expect(state.share).toBeCloseTo(190 / 400, 6);
    expect(state.autonomyKm).toBeCloseTo(570, 6);
  });

  it('desde un tanque lleno: los kilómetros del viaje desde la carga y los viajes que empezaron después', () => {
    const full = receipt('f', { full_tank: true, recorded_at: at(12), trip_id: 't2', distance_meters: 50_000, liters: 380 });
    const trips = [trip('t1', at(6), 200, { endedAt: at(9) }), trip('t2', at(11), 110, { endedAt: at(15) }), trip('t3', at(16), 300, { active: true })];
    const state = tankState(settings, reference(), trips, [full, receipt('después', { recorded_at: at(17), liters: 60 })]);
    expect(state).toMatchObject({ status: 'known', km: 360, loaded: 60 });
    if (state.status !== 'known') throw new Error('known');
    expect(state.liters).toBeCloseTo(400 + 60 - 120, 6);
  });

  it('un viaje que iba en curso sin estar vinculado cuenta entero y el resultado es aproximado', () => {
    const full = receipt('f', { full_tank: true, recorded_at: at(12) });
    const state = tankState(settings, null, [trip('t1', at(10), 90, { active: true })], [full]);
    expect(state).toMatchObject({ status: 'known', km: 90, approximate: true });
    // A trip that had ended before does not count.
    expect(tankState(settings, null, [trip('t0', at(6), 90, { endedAt: at(9) })], [full])).toMatchObject({ status: 'known', km: 0, liters: 400 });
  });

  it('el viaje de la carga que todavía no mandó sus kilómetros no rompe el cálculo', () => {
    const full = receipt('f', { full_tank: true, recorded_at: at(12), trip_id: 't1', distance_meters: 80_000 });
    expect(tankState(settings, null, [trip('t1', at(10), 70, { active: true })], [full])).toMatchObject({ status: 'known', km: 0, liters: 400 });
  });

  it('avisa con poco combustible, y no da menos de cero', () => {
    const full = receipt('f', { full_tank: true, recorded_at: at(12) });
    expect(tankState(settings, null, [trip('t1', at(13), 1000)], [full])).toMatchObject({ status: 'known', low: true, belowZero: false });
    const empty = tankState(settings, null, [trip('t1', at(13), 1500)], [full]);
    expect(empty).toMatchObject({ status: 'known', liters: 0, low: true, belowZero: true, autonomyKm: 0 });
  });

  it('no adivina: una carga sin litros, más de lo que le entra o un viaje que perdió kilómetros', () => {
    const full = receipt('f', { full_tank: true, recorded_at: at(12) });
    const missing = tankState(settings, null, [], [full, receipt('sin', { recorded_at: at(13), liters: null })]);
    expect(missing).toMatchObject({ status: 'unknown', reason: 'La carga del 20/10 en Ancap Ruta 5 no tiene los litros: completalos en la boleta.' });
    expect(tankState(settings, null, [], [full, receipt('más', { recorded_at: at(13), liters: 100 })])).toMatchObject({ status: 'unknown' });
    // A few litres over are the pump's margin.
    expect(tankState(settings, null, [], [full, receipt('poco', { recorded_at: at(13), liters: 10 })])).toMatchObject({ status: 'known', liters: 400 });
    const ref = reference({ trip_meters: { t1: 100_000 } });
    expect(tankState(settings, ref, [trip('t1', at(8), 50)], [])).toMatchObject({ status: 'unknown' });
  });
});

describe('tanques: el consumo real y el formulario', () => {
  it('mide el consumo entre los dos últimos tanques llenos, con 100 km o más en el medio', () => {
    const trips = [trip('t1', at(9), 300, { endedAt: at(11) }), trip('t2', at(13), 300, { endedAt: at(15) }), trip('t3', at(17), 50, { endedAt: at(18) })];
    const loads = [
      receipt('a', { full_tank: true, recorded_at: at(8) }),
      receipt('medio', { recorded_at: at(12), liters: 50 }),
      receipt('b', { full_tank: true, recorded_at: at(16), liters: 150 }),
      receipt('c', { full_tank: true, recorded_at: at(19), liters: 20 }),
    ];
    const measured = measuredConsumption(KEY, trips, loads.slice(0, 3));
    expect(measured).toMatchObject({ km: 600, from: at(8), to: at(16) });
    expect(measured?.litersPer100).toBeCloseTo((200 / 600) * 100, 6);
    // Its trips are read from the full tank before the last one.
    expect(consumptionFrom(KEY, loads.slice(0, 3))).toBe(at(8));
    // The last two have too few kilometres in between: there is none, rather than an older one the screen would call theirs.
    expect(measuredConsumption(KEY, trips, loads)).toBeNull();
    expect(measuredConsumption(KEY, trips, loads.slice(0, 1))).toBeNull();
    expect(consumptionFrom(KEY, loads.slice(0, 1))).toBeNull();
  });

  it('no mide el consumo mientras el viaje de la primera carga no mandó sus metros', () => {
    // 80 km on the receipt; the trip has sent 70 so far.
    const loads = [receipt('a', { full_tank: true, recorded_at: at(8), trip_id: 't1', distance_meters: 80_000 }), receipt('b', { full_tank: true, recorded_at: at(16), liters: 150 })];
    const later = trip('t2', at(12), 300, { endedAt: at(15) });
    expect(measuredConsumption(KEY, [trip('t1', at(6), 70, { endedAt: at(11) }), later], loads)).toBeNull();
    // Once it has its 230 km: 150 km after the load and 300 more.
    expect(measuredConsumption(KEY, [trip('t1', at(6), 230, { endedAt: at(11) }), later], loads)?.litersPer100).toBeCloseTo((150 / 450) * 100, 6);
    // Nor while that trip has not reached the database at all.
    expect(measuredConsumption(KEY, [later], loads)).toBeNull();
  });

  it('el consumo se escribe en km por litro y se guarda en litros cada 100 km', () => {
    expect(litersPer100(4)).toBe(25);
    expect(kmPerLiter(25)).toBe(4);
    expect(defaultWarning(450)).toBe(90);
    expect(tankFormValues(settings)).toEqual({ capacity: '400', kmPerLiter: '3', warning: '80' });
    const ok = validateTankForm({ capacity: '450', kmPerLiter: '2,5', warning: '' });
    expect(ok.row).toEqual({ capacity_l: 450, consumption: 40, warning_l: 90 });
    expect(validateTankForm({ capacity: '', kmPerLiter: '30', warning: '500' }).errors).toEqual({
      capacity: 'Escribí cuántos litros le entran.',
      kmPerLiter: 'Entre 0,5 y 20 km por litro: un camión suele hacer entre 2 y 4.',
    });
    expect(validateTankForm({ capacity: '300', kmPerLiter: '3', warning: '301' }).errors).toEqual({ warning: 'No puede ser más de lo que le entra.' });
    expect(validateMeasurement('150', 400)).toEqual({ liters: 150, error: null });
    expect(validateMeasurement('401', 400).error).toBe('No le entran más de 400 litros.');
    expect(validateMeasurement('', 400).error).toBe('Escribí cuántos litros tiene.');
  });
});
