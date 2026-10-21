import { describe, expect, it } from 'vitest';
import type { CatalogTruck } from '../../src/lib/fleet';
import {
  filterServices,
  kmReferences,
  kmSince,
  kmTripsAsCorrected,
  type MaintenanceRow,
  nextService,
  nextServiceId,
  OTHER_KIND,
  sameService,
  serviceFormValues,
  serviceFromRow,
  serviceVehicles,
  serviceViews,
  truckKms,
  validateServiceForm,
} from '../../src/lib/maintenance';

const catalog: CatalogTruck[] = [
  { model: 'Ford Cargo 1722', plate: 'JKL3456' },
  { model: 'Scania R450', plate: 'DEF5678' },
  { model: 'Volvo FH 460', plate: 'ABC1234' },
];

const row = (r: Partial<MaintenanceRow> & Pick<MaintenanceRow, 'id' | 'vehicle' | 'kind'>): MaintenanceRow => ({
  created_at: '2026-10-01T12:00:00+00:00',
  created_by: null,
  created_by_name: '',
  done_on: null,
  due_km: null,
  due_on: null,
  interval_km: null,
  notes: '',
  odometer_km: null,
  updated_at: '2026-10-01T12:00:00+00:00',
  updated_by: null,
  ...r,
});

const services = [
  row({ id: 'a', vehicle: 'Ford Cargo 1722 · JKL3456', kind: 'Cubiertas', done_on: '2026-09-27', odometer_km: 412_000 }),
  // An older service of the same truck with a lower odometer, saved with the older label: it does not count.
  row({ id: 'b', vehicle: 'Ford Cargo', kind: 'Frenos', done_on: '2026-08-01', odometer_km: 400_000 }),
  row({ id: 'c', vehicle: 'Ford Cargo 1722 · JKL3456', kind: 'Cambio de aceite', due_km: 412_500, interval_km: 10_000 }),
  row({ id: 'd', vehicle: 'Scania R450 · DEF5678', kind: 'Revisión general', done_on: '2026-09-15', odometer_km: 250_000 }),
  row({ id: 'e', vehicle: 'Volvo FH 460 · ABC1234', kind: 'Cambio de filtros', due_km: 160_000 }),
  row({ id: 'f', vehicle: 'Scania R450 · DEF5678', kind: 'Cambio de aceite', due_on: '2026-10-20' }),
].map((r) => serviceFromRow(r, catalog));

describe('kilometres of each truck', () => {
  const refs = kmReferences(services);
  it('start from the latest service done with the odometer written, under the catalog name', () => {
    expect(services[1]?.vehicle).toBe('Ford Cargo 1722 · JKL3456');
    expect(refs.get('Ford Cargo 1722 · JKL3456')).toEqual({ km: 412_000, day: '2026-09-27' });
    expect(refs.get('Scania R450 · DEF5678')).toEqual({ km: 250_000, day: '2026-09-15' });
    expect(refs.has('Volvo FH 460 · ABC1234')).toBe(false);
    expect(kmSince(refs)).toBe('2026-09-15');
    expect(kmSince(new Map())).toBeNull();
  });
  it('add the GPS kilometres of the trips from the day of that service, in Uruguay', () => {
    const kms = truckKms(
      refs,
      [
        { id: 't1', vehicle: 'Ford Cargo 1722 · JKL3456', started_at: '2026-10-15T09:00:00Z', distance_meters: 95_000 },
        // 23:30 of the 26th in Uruguay: the day before the service.
        { id: 't2', vehicle: 'Ford Cargo 1722 · JKL3456', started_at: '2026-09-27T02:30:00Z', distance_meters: 50_000 },
        // The same day as the service, with an older label.
        { id: 't3', vehicle: 'JKL3456', started_at: '2026-09-27T15:00:00Z', distance_meters: 400 },
        { id: 't4', vehicle: 'Scania R450 · DEF5678', started_at: '2026-10-15T14:00:00Z', distance_meters: 40_100 },
        { id: 't5', vehicle: 'Scania R450 · DEF5678', started_at: '2026-10-16T14:00:00Z', distance_meters: Number.NaN },
        { id: 't6', vehicle: 'Volvo FH 460 · ABC1234', started_at: '2026-10-15T14:00:00Z', distance_meters: 152_300 },
      ],
      catalog,
    );
    expect(kms.get('Ford Cargo 1722 · JKL3456')).toEqual({ reference: { km: 412_000, day: '2026-09-27' }, gpsKm: 95, estimate: 412_095 });
    expect(kms.get('Scania R450 · DEF5678')?.estimate).toBe(250_040);
    expect(kms.has('Volvo FH 460 · ABC1234')).toBe(false);
  });
});

describe('the trips the kilometres count', () => {
  it('are the app trips as the office left them: without the trash, with the truck it corrected', () => {
    const trips = [
      { id: 't1', vehicle: 'Scania R450 · DEF5678', started_at: '2026-10-15T14:00:00Z', distance_meters: 40_100 },
      { id: 't2', vehicle: 'Ford Cargo 1722 · JKL3456', started_at: '2026-10-15T09:00:00Z', distance_meters: 95_000 },
      { id: 't3', vehicle: 'Ford Cargo 1722 · JKL3456', started_at: '2026-10-15T11:30:00Z', distance_meters: 1_200 },
    ];
    const panel = [
      { app_trip_id: 't1', vehicle: 'Volvo FH 460 · ABC1234', deleted_at: null },
      { app_trip_id: 't2', vehicle: '  ', deleted_at: null },
      { app_trip_id: 't3', vehicle: null, deleted_at: '2026-10-15T14:00:00Z' },
      { app_trip_id: null, vehicle: 'Iveco Stralis · MNO7890', deleted_at: null },
    ];
    expect(kmTripsAsCorrected(trips, panel).map((t) => [t.id, t.vehicle])).toEqual([
      ['t1', 'Volvo FH 460 · ABC1234'],
      ['t2', 'Ford Cargo 1722 · JKL3456'],
    ]);
  });
});

describe('the list of services', () => {
  const kms = new Map([['Ford Cargo 1722 · JKL3456', { reference: { km: 412_000, day: '2026-09-27' }, gpsKm: 95, estimate: 412_095 }]]);
  const views = serviceViews(services, kms, '2026-10-15');
  it('to do first (late, coming up, planned, without a rule), then the ones done, latest first', () => {
    expect(views.map((v) => [v.id, v.status.state])).toEqual([
      ['f', 'soon'],
      ['c', 'soon'],
      ['e', 'pending'],
      ['a', 'done'],
      ['d', 'done'],
      ['b', 'done'],
    ]);
  });
  it('filters by what is to do or done, the truck and words', () => {
    expect(filterServices(views).map((v) => v.id)).toEqual(['f', 'c', 'e']);
    expect(filterServices(views, { view: 'hechos', vehicle: 'Ford Cargo 1722 · JKL3456' }).map((v) => v.id)).toEqual(['a', 'b']);
    expect(filterServices(views, { view: 'todos', q: 'aceite scania' }).map((v) => v.id)).toEqual(['f']);
  });
  it('offers the catalog trucks, then any other a service names', () => {
    expect(serviceVehicles([...services, serviceFromRow(row({ id: 'x', vehicle: 'Leyland · HTP1545', kind: 'Frenos' }), catalog)], catalog)).toEqual([
      'Ford Cargo 1722 · JKL3456',
      'Scania R450 · DEF5678',
      'Volvo FH 460 · ABC1234',
      'Leyland · HTP1545',
    ]);
  });
});

describe('the service form', () => {
  const today = '2026-10-15';
  const blank = serviceFormValues(null, 'Ford Cargo 1722 · JKL3456');
  it('starts a new service for the truck chosen, and shows a kind out of the list as written', () => {
    expect(blank).toMatchObject({ vehicle: 'Ford Cargo 1722 · JKL3456', kindChoice: '', done: false });
    const odd = serviceFormValues(serviceFromRow(row({ id: 'z', vehicle: 'Ford Cargo 1722 · JKL3456', kind: 'Embrague', done_on: '2026-10-01', odometer_km: 411_000 }), catalog));
    expect(odd).toMatchObject({ kindChoice: OTHER_KIND, kind: 'Embrague', done: true, doneOn: '2026-10-01', odometerKm: '411000' });
  });
  it('needs a truck and a kind; a service done, its day (not after today)', () => {
    const check = validateServiceForm({ ...blank, vehicle: '', done: true, doneOn: '2026-10-16' }, today);
    expect(check.ok).toBe(false);
    expect(check.errors).toMatchObject({ vehicle: 'Elegí el camión.', kindChoice: 'Elegí el tipo de service.', doneOn: 'No puede ser posterior a hoy.' });
    expect(validateServiceForm({ ...blank, kindChoice: OTHER_KIND, kind: '  ' }, today).errors.kind).toBe('Escribí el tipo de service.');
  });
  it('reads kilometres as typed in Uruguay, whole', () => {
    const check = validateServiceForm({ ...blank, kindChoice: 'Cambio de aceite', dueKm: '422.000', intervalKm: '10.000' }, today);
    expect(check.ok && check.payload).toEqual({ vehicle: 'Ford Cargo 1722 · JKL3456', kind: 'Cambio de aceite', due_on: null, due_km: 422_000, interval_km: 10_000, done_on: null, notes: '' });
    expect(validateServiceForm({ ...blank, kindChoice: 'Cambio de aceite', dueKm: '412,5' }, today).errors.dueKm).toBe('Escribí los kilómetros sin decimales.');
    expect(validateServiceForm({ ...blank, kindChoice: 'Cambio de aceite', intervalKm: '0' }, today).errors.intervalKm).toBe('Tiene que ser de 1 km o más.');
  });
  it('a service that repeats and is done needs the odometer of that day, and makes the next one', () => {
    const done = { ...blank, kindChoice: 'Cambio de aceite', intervalKm: '10000', done: true, doneOn: '2026-10-14' };
    expect(validateServiceForm(done, today).errors.odometerKm).toBe('Para agendar el próximo, escribí el kilometraje del día en que se hizo.');
    const check = validateServiceForm({ ...done, odometerKm: '412.480' }, today);
    expect(check.ok && check.payload).toMatchObject({ done_on: '2026-10-14', odometer_km: 412_480, interval_km: 10_000 });
    expect(nextService({ vehicle: 'Ford Cargo 1722 · JKL3456', kind: 'Cambio de aceite', done_on: '2026-10-14', odometer_km: 412_480, interval_km: 10_000 }, 'n1', 'Socio Lectura')).toEqual({
      id: 'n1',
      vehicle: 'Ford Cargo 1722 · JKL3456',
      kind: 'Cambio de aceite',
      interval_km: 10_000,
      due_km: 422_480,
      created_by_name: 'Socio Lectura',
    });
    expect(nextService({ vehicle: 'x', kind: 'y', done_on: null, odometer_km: 1, interval_km: 1 }, 'n2', '')).toBeNull();
  });
  it('the next one has the same id for everyone who marks the service done the same way', async () => {
    const done = { id: '70000000-0000-4000-8000-000000000004', odometer_km: 412_480, interval_km: 10_000 };
    const id = await nextServiceId(done);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await nextServiceId({ ...done })).toBe(id);
    expect(id).not.toBe(done.id);
    // Other kilometres, or another service, make another next one.
    expect(await nextServiceId({ ...done, odometer_km: 412_500 })).not.toBe(id);
    expect(await nextServiceId({ ...done, interval_km: 15_000 })).not.toBe(id);
    expect(await nextServiceId({ ...done, id: '70000000-0000-4000-8000-000000000001' })).not.toBe(id);
  });
  it('checks and sends only the fields on screen: what is hidden stays as it is', () => {
    const check = validateServiceForm({ ...blank, kindChoice: 'Frenos', odometerKm: '999' }, today);
    expect(check.ok && 'odometer_km' in check.payload).toBe(false);
    // Kilometres typed wrong while it was to do, then marked done: the planned date and kilometres are not on screen.
    const done = validateServiceForm({ ...blank, kindChoice: 'Frenos', dueKm: '412,5', dueOn: '31/02', done: true, doneOn: today }, today);
    expect(done.ok).toBe(true);
    expect(done.ok && ['due_on', 'due_km'].some((k) => k in done.payload)).toBe(false);
  });
  it('knows a save tried again that found what it sent', () => {
    const saved = row({ id: 'a', vehicle: 'Ford Cargo 1722 · JKL3456', kind: 'Frenos', due_km: 420_000 });
    expect(sameService(saved, { id: 'a', vehicle: 'Ford Cargo 1722 · JKL3456', kind: 'Frenos', due_km: 420_000, due_on: null, done_on: null, interval_km: null, notes: '' })).toBe(true);
    expect(sameService(saved, { id: 'a', vehicle: 'Ford Cargo 1722 · JKL3456', kind: 'Frenos', due_km: 421_000 })).toBe(false);
    // A change marking it done does not send the planned kilometres: they are not checked.
    const done = { ...saved, done_on: '2026-10-15', odometer_km: 419_800 };
    expect(sameService(done, { vehicle: 'Ford Cargo 1722 · JKL3456', kind: 'Frenos', done_on: '2026-10-15', odometer_km: 419_800, interval_km: null, notes: '' })).toBe(true);
    expect(sameService(done, { vehicle: 'Ford Cargo 1722 · JKL3456', kind: 'Frenos', done_on: '2026-10-14', odometer_km: 419_800, interval_km: null, notes: '' })).toBe(false);
  });
});
