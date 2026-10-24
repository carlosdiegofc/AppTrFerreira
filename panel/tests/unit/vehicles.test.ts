import { describe, expect, it } from 'vitest';
import { number } from '../../src/lib/format';
import {
  attention,
  byAttention,
  capacityText,
  driversByMonth,
  type Hitch,
  hitchDays,
  makeLine,
  normalPlate,
  samePlate,
  splitMake,
  trailerLabel,
  trailerTrucks,
  truckEntries,
  truckIdentity,
  truckKey,
  truckTrailers,
  validateHitch,
  validateUnhitch,
  validateVehicle,
  type Vehicle,
  vehicleFormValues,
  vehicleFromRow,
} from '../../src/lib/vehicles';

const TODAY = '2026-10-24';
const VOLVO = { model: 'Volvo FH 460', plate: 'ABC1234' };
const SCANIA = { model: 'Scania R450', plate: 'DEF5678' };

const vehicle = (extra: Partial<Vehicle> = {}): Vehicle => ({
  id: 'v1',
  kind: 'truck',
  key: 'plate:abc1234',
  plate: 'ABC1234',
  brand: 'Volvo',
  model: 'FH 460',
  body: '',
  year: 2018,
  chassis: '',
  engine: '',
  capacity: null,
  capacityUnit: null,
  notes: '',
  photoPath: null,
  leftOn: null,
  leftReason: '',
  updatedAt: '2026-10-01T00:00:00Z',
  ...extra,
});

const hitch = (extra: Partial<Hitch> = {}): Hitch => ({
  id: 'h1',
  trailerId: 't1',
  truckKey: 'plate:abc1234',
  fromOn: '2025-03-01',
  toOn: null,
  notes: '',
  deleted: false,
  updatedAt: '2026-10-01T00:00:00Z',
  ...extra,
});

describe('flota: la ficha', () => {
  it('lee la fila como la guardó la base', () => {
    const v = vehicleFromRow({
      id: 'v9',
      kind: 'trailer',
      vehicle_key: 'plate:cis2002',
      plate: 'CIS2002',
      brand: ' Facchini ',
      model: 'Cisterna 30',
      body: 'Cisterna',
      year: 2016,
      chassis: '',
      engine: '',
      capacity: 30 as unknown as number,
      capacity_unit: 'm3',
      notes: '',
      photo_path: null,
      left_on: null,
      left_reason: '',
      created_at: '',
      created_by: null,
      updated_at: '2026-10-01T00:00:00Z',
      updated_by: null,
    });
    expect(v).toMatchObject({ kind: 'trailer', key: 'plate:cis2002', brand: 'Facchini', capacity: 30, capacityUnit: 'm3' });
    expect(trailerLabel(v)).toBe('Cisterna Facchini · CIS2002');
    expect(trailerLabel({ body: '', brand: '', plate: 'X1' })).toBe('Acoplado · X1');
    expect(capacityText(v, number)).toBe('30 m³');
    expect(capacityText({ capacity: 28000, capacityUnit: 'kg' }, number)).toBe('28.000 kg');
    expect(makeLine(vehicle())).toBe('Volvo FH 460 · 2018');
    expect(makeLine(vehicle({ brand: '', model: '', year: null }))).toBeNull();
  });

  it('la clave de un camión es la de su tanque, y la marca sale del nombre del catálogo', () => {
    expect(truckKey(VOLVO)).toBe('plate:abc1234');
    expect(truckKey({ model: 'Leyland', plate: '' })).toBe('model:leyland');
    expect(splitMake('Mercedes Benz 1630')).toEqual({ brand: 'Mercedes Benz', model: '1630' });
    expect(splitMake('Ford Cargo 1722')).toEqual({ brand: 'Ford', model: 'Cargo 1722' });
    expect(splitMake('Leyland')).toEqual({ brand: 'Leyland', model: '' });
    expect(splitMake('Fordson tractor')).toEqual({ brand: '', model: 'Fordson tractor' });
    expect(vehicleFormValues(null, VOLVO)).toMatchObject({ brand: 'Volvo', model: 'FH 460', capacityUnit: 'kg' });
    expect(normalPlate(' rem 1001 ')).toBe('REM1001');
    expect(normalPlate('abc-1234')).toBe('ABC1234');
  });

  it('valida la ficha de un camión con su camión del catálogo', () => {
    const values = { ...vehicleFormValues(null, SCANIA), year: '2020', capacity: '32.000', chassis: ' 9bsr4x ' };
    const { row, errors } = validateVehicle(values, 'truck', TODAY, truckIdentity(null, SCANIA), new Set());
    expect(errors).toEqual({});
    expect(row).toMatchObject({ kind: 'truck', vehicle_key: 'plate:def5678', plate: 'DEF5678', brand: 'Scania', model: 'R450', year: 2020, capacity: 32000, capacity_unit: 'kg', chassis: '9BSR4X', body: '', left_on: null });
    // Without its truck there is nothing to join the card to.
    expect(validateVehicle(values, 'truck', TODAY, null, new Set()).errors.plate).toBe('Elegí el camión.');
    // A card already saved keeps its own truck, even if the catalog no longer has it.
    expect(truckIdentity(vehicle(), null)).toEqual({ plate: 'ABC1234', key: 'plate:abc1234' });
  });

  it('valida un acoplado: matrícula propia, año, capacidad y baja', () => {
    const base = { ...vehicleFormValues(null), plate: 'rem 1001', body: 'Semirremolque', capacity: '28000' };
    const ok = validateVehicle(base, 'trailer', TODAY, null, new Set(['plate:abc1234']));
    expect(ok.row).toMatchObject({ kind: 'trailer', plate: 'REM1001', vehicle_key: 'plate:rem1001', body: 'Semirremolque', capacity: 28000 });
    const check = (patch: Partial<typeof base>, taken: string[] = []) => validateVehicle({ ...base, ...patch }, 'trailer', TODAY, null, new Set(taken)).errors;
    expect(check({ plate: '' }).plate).toBe('Escribí la matrícula.');
    expect(check({ plate: 'ABC.1234' }).plate).toBe('Solo letras y números.');
    expect(check({ plate: 'ABC1234' }, ['plate:abc1234']).plate).toBe('Ya hay un camión o un acoplado con esa matrícula.');
    expect(check({ year: '1900' }).year).toBe('Escribí un año entre 1950 y 2027.');
    expect(check({ year: '2028' }).year).toBe('Escribí un año entre 1950 y 2027.');
    expect(check({ year: '20a6' }).year).toBe('Escribí un año entre 1950 y 2027.');
    expect(check({ capacity: '0' }).capacity).toBe('Tiene que ser mayor que cero.');
    expect(check({ capacity: '12,345' }).capacity).toBe('Hasta dos decimales.');
    expect(check({ capacity: '30', capacityUnit: 'm3' })).toEqual({});
    expect(validateVehicle({ ...base, capacity: '30', capacityUnit: 'm3' }, 'trailer', TODAY, null, new Set()).row).toMatchObject({ capacity: 30, capacity_unit: 'm3' });
    expect(validateVehicle({ ...base, capacity: '' }, 'trailer', TODAY, null, new Set()).row).toMatchObject({ capacity: null, capacity_unit: null });
    expect(check({ gone: true, leftOn: '' }).leftOn).toBe('Elegí el día en que se vendió o dejó de usarse.');
    expect(check({ gone: true, leftOn: '2026-10-25' }).leftOn).toBe('No puede ser posterior a hoy.');
    expect(validateVehicle({ ...base, gone: true, leftOn: '2026-10-01', leftReason: ' Vendido ' }, 'trailer', TODAY, null, new Set()).row).toMatchObject({ left_on: '2026-10-01', left_reason: 'Vendido' });
    // The reason of a card that is not sold is not kept.
    expect(validateVehicle({ ...base, gone: false, leftOn: '2026-10-01', leftReason: 'Vendido' }, 'trailer', TODAY, null, new Set()).row).toMatchObject({ left_on: null, left_reason: '' });
  });
});

describe('flota: qué acoplado lleva cada camión', () => {
  const list = [
    hitch({ id: 'old', trailerId: 't0', fromOn: '2023-01-10', toOn: '2025-02-28' }),
    hitch({ id: 'now', trailerId: 't1', fromOn: '2025-03-01' }),
    hitch({ id: 'wrong', trailerId: 't2', fromOn: '2025-02-01', toOn: '2025-02-10', deleted: true }),
    hitch({ id: 'other', trailerId: 't3', truckKey: 'plate:def5678', fromOn: '2026-01-01' }),
  ];

  it('el actual, los anteriores y los anulados aparte', () => {
    const volvo = truckTrailers('plate:abc1234', list);
    expect(volvo.current?.id).toBe('now');
    expect(volvo.past.map((h) => h.id)).toEqual(['old']);
    expect(trailerTrucks('t0', list)).toEqual({ current: null, past: [list[0]] });
    expect(trailerTrucks('t2', list)).toEqual({ current: null, past: [] });
    expect(hitchDays(list[0] as Hitch)).toBe('Del 10/01/2023 al 28/02/2025');
    expect(hitchDays(list[1] as Hitch)).toBe('Desde el 01/03/2025');
  });

  it('un acoplado nuevo va desde un día posterior al del actual y al del camión en el que estaba', () => {
    const now = { trailerId: 't1', fromOn: '2025-03-01' };
    expect(validateHitch({ trailerId: 't3', fromOn: '2026-10-01', notes: '' }, TODAY, now, { fromOn: '2026-01-01' })).toEqual({ errors: {}, ok: true });
    expect(validateHitch({ trailerId: '', fromOn: '2026-10-01', notes: '' }, TODAY, now, null).errors.trailerId).toBe('Elegí el acoplado.');
    expect(validateHitch({ trailerId: 't1', fromOn: '2026-10-01', notes: '' }, TODAY, now, null).errors.trailerId).toBe('Ya lleva ese acoplado.');
    expect(validateHitch({ trailerId: 't3', fromOn: '', notes: '' }, TODAY, now, null).errors.fromOn).toBe('Elegí desde qué día lo lleva.');
    expect(validateHitch({ trailerId: 't3', fromOn: '2026-10-25', notes: '' }, TODAY, now, null).errors.fromOn).toBe('No puede ser posterior a hoy.');
    expect(validateHitch({ trailerId: 't3', fromOn: '2025-03-01', notes: '' }, TODAY, now, null).errors.fromOn).toBe('Tiene que ser posterior al 01/03/2025, cuando enganchó el que lleva ahora.');
    expect(validateHitch({ trailerId: 't3', fromOn: '2026-01-01', notes: '' }, TODAY, null, { fromOn: '2026-01-01' }).errors.fromOn).toBe(
      'Tiene que ser posterior al 01/01/2026, cuando lo engancharon al camión en el que va.',
    );
    expect(validateHitch({ trailerId: 't3', fromOn: '2026-10-01', notes: 'x'.repeat(501) }, TODAY, null, null).errors.notes).toBe('Hasta 500 caracteres.');
  });

  it('desenganchar: hasta un día entre el enganche y hoy', () => {
    expect(validateUnhitch('2026-10-20', { fromOn: '2025-03-01' }, TODAY)).toBeNull();
    expect(validateUnhitch('2025-03-01', { fromOn: '2025-03-01' }, TODAY)).toBeNull();
    expect(validateUnhitch('2025-02-28', { fromOn: '2025-03-01' }, TODAY)).toBe('No puede ser anterior al 01/03/2025, cuando lo enganchó.');
    expect(validateUnhitch('2026-10-25', { fromOn: '2025-03-01' }, TODAY)).toBe('No puede ser posterior a hoy.');
    expect(validateUnhitch('', { fromOn: '2025-03-01' }, TODAY)).toBe('Elegí hasta qué día lo llevó.');
  });
});

describe('flota: la lista', () => {
  it('los camiones del catálogo con su ficha y su acoplado; las fichas que ya no están en el catálogo y los vendidos aparte', () => {
    const trailer = vehicle({ id: 't1', kind: 'trailer', key: 'plate:rem1001', plate: 'REM1001', body: 'Semirremolque', brand: 'Randon' });
    const gone = vehicle({ id: 'v2', key: 'plate:xyz0001', plate: 'XYZ0001', brand: 'Leyland', model: 'Roadtrain', leftOn: '2026-01-31' });
    const outside = vehicle({ id: 'v3', key: 'plate:out0001', plate: 'OUT0001', brand: 'Fiat', model: '619' });
    const { current, gone: sold } = truckEntries([SCANIA, VOLVO, VOLVO], [vehicle(), trailer, gone, outside], [hitch()]);
    expect(current.map((e) => e.label)).toEqual(['Fiat 619 · OUT0001', 'Scania R450 · DEF5678', 'Volvo FH 460 · ABC1234']);
    const volvo = current.find((e) => e.key === 'plate:abc1234');
    expect(volvo?.card?.id).toBe('v1');
    expect(volvo?.trailer?.plate).toBe('REM1001');
    expect(current.find((e) => e.key === 'plate:def5678')).toMatchObject({ card: null, trailer: null, hitch: null });
    expect(current.find((e) => e.key === 'plate:out0001')?.truck).toBeNull();
    expect(sold.map((e) => e.label)).toEqual(['Leyland Roadtrain · XYZ0001']);
  });

  it('primero lo vencido y el combustible bajo, después lo que viene', () => {
    expect(attention(['ok', 'late'], [], false)).toBe('late');
    expect(attention([], ['soon'], false)).toBe('soon');
    expect(attention(['soon'], ['late'], false)).toBe('late');
    expect(attention(['ok'], ['planned', 'done'], true)).toBe('late');
    expect(attention(['nodate'], ['pending'], false)).toBeNull();
    const sorted = byAttention([
      { label: 'B', attention: null },
      { label: 'A', attention: null },
      { label: 'C', attention: 'soon' as const },
      { label: 'D', attention: 'late' as const },
    ]);
    expect(sorted.map((x) => x.label)).toEqual(['D', 'C', 'A', 'B']);
  });

  it('un papel es del acoplado por la matrícula, aunque tenga otro nombre', () => {
    expect(samePlate('Semirremolque Randon · REM1001', 'REM1001')).toBe(true);
    expect(samePlate('Acoplado · rem-1001', 'REM1001')).toBe(true);
    expect(samePlate('Volvo FH 460 · ABC1234', 'REM1001')).toBe(false);
    expect(samePlate('REM1001', 'REM1001')).toBe(false);
  });

  it('quién lo manejó cada mes, según sus viajes', () => {
    const trip = (driverName: string | null, departureAt: string, gpsKm: number, extra = {}) => ({ vehicle: 'Volvo FH 460 · ABC1234', driverName, departureAt, gpsKm, deleted: false, ...extra });
    const months = driversByMonth(
      [
        trip('Ana Pereira', '2026-10-02T12:00:00Z', 300),
        trip('Bruno Díaz', '2026-10-05T12:00:00Z', 500),
        trip('Ana Pereira', '2026-10-09T12:00:00Z', 250),
        trip('Ana Pereira', '2026-09-30T12:00:00Z', 100),
        // The first hours of the 1st of October in Uruguay are still the 30th of September in UTC.
        trip('Bruno Díaz', '2026-10-01T02:00:00Z', 50),
        trip(null, '2026-09-10T12:00:00Z', 40),
        trip('Carla Méndez', '2026-10-10T12:00:00Z', 900, { deleted: true }),
        trip('Diego Silva', '2026-10-11T12:00:00Z', 900, { vehicle: 'Scania R450 · DEF5678' }),
      ],
      'Volvo FH 460 · ABC1234',
    );
    expect(months).toEqual([
      { month: '2026-10-01', drivers: [{ name: 'Ana Pereira', trips: 2, km: 550 }, { name: 'Bruno Díaz', trips: 1, km: 500 }] },
      { month: '2026-09-01', drivers: [{ name: 'Ana Pereira', trips: 1, km: 100 }, { name: 'Bruno Díaz', trips: 1, km: 50 }, { name: 'Sin chofer', trips: 1, km: 40 }] },
    ]);
  });
});
