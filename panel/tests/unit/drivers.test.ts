import { describe, expect, it } from 'vitest';
import {
  accountNames,
  belongsTo,
  type Driver,
  driverFormValues,
  driverSummaries,
  monthLabel,
  monthLines,
  monthStatus,
  moneyYears,
  type Payment,
  paymentFormValues,
  pendingThisMonth,
  type Salary,
  salaryFor,
  savedAsSent,
  seniority,
  validateDriver,
  validatePayment,
  validateSalary,
  withoutCard,
  yearMonths,
} from '../../src/lib/drivers';
import { money } from '../../src/lib/format';

const salary = (startsOn: string, amount: number, extra: Partial<Salary> = {}): Salary => ({
  id: `s-${startsOn}`,
  driverId: 'd',
  startsOn,
  amount,
  currency: 'UYU',
  notes: '',
  deleted: false,
  updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
});

let n = 0;
const payment = (period: string, amount: number, extra: Partial<Payment> = {}): Payment => ({
  id: `p${++n}`,
  driverId: 'd',
  paidOn: period.replace(/-01$/, '-10'),
  period,
  amount,
  currency: 'UYU',
  concept: 'adelanto',
  method: 'efectivo',
  notes: '',
  deleted: false,
  createdAt: `2026-01-01T00:00:${String(n).padStart(2, '0')}Z`,
  updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
});

describe('choferes: el sueldo de cada mes', () => {
  it('rige el último sueldo que empezó ese mes o antes; los anulados no cuentan', () => {
    const list = [salary('2026-01-01', 40000), salary('2026-08-01', 45000), salary('2026-09-01', 50000, { deleted: true })];
    expect(salaryFor(list, '2025-12-01')).toBeNull();
    expect(salaryFor(list, '2026-03-01')?.amount).toBe(40000);
    expect(salaryFor(list, '2026-08-01')?.amount).toBe(45000);
    expect(salaryFor(list, '2026-10-01')?.amount).toBe(45000);
  });

  it('a lo que falta le restan los adelantos y el sueldo del mes; lo demás va aparte, y los dólares no se convierten', () => {
    const salaries = [salary('2026-08-01', 45000)];
    const payments = [
      payment('2026-10-01', 10000),
      payment('2026-10-01', 2500.5, { concept: 'sueldo' }),
      payment('2026-10-01', 3500, { concept: 'viatico' }),
      payment('2026-10-01', 100, { concept: 'adelanto', currency: 'USD' }),
      payment('2026-10-01', 999, { deleted: true }),
      payment('2026-09-01', 45000, { concept: 'sueldo' }),
      payment('2026-08-01', 30000, { concept: 'sueldo' }),
      payment('2026-08-01', 20000, { concept: 'adelanto' }),
    ];
    const [oct, sep, aug, jul] = monthLines(salaries, payments, ['2026-10-01', '2026-09-01', '2026-08-01', '2026-07-01']);
    expect(oct).toMatchObject({ paid: 12500.5, pending: 32499.5, currency: 'UYU' });
    expect(oct?.others).toEqual([
      { label: 'Viático', currency: 'UYU', amount: 3500 },
      { label: 'Adelanto en dólares', currency: 'USD', amount: 100 },
    ]);
    expect(oct?.payments).toHaveLength(4);
    expect(sep).toMatchObject({ paid: 45000, pending: 0 });
    expect(aug).toMatchObject({ paid: 50000, pending: -5000 });
    expect(jul).toMatchObject({ salary: null, paid: 0, pending: null, payments: [] });
    expect(monthStatus(oct!, money)).toEqual({ tone: 'warn', text: 'Falta $ 32.499,50' });
    expect(monthStatus(sep!, money)).toEqual({ tone: 'ok', text: 'Al día' });
    expect(monthStatus(aug!, money)).toEqual({ tone: 'blue', text: 'Pagado de más $ 5.000' });
    expect(monthStatus(jul!, money)).toEqual({ tone: 'muted', text: 'Sin sueldo ni pagos' });
    expect(monthStatus({ ...jul!, payments: [payment('2026-07-01', 1)] }, money)).toEqual({ tone: 'muted', text: 'Sin sueldo cargado' });
  });

  it('después del mes en que dejó de trabajar no hay sueldo, solo los pagos de ese mes (la liquidación)', () => {
    const [aug, jul, jun] = monthLines([salary('2026-01-01', 30000)], [payment('2026-08-01', 12000, { concept: 'sueldo' })], ['2026-08-01', '2026-07-01', '2026-06-01'], '2026-06-10');
    expect(aug).toMatchObject({ salary: null, pending: null, paid: 12000, afterLeaving: true });
    expect(monthStatus(aug!, money)).toEqual({ tone: 'muted', text: 'Después del egreso' });
    expect(jul).toMatchObject({ salary: null, afterLeaving: true });
    expect(jun).toMatchObject({ pending: 30000, afterLeaving: false });
  });

  it('un sueldo en dólares descuenta solo lo pagado en dólares', () => {
    const [line] = monthLines([salary('2026-01-01', 1500, { currency: 'USD' })], [payment('2026-10-01', 500, { currency: 'USD' }), payment('2026-10-01', 20000)], ['2026-10-01']);
    expect(line).toMatchObject({ paid: 500, pending: 1000, currency: 'USD' });
    expect(line?.others).toEqual([{ label: 'Adelanto en pesos', currency: 'UYU', amount: 20000 }]);
  });

  it('muestra los meses desde el primer sueldo o pago hasta hoy, o hasta un pago adelantado', () => {
    const history = { salaries: [salary('2025-11-01', 40000)], payments: [payment('2025-10-01', 5000, { deleted: true }), payment('2026-11-01', 5000)] };
    expect(moneyYears(history, '2026-10-15')).toEqual([2026, 2025]);
    expect(yearMonths(2026, '2026-10-15', history)).toEqual(['2026-11-01', '2026-10-01', '2026-09-01', '2026-08-01', '2026-07-01', '2026-06-01', '2026-05-01', '2026-04-01', '2026-03-01', '2026-02-01', '2026-01-01']);
    expect(yearMonths(2025, '2026-10-15', history)).toEqual(['2025-12-01', '2025-11-01']);
    expect(moneyYears({ salaries: [], payments: [] }, '2026-10-15')).toEqual([2026]);
    expect(yearMonths(2026, '2026-10-15', { salaries: [], payments: [] })).toEqual(['2026-10-01']);
    // Who stopped working: up to that month, or to a payment made for a later month (the last settlement).
    expect(yearMonths(2026, '2026-10-15', { salaries: history.salaries, payments: [], leftOn: '2026-06-10' })).toEqual(['2026-06-01', '2026-05-01', '2026-04-01', '2026-03-01', '2026-02-01', '2026-01-01']);
    expect(yearMonths(2026, '2026-10-15', { ...history, leftOn: '2026-06-10' })[0]).toBe('2026-11-01');
    expect(moneyYears({ salaries: [], payments: [], leftOn: '2025-12-31' }, '2026-10-15')).toEqual([2025]);
    expect(monthLabel('2026-09-01')).toBe('setiembre de 2026');
    expect(monthLabel('2026-10-01', true)).toBe('Octubre de 2026');
  });

  it('dice la antigüedad', () => {
    expect(seniority('2025-03-01', '2026-10-15')).toBe('1 año y 7 meses');
    expect(seniority('2026-07-20', '2026-10-15')).toBe('2 meses');
    expect(seniority('2024-10-15', '2026-10-15')).toBe('2 años');
    expect(seniority('2026-10-01', '2026-10-15')).toBe('menos de un mes');
    expect(seniority('2026-11-01', '2026-10-15')).toBeNull();
  });
});

describe('choferes: fichas y cuentas de la app', () => {
  const ana = { userId: 'u-ana', name: 'Ana Pereira' };
  it('un viaje, un papel o una boleta es del chofer por su cuenta, o por el nombre si falta la cuenta', () => {
    expect(belongsTo(ana, { driverId: 'u-ana', driverName: 'Otra' })).toBe(true);
    expect(belongsTo(ana, { driverId: 'u-otra', driverName: 'Ana Pereira' })).toBe(false);
    expect(belongsTo(ana, { driverId: null, driverName: 'ana  pereira' })).toBe(true);
    expect(belongsTo(ana, { driverId: null, driverName: 'Ana Pereira' })).toBe(true);
    expect(belongsTo({ userId: null, name: 'Eduardo Núñez' }, { driverId: 'u-x', driverName: 'eduardo nunez' })).toBe(true);
    expect(belongsTo({ userId: null, name: 'Eduardo Núñez' }, { driverId: null, driverName: '' })).toBe(false);
    // A trip typed with a name the account used in the app is still the driver's after the card's name changes.
    const rows = [{ driverId: 'u-ana', driverName: 'Ana P.' }, { driverId: 'u-ana', driverName: 'Ana Pereira' }, { driverId: 'u-otra', driverName: 'Otra' }];
    expect(accountNames(rows, 'u-ana')).toEqual(['Ana P.', 'Ana Pereira']);
    expect(accountNames(rows, null)).toEqual([]);
    expect(belongsTo({ ...ana, name: 'Ana María Pereira' }, { driverId: null, driverName: 'ana pereira' })).toBe(false);
    expect(belongsTo({ ...ana, name: 'Ana María Pereira', aliases: accountNames(rows, 'u-ana') }, { driverId: null, driverName: 'ana pereira' })).toBe(true);
  });

  it('lista los choferes de la app que todavía no tienen ficha', () => {
    expect(withoutCard([{ userId: 'u-ana' }, { userId: null }], [{ id: 'u-ana', name: 'Ana' }, { id: 'u-bruno', name: 'Bruno' }])).toEqual([{ id: 'u-bruno', name: 'Bruno' }]);
  });

  it('quien ya no trabaja lleva el día en que dejó de trabajar, entre el ingreso y hoy', () => {
    const v = { ...driverFormValues(null), name: 'Ramón Sosa', hiredOn: '2024-03-01', active: false, leftOn: '2026-09-30' };
    expect(validateDriver(v, '2026-10-15', new Set()).row).toMatchObject({ active: false, left_on: '2026-09-30' });
    expect(validateDriver({ ...v, leftOn: '' }, '2026-10-15', new Set()).errors).toEqual({ leftOn: 'Elegí el día en que dejó de trabajar.' });
    expect(validateDriver({ ...v, leftOn: '2026-10-16' }, '2026-10-15', new Set()).errors).toEqual({ leftOn: 'No puede ser posterior a hoy.' });
    expect(validateDriver({ ...v, leftOn: '2024-02-01' }, '2026-10-15', new Set()).errors).toEqual({ leftOn: 'No puede ser anterior a la fecha de ingreso.' });
    // Back to work: the day is cleared.
    expect(validateDriver({ ...v, active: true }, '2026-10-15', new Set()).row).toMatchObject({ active: true, left_on: null });
  });

  it('valida la ficha: nombre, largos, fecha de ingreso, medio de pago y una ficha por cuenta', () => {
    const v = { ...driverFormValues(null, { userId: 'u-bruno', name: 'Bruno Díaz' }), hiredOn: '2025-03-01', licenseCategory: ' e ', payMethod: 'transferencia', bank: 'BROU', bankAccount: '001-2' };
    const ok = validateDriver(v, '2026-10-15', new Set(['u-ana']));
    expect(ok.errors).toEqual({});
    expect(ok.row).toMatchObject({ name: 'Bruno Díaz', user_id: 'u-bruno', hired_on: '2025-03-01', license_category: 'E', pay_method: 'transferencia', active: true });
    expect(validateDriver({ ...v, userId: '' }, '2026-10-15', new Set()).row).toMatchObject({ user_id: null });
    const bad = validateDriver({ ...v, name: '  ', hiredOn: '2027-01-01', payMethod: 'bitcoin', phone: '9'.repeat(41) }, '2026-10-15', new Set(['u-bruno']));
    expect(bad.row).toBeNull();
    expect(Object.keys(bad.errors).sort()).toEqual(['hiredOn', 'name', 'payMethod', 'phone', 'userId']);
  });
});

describe('choferes: los formularios del sueldo y de los pagos', () => {
  it('el sueldo: importe como se escribe en Uruguay, un mes y uno solo por mes', () => {
    const others = [salary('2026-08-01', 45000)];
    expect(validateSalary({ amount: '47.500', currency: 'UYU', startsOn: '2026-11', notes: ' Aumento ' }, others, null)).toEqual({
      row: { amount: 47500, currency: 'UYU', starts_on: '2026-11-01', notes: 'Aumento' },
      errors: {},
    });
    expect(validateSalary({ amount: '47500', currency: 'UYU', startsOn: '2026-08', notes: '' }, others, null).errors.startsOn).toMatch(/Ya hay un sueldo/);
    expect(validateSalary({ amount: '47500', currency: 'UYU', startsOn: '2026-08', notes: '' }, others, 's-2026-08-01').errors).toEqual({});
    expect(validateSalary({ amount: '0', currency: 'UYU', startsOn: '', notes: '' }, others, null).errors).toEqual({ amount: 'Tiene que ser mayor que cero.', startsOn: 'Elegí el mes.' });
  });

  it('el pago: arranca hoy, para este mes, en la moneda del sueldo y por el medio de siempre', () => {
    expect(paymentFormValues(null, '2026-10-15', { payMethod: 'transferencia' }, salary('2026-01-01', 1500, { currency: 'USD' }))).toEqual({
      paidOn: '2026-10-15',
      period: '2026-10',
      amount: '',
      currency: 'USD',
      concept: 'adelanto',
      method: 'transferencia',
      notes: '',
    });
    const v = paymentFormValues(null, '2026-10-15', { payMethod: null }, null);
    expect(v).toMatchObject({ currency: 'UYU', method: 'efectivo' });
    expect(validatePayment({ ...v, amount: '12.345,5', period: '2026-09', concept: 'sueldo' }, '2026-10-15')).toEqual({
      row: { paid_on: '2026-10-15', period: '2026-09-01', amount: 12345.5, currency: 'UYU', concept: 'sueldo', method: 'efectivo', notes: '' },
      errors: {},
    });
    const bad = validatePayment({ ...v, paidOn: '2026-10-16', period: '2026-13', amount: '1,234' }, '2026-10-15');
    expect(bad.row).toBeNull();
    expect(bad.errors).toEqual({ paidOn: 'La fecha no puede ser posterior a hoy.', period: 'Elegí el mes al que corresponde.', amount: 'Hasta dos decimales.' });
  });

  it('un guardado que se repite reconoce lo que mandó: el importe como número, y una anulación sea cuando sea', () => {
    const saved = { id: 'p', paid_on: '2026-10-14', amount: 15000, currency: 'UYU', notes: '', deleted_at: '2026-10-15T15:00:00.123+00:00' };
    expect(savedAsSent(saved, { id: 'otro', paid_on: '2026-10-14', amount: 15000, notes: '' })).toBe(true);
    expect(savedAsSent(saved, { amount: 20000 })).toBe(false);
    expect(savedAsSent(saved, { notes: null })).toBe(false);
    // Each try of an annulment sends its own instant: what counts is that it is annulled.
    expect(savedAsSent(saved, { deleted_at: '2026-10-15T15:00:05.000Z' })).toBe(true);
    expect(savedAsSent(saved, { deleted_at: null })).toBe(false);
    expect(savedAsSent({ ...saved, deleted_at: null }, { deleted_at: null })).toBe(true);
    expect(savedAsSent({ ...saved, deleted_at: null }, { deleted_at: '2026-10-15T15:00:05.000Z' })).toBe(false);
  });
});

describe('choferes: la lista', () => {
  const card = (id: string, userId: string | null, name: string, leftOn: string | null = null): Driver => ({
    id,
    userId,
    name,
    phone: '',
    documentId: '',
    hiredOn: null,
    licenseCategory: '',
    payMethod: null,
    bank: '',
    bankAccount: '',
    notes: '',
    active: leftOn === null,
    leftOn,
    updatedAt: '',
  });

  it('resume cada ficha y cada chofer de la app sin ficha: viajes del mes, papeles, libreta y sueldo', () => {
    const list = driverSummaries(
      {
        drivers: [card('d-ana', 'u-ana', 'Ana Pereira'), card('d-edu', null, 'Eduardo Núñez'), card('d-old', null, 'Viejo', '2026-05-31'), card('d-oct', null, 'Se fue en octubre', '2026-10-05')],
        appDrivers: [
          { id: 'u-ana', name: 'Ana Pereira' },
          { id: 'u-diego', name: 'Diego Silva' },
          { id: 'u-carla', name: 'Carla Méndez' },
        ],
        presence: [{ driverId: 'u-ana', name: 'Ana Pereira', vehicle: null, version: '0.19.0', newer: null, seenAt: 1, state: 'trip', place: null }],
        trips: [
          { driverId: 'u-ana', driverName: 'Ana Pereira', gpsKm: 150, deleted: false },
          { driverId: null, driverName: 'Ana Pereira', gpsKm: 50, deleted: false },
          { driverId: 'u-ana', driverName: 'Ana Pereira', gpsKm: 999, deleted: true },
          { driverId: null, driverName: 'Eduardo Nuñez', gpsKm: 20, deleted: false },
          // A name Ana used in the app, and a trip typed by hand with it.
          { driverId: 'u-ana', driverName: 'Ana P.', gpsKm: 10, deleted: false },
          { driverId: null, driverName: 'Ana P.', gpsKm: 5, deleted: false },
        ],
        papers: [
          // The old licence expired; the renewed one is the one that counts.
          { scope: 'driver', driverId: 'u-ana', driverName: 'Ana Pereira', kind: 'Licencia de conducir', expiresOn: '2024-10-30' },
          { scope: 'driver', driverId: 'u-ana', driverName: 'Ana Pereira', kind: 'Licencia de conducir', expiresOn: '2026-10-30' },
          { scope: 'driver', driverId: 'u-ana', driverName: 'Ana Pereira', kind: 'Carné de salud', expiresOn: '2026-10-01' },
          { scope: 'vehicle', driverId: 'u-ana', driverName: 'Ana Pereira', kind: 'SOA / Seguro', expiresOn: '2026-01-01' },
        ],
        salaries: [salary('2026-08-01', 45000, { driverId: 'd-ana' }), salary('2026-01-01', 30000, { driverId: 'd-old' }), salary('2026-01-01', 20000, { driverId: 'd-oct' })],
        payments: [payment('2026-10-01', 10000, { driverId: 'd-ana' }), payment('2026-10-01', 7000, { driverId: 'd-edu' })],
      },
      '2026-10-15',
    );
    expect(list.map((s) => s.key)).toEqual(['ficha:d-ana', 'ficha:d-edu', 'ficha:d-old', 'ficha:d-oct', 'app:u-carla', 'app:u-diego']);
    const [ana, edu, old, oct, carla] = list;
    // The renewed licence counts; the old one, expired, does not.
    expect(ana).toMatchObject({ trips: 4, km: 215, papers: { late: 1, soon: 1 }, license: { expiresOn: '2026-10-30', state: 'soon' } });
    expect(ana?.presence?.state).toBe('trip');
    expect(ana?.month).toMatchObject({ month: '2026-10-01', paid: 10000, pending: 35000 });
    expect(edu).toMatchObject({ trips: 1, km: 20, presence: null, license: null });
    expect(edu?.month).toMatchObject({ salary: null, pending: null });
    expect(carla).toMatchObject({ driver: null, userId: 'u-carla', name: 'Carla Méndez', month: null });
    // Who left before this month has no salary in it; who left this month still has it to pay.
    expect(old?.month).toBeNull();
    expect(oct?.month).toMatchObject({ pending: 20000 });
    expect(pendingThisMonth(list)).toEqual({ UYU: 55000, USD: 0 });
  });
});
