import { describe, expect, it } from 'vitest';
import {
  byCategory,
  byTarget,
  type Expense,
  type ExpenseFormValues,
  expenseFormValues,
  expenseFromRow,
  type ExpenseRow,
  expensesLink,
  expenseTotals,
  filterExpenses,
  filterLabel,
  knownSuppliers,
  NO_NAMES,
  OTHER_CATEGORY,
  presetOf,
  serviceCategory,
  serviceCosts,
  targetChoices,
  targetLabel,
  type TargetNames,
  tripTargetName,
  validateExpense,
  writtenCategories,
} from '../../src/lib/expenses';
import type { Vehicle } from '../../src/lib/vehicles';

const row = (extra: Partial<ExpenseRow> = {}): ExpenseRow => ({
  id: 'b0000000-0000-4000-8000-000000000001',
  spent_on: '2026-10-12',
  category: 'Reparación y repuestos',
  amount: 18500,
  currency: 'UYU',
  target: 'truck',
  vehicle_key: 'plate:abc1234',
  trailer_id: null,
  driver_id: null,
  trip_key: null,
  target_name: 'Volvo FH 460 · ABC1234',
  service_id: null,
  supplier: 'Taller El Ruso',
  method: 'transferencia',
  notes: '',
  file_path: null,
  deleted_at: null,
  created_at: '2026-10-12T15:00:00Z',
  created_by: null,
  updated_at: '2026-10-12T15:00:00Z',
  updated_by: null,
  ...extra,
});

let n = 0;
const expense = (extra: Partial<Expense> = {}): Expense => {
  n++;
  return {
    ...expenseFromRow(row({ id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, created_at: `2026-10-01T00:00:${String(n % 60).padStart(2, '0')}Z`, supplier: '' })),
    ...extra,
  };
};

const names: TargetNames = {
  trucks: new Map([['plate:abc1234', 'Volvo FH 460 · ABC1234']]),
  trailers: new Map([['t1', 'Semirremolque Randon · REM1001']]),
  drivers: new Map([['d1', 'Bruno Díaz']]),
};

describe('expenseFromRow', () => {
  it('reads what the expense goes to, its invoice and whether it counts', () => {
    const e = expenseFromRow(row({ file_path: 'b0000000-0000-4000-8000-000000000001/b1000000-0000-4000-8000-000000000001.pdf' }));
    expect(e).toMatchObject({ target: 'truck', targetKey: 'camion:plate:abc1234', amount: 18500, currency: 'UYU', method: 'transferencia', deleted: false });
    expect(e.file).toEqual({ path: 'b0000000-0000-4000-8000-000000000001/b1000000-0000-4000-8000-000000000001.pdf', type: 'pdf' });
    expect(expenseFromRow(row({ target: 'company', vehicle_key: null })).targetKey).toBe('empresa');
    expect(expenseFromRow(row({ target: 'trip', vehicle_key: null, trip_key: 'app:x' })).targetKey).toBe('viaje:app:x');
    expect(expenseFromRow(row({ target: 'trailer', vehicle_key: null, trailer_id: 't1' })).targetKey).toBe('acoplado:t1');
    expect(expenseFromRow(row({ target: 'driver', vehicle_key: null, driver_id: 'd1' })).targetKey).toBe('chofer:d1');
    expect(expenseFromRow(row({ deleted_at: '2026-10-13T00:00:00Z', method: 'raro', currency: 'USD' }))).toMatchObject({ deleted: true, method: 'otro', currency: 'USD' });
  });
});

describe('targetLabel', () => {
  it('names it as the lists do now, or as it was saved', () => {
    const e = expense();
    expect(targetLabel(e, names)).toBe('Volvo FH 460 · ABC1234');
    expect(targetLabel({ ...e, vehicleKey: 'plate:zzz9999', targetName: 'Scania vieja · ZZZ9999' }, names)).toBe('Scania vieja · ZZZ9999');
    expect(targetLabel({ ...e, vehicleKey: 'plate:zzz9999', targetName: '' }, names)).toBe('ZZZ9999');
    expect(targetLabel({ ...e, target: 'trailer', trailerId: 't1' }, names)).toBe('Semirremolque Randon · REM1001');
    expect(targetLabel({ ...e, target: 'driver', driverId: 'd1' }, names)).toBe('Bruno Díaz');
    expect(targetLabel({ ...e, target: 'trip', targetName: 'Orden de carga 24129 · Paysandú → Salto' }, names)).toBe('Orden de carga 24129 · Paysandú → Salto');
    expect(targetLabel({ ...e, target: 'company' }, names)).toBe('La empresa');
  });
});

describe('filterExpenses', () => {
  const list = [
    expense({ spentOn: '2026-10-12', category: 'Reparación y repuestos', supplier: 'Taller El Ruso' }),
    expense({ spentOn: '2026-10-05', category: 'Seguro', target: 'company', targetKey: 'empresa', vehicleKey: null, currency: 'USD', amount: 950 }),
    expense({ spentOn: '2026-10-08', category: 'lavado ', target: 'trailer', targetKey: 'acoplado:t1', vehicleKey: null, trailerId: 't1' }),
    expense({ spentOn: '2026-09-21', category: 'Patente e impuestos' }),
    expense({ spentOn: '2026-10-03', category: 'Multas', deleted: true }),
  ];

  it('keeps the period, the kind however it was written, what it goes to and the search, newest first', () => {
    expect(filterExpenses(list, { from: '2026-10-01', to: '2026-10-31' }).map((e) => e.spentOn)).toEqual(['2026-10-12', '2026-10-08', '2026-10-05']);
    expect(filterExpenses(list, { category: 'Lavado' })).toHaveLength(1);
    expect(filterExpenses(list, { target: 'camiones' }).map((e) => e.spentOn)).toEqual(['2026-10-12', '2026-09-21']);
    expect(filterExpenses(list, { target: 'acoplado:t1' })).toHaveLength(1);
    expect(filterExpenses(list, { target: 'empresa' })).toHaveLength(1);
    expect(filterExpenses(list, { q: 'ruso taller' })).toHaveLength(1);
    // The search finds what it goes to by its name now.
    expect(filterExpenses(list, { q: 'randon' }, names)).toHaveLength(1);
  });

  it('shows the annulled ones apart', () => {
    expect(filterExpenses(list, {}).some((e) => e.deleted)).toBe(false);
    expect(filterExpenses(list, { annulled: true }).map((e) => e.category)).toEqual(['Multas']);
  });
});

describe('sums', () => {
  it('adds pesos and dollars apart, to the cent, and counts the ones without invoice', () => {
    const t = expenseTotals([expense({ amount: 0.1 }), expense({ amount: 0.2 }), expense({ amount: 950, currency: 'USD', file: { path: 'a/b.jpg', type: 'photo' } })]);
    expect(t).toEqual({ count: 3, amounts: { UYU: 0.3, USD: 950 }, withoutFile: 2 });
  });

  it('groups by kind, a kind written another way with the listed one, the biggest first', () => {
    const groups = byCategory([
      expense({ category: 'Lavado', amount: 900 }),
      expense({ category: 'lavado', amount: 100 }),
      expense({ category: 'Reparación y repuestos', amount: 18500 }),
      expense({ category: 'Seguro', amount: 950, currency: 'USD' }),
      expense({ category: 'Balanza', amount: 300 }),
    ]);
    expect(groups.map((g) => [g.label, g.amounts.UYU, g.amounts.USD, g.count])).toEqual([
      ['Reparación y repuestos', 18500, 0, 1],
      ['Lavado', 1000, 0, 2],
      ['Balanza', 300, 0, 1],
      ['Seguro', 0, 950, 1],
    ]);
    // Its key filters the list.
    expect(groups[1]?.key).toBe('Lavado');
  });

  it('groups by what it went to, named as the lists name it now', () => {
    const groups = byTarget([expense({ amount: 100 }), expense({ amount: 200 }), expense({ target: 'driver', targetKey: 'chofer:d1', driverId: 'd1', vehicleKey: null, amount: 50 })], names);
    expect(groups.map((g) => [g.key, g.label, g.amounts.UYU])).toEqual([
      ['camion:plate:abc1234', 'Volvo FH 460 · ABC1234', 300],
      ['chofer:d1', 'Bruno Díaz', 50],
    ]);
  });

  it('finds the cost that counts of each service', () => {
    const counted = expense({ serviceId: 's1' });
    const costs = serviceCosts([expense({ serviceId: 's1', deleted: true }), counted, expense()]);
    expect([...costs.keys()]).toEqual(['s1']);
    expect(costs.get('s1')).toBe(counted);
  });
});

describe('names for a new expense', () => {
  it('takes the kind of a service when it is one of the list', () => {
    expect(serviceCategory('Cubiertas')).toBe('Cubiertas');
    expect(serviceCategory('cubiertas ')).toBe('Cubiertas');
    expect(serviceCategory('Cambio de aceite')).toBe('Service');
  });

  it('names a trip by its order, or by its driver and day', () => {
    const trip = { orderNumber: '24129', driverName: 'Diego Silva', originName: 'Paysandú', destinationName: 'Salto', departureAt: '2026-10-15T09:00:00Z' };
    expect(tripTargetName(trip)).toBe('Orden de carga 24129 · Paysandú → Salto');
    expect(tripTargetName({ ...trip, orderNumber: null, originName: null })).toBe('Viaje de Diego Silva · a Salto');
    expect(tripTargetName({ ...trip, orderNumber: null, originName: null, destinationName: null })).toBe('Viaje de Diego Silva · del 15/10/2026');
    expect(tripTargetName({ ...trip, orderNumber: null, driverName: null, originName: null, destinationName: null, departureAt: null })).toBe('Viaje de chofer sin indicar');
  });

  it('suggests the suppliers and the kinds written before', () => {
    const list = [expense({ supplier: 'BSE', createdAt: '2026-10-01T00:00:00Z' }), expense({ supplier: 'Taller El Ruso', createdAt: '2026-10-02T00:00:00Z' }), expense({ supplier: 'bse', createdAt: '2026-09-01T00:00:00Z' }), expense({ supplier: '' })];
    expect(knownSuppliers(list)).toEqual(['Taller El Ruso', 'BSE']);
    expect(writtenCategories([expense({ category: 'Balanza' }), expense({ category: 'balanza' }), expense({ category: 'Cubiertas' }), expense({ category: 'Alquiler' })])).toEqual(['Alquiler', 'Balanza']);
  });
});

describe('the form', () => {
  const valid = (extra: Partial<ExpenseFormValues> = {}): ExpenseFormValues => ({ ...expenseFormValues(null, '2026-10-15'), categoryChoice: 'Lavado', amount: '1.250,50', ...extra });

  it('starts a new expense today, for the company, or with what it is noted from', () => {
    expect(expenseFormValues(null, '2026-10-15')).toMatchObject({ spentOn: '2026-10-15', target: 'company', currency: 'UYU', method: 'transferencia', categoryChoice: '' });
    const fromService = expenseFormValues(null, '2026-10-15', { target: 'truck', ref: 'plate:jkl3456', spentOn: '2026-09-27', category: 'Cubiertas' });
    expect(fromService).toMatchObject({ target: 'truck', vehicleKey: 'plate:jkl3456', spentOn: '2026-09-27', categoryChoice: 'Cubiertas' });
    // A day after today is not offered.
    expect(expenseFormValues(null, '2026-10-15', { spentOn: '2026-10-20' }).spentOn).toBe('2026-10-15');
    // A kind written by hand goes to «Otro».
    expect(expenseFormValues(null, '2026-10-15', { category: 'Balanza' })).toMatchObject({ categoryChoice: OTHER_CATEGORY, category: 'Balanza' });
  });

  it('opens an expense as it is', () => {
    const v = expenseFormValues(expense({ amount: 7300.5, category: 'Balanza', target: 'driver', vehicleKey: null, driverId: 'd1' }), '2026-10-15');
    expect(v).toMatchObject({ amount: '7300,5', categoryChoice: OTHER_CATEGORY, category: 'Balanza', target: 'driver', driverId: 'd1', vehicleKey: '' });
  });

  it('saves only the reference of what it goes to, and its name', () => {
    const truck = validateExpense(valid({ target: 'truck', vehicleKey: 'plate:abc1234', driverId: 'd1', supplier: '  Lavadero   Ruta 1 ' }), '2026-10-15', 'Volvo FH 460 · ABC1234');
    expect(truck.errors).toEqual({});
    expect(truck.row).toMatchObject({ amount: 1250.5, category: 'Lavado', target: 'truck', vehicle_key: 'plate:abc1234', driver_id: null, trailer_id: null, trip_key: null, target_name: 'Volvo FH 460 · ABC1234', supplier: 'Lavadero Ruta 1' });
    const company = validateExpense(valid({ vehicleKey: 'plate:abc1234' }), '2026-10-15', 'algo');
    expect(company.row).toMatchObject({ target: 'company', vehicle_key: null, target_name: '' });
    const written = validateExpense(valid({ categoryChoice: OTHER_CATEGORY, category: '  Balanza   del puerto ' }), '2026-10-15', '');
    expect(written.row?.category).toBe('Balanza del puerto');
  });

  it('says what is wrong with each field', () => {
    const { row: none, errors } = validateExpense(valid({ spentOn: '2026-10-16', categoryChoice: '', amount: '0', target: 'trip', tripKey: '', method: 'trueque' as ExpenseFormValues['method'] }), '2026-10-15', '');
    expect(none).toBeNull();
    expect(errors).toEqual({
      spentOn: 'La fecha no puede ser posterior a hoy.',
      categoryChoice: 'Elegí el tipo de gasto.',
      amount: 'Tiene que ser mayor que cero.',
      tripKey: 'Elegí el viaje.',
      method: 'Elegí cómo se pagó.',
    });
    expect(validateExpense(valid({ target: 'trailer' }), '2026-10-15', '').errors).toEqual({ trailerId: 'Elegí el acoplado.' });
    expect(validateExpense(valid({ target: 'driver' }), '2026-10-15', '').errors).toEqual({ driverId: 'Elegí el chofer.' });
    expect(validateExpense(valid({ target: 'trip', tripKey: 'app:123' }), '2026-10-15', '').errors).toEqual({ tripKey: 'Elegí el viaje de la lista.' });
    expect(validateExpense(valid({ categoryChoice: OTHER_CATEGORY, category: ' ' }), '2026-10-15', '').errors).toEqual({ category: 'Escribí el tipo de gasto.' });
    expect(validateExpense(valid({ spentOn: '1999-12-31' }), '2026-10-15', '').errors).toEqual({ spentOn: 'Elegí la fecha del gasto.' });
    expect(validateExpense(valid({ amount: '12,345' }), '2026-10-15', '').errors).toEqual({ amount: 'Hasta dos decimales.' });
    expect(validateExpense(valid({ supplier: 'x'.repeat(121) }), '2026-10-15', '').errors).toEqual({ supplier: 'Hasta 120 caracteres.' });
  });
});

describe('what an expense can go to', () => {
  const vehicle = (extra: Partial<Vehicle>): Vehicle => ({
    id: 'v',
    kind: 'trailer',
    key: 'plate:rem1001',
    plate: 'REM1001',
    catalogName: '',
    brand: 'Randon',
    model: '',
    body: 'Semirremolque',
    year: null,
    chassis: '',
    engine: '',
    capacity: null,
    capacityUnit: null,
    notes: '',
    photoPath: null,
    leftOn: null,
    leftReason: '',
    updatedAt: '',
    ...extra,
  });

  it('offers the ones in use first, and names every one', () => {
    const { choices, names: now } = targetChoices(
      { current: [{ key: 'plate:abc1234', label: 'Volvo FH 460 · ABC1234' }], gone: [{ key: 'plate:old1111', label: 'Viejo · OLD1111' }] },
      [vehicle({ id: 't1' }), vehicle({ id: 't2', plate: 'OLD0099', brand: 'Pastrana', body: 'Acoplado', leftOn: '2025-03-05' }), vehicle({ id: 'c1', kind: 'truck' })],
      [
        { id: 'd2', name: 'Ramón Sosa', active: false },
        { id: 'd1', name: 'Bruno Díaz', active: true },
      ],
    );
    expect(choices.trucks).toEqual({ current: [{ ref: 'plate:abc1234', label: 'Volvo FH 460 · ABC1234' }], gone: [{ ref: 'plate:old1111', label: 'Viejo · OLD1111' }] });
    expect(choices.trailers).toEqual({ current: [{ ref: 't1', label: 'Semirremolque Randon · REM1001' }], gone: [{ ref: 't2', label: 'Acoplado Pastrana · OLD0099' }] });
    expect(choices.drivers).toEqual({ current: [{ ref: 'd1', label: 'Bruno Díaz' }], gone: [{ ref: 'd2', label: 'Ramón Sosa' }] });
    expect(now.trucks.get('plate:old1111')).toBe('Viejo · OLD1111');
    expect(now.trailers.get('t2')).toBe('Acoplado Pastrana · OLD0099');
  });

  it('links to the expenses of one thing, names the filter and starts a new expense with it', () => {
    expect(expensesLink('camion:plate:abc1234')).toBe('/finanzas?periodo=todo&destino=camion%3Aplate%3Aabc1234');
    expect(filterLabel('camiones', NO_NAMES, [])).toBe('Todos los camiones');
    expect(filterLabel('camion:plate:abc1234', names, [])).toBe('Volvo FH 460 · ABC1234');
    expect(filterLabel('chofer:d9', NO_NAMES, [expense({ target: 'driver', targetKey: 'chofer:d9', driverId: 'd9', targetName: 'Eduardo Núñez' })])).toBe('Eduardo Núñez');
    expect(presetOf('camion:plate:abc1234')).toEqual({ target: 'truck', ref: 'plate:abc1234' });
    expect(presetOf('acoplado:t1')).toEqual({ target: 'trailer', ref: 't1' });
    expect(presetOf('empresa')).toEqual({ target: 'company' });
    expect(presetOf('camiones')).toBeNull();
    // A trip only from its own page, which names it.
    expect(presetOf('viaje:app:x')).toBeNull();
  });
});
