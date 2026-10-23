import { describe, expect, it } from 'vitest';
import {
  applicableRate,
  externalMaps,
  pointTitle,
  roadVehicleKey,
  sortedPoints,
  tollBalance,
  validatePoint,
  type TankReference,
  type TollMovement,
  type TollRate,
} from '../../src/lib/road';
const ref: TankReference = {
  vehicle_key: 'plate:abc1234',
  vehicle_name: 'Volvo · ABC1234',
  capacity_l: 400,
  liters: 200,
  consumption: 40,
  warning_l: 50,
  trip_meters: { a: 10000 },
  receipt_liters: { r: 100 },
  measured_at: '2026-10-21T10:00:00Z',
  updated_at: '2026-10-21T10:00:00Z',
};
describe('control de ruta', () => {
  it('keeps different plates separate, independent of model spelling', () => {
    expect(roadVehicleKey('Otro modelo · ABC1234')).toBe(ref.vehicle_key);
    expect(roadVehicleKey('Volvo · DEF')).not.toBe(ref.vehicle_key);
    expect(roadVehicleKey('Volvo')).toBe('model:volvo');
  });
  it('opens a valid static location and rejects missing/invalid fixes', () => {
    expect(externalMaps(-34, -56)?.google).toContain('-34%2C-56');
    expect(externalMaps(null, null)).toBeNull();
    expect(externalMaps(0, 0)).toBeNull();
    expect(externalMaps(100, -56)).toBeNull();
  });
  it('selects rate by actual time including offsets, never a future rate', () => {
    const rates = [
      { id: 'a', point_id: 'p', vehicle_key: ref.vehicle_key, amount: 200, valid_from: '2026-10-21T10:00:00-03:00' },
      { id: 'b', point_id: 'p', vehicle_key: ref.vehicle_key, amount: 300, valid_from: '2026-10-21T14:00:00Z' },
    ] as TollRate[];
    expect(applicableRate(rates, 'p', ref.vehicle_key, '2026-10-21T13:30:00Z')?.amount).toBe(200);
    expect(applicableRate(rates, 'p', 'plate:other', '2026-10-21T13:30:00Z')).toBeNull();
  });
  it('sums cents and only this truck', () => {
    expect(
      tollBalance(
        [
          { vehicle_key: 'a', amount: 0.1 },
          { vehicle_key: 'a', amount: 0.2 },
          { vehicle_key: 'b', amount: 999 },
        ] as TollMovement[],
        'a',
      ),
    ).toBe(0.3);
  });
  it('rejects impossible zones and limits', () => {
    const p = { name: 'Balanza', latitude: -34, longitude: -56, radius_m: 50, warning_m: 500, speed_limit: 5, notes: '' };
    expect(validatePoint(p)).toBeNull();
    expect(validatePoint({ ...p, warning_m: 60 })).not.toBeNull();
    expect(validatePoint({ ...p, speed_limit: -1 })).not.toBeNull();
  });

  it('names a point once: «Peaje Pando», not «Peaje · Peaje Pando»', () => {
    expect(pointTitle({ kind: 'toll', name: 'Peaje Pando' })).toBe('Peaje Pando');
    expect(pointTitle({ kind: 'scale', name: 'balanza Ruta 1' })).toBe('balanza Ruta 1');
    expect(pointTitle({ kind: 'toll', name: 'Peaje' })).toBe('Peaje');
    expect(pointTitle({ kind: 'toll', name: 'Queguay' })).toBe('Peaje · Queguay');
    expect(pointTitle({ kind: 'toll', name: 'Peajes del este' })).toBe('Peaje · Peajes del este');
    expect(pointTitle({ kind: 'radar', name: 'Ruta 5 km 30' })).toBe('Radar · Ruta 5 km 30');
    expect(pointTitle({ kind: 'place', name: 'Junco' })).toBe('Mi punto · Junco');
  });

  it('lists tolls, scales, radars and own points, each by name', () => {
    const points = [
      { kind: 'place', name: 'Depósito' },
      { kind: 'scale', name: 'Balanza Ruta 11' },
      { kind: 'radar', name: 'Radar Ruta 5' },
      { kind: 'toll', name: 'Peaje Solís' },
      { kind: 'scale', name: 'Balanza Ruta 2' },
      { kind: 'toll', name: 'peaje Cufré' },
    ] as const;
    expect(sortedPoints(points).map((p) => p.name)).toEqual([
      'peaje Cufré',
      'Peaje Solís',
      'Balanza Ruta 2',
      'Balanza Ruta 11',
      'Radar Ruta 5',
      'Depósito',
    ]);
    expect(points[0].name).toBe('Depósito');
  });
});
