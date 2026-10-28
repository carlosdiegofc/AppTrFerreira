import { describe, expect, it } from 'vitest';
import type { Payment, Salary } from '../../src/lib/drivers';
import type { Expense, ExpenseTarget } from '../../src/lib/expenses';
import type { Currency, Receipt } from '../../src/lib/fuel';
import {
  generalTotal,
  monthCosts,
  monthlyProfit,
  monthsUpTo,
  NO_TRUCK_KEY,
  type ProfitInput,
  type TollPassage,
  tollPassageFromRow,
  trailerTruck,
  tripProfits,
  truckKeyOf,
} from '../../src/lib/profit';
import type { Trip } from '../../src/lib/trips';
import type { Hitch } from '../../src/lib/vehicles';

const VOLVO = 'Volvo FH 460 · ABC1234';
const FORD = 'Ford Cargo 1722 · JKL3456';

let n = 0;
/** A finished app trip with cargo that started at noon in Uruguay of a day. */
function trip(over: Partial<Trip> & { day?: string } = {}): Trip {
  const { day = '2026-10-10', ...rest } = over;
  n++;
  return {
    key: 'app:' + n,
    source: 'app',
    appTripId: String(n),
    panelId: null,
    deleted: false,
    deletedAt: null,
    active: false,
    paused: false,
    driverId: null,
    driverName: null,
    vehicle: VOLVO,
    departureAt: `${day}T15:00:00Z`,
    arrivalAt: null,
    gpsKm: 100,
    loadType: 'loaded',
    orderNumber: null,
    client: 'Molino San José',
    product: null,
    originName: null,
    origin: null,
    gpsStart: null,
    destinationName: null,
    destination: null,
    gpsEnd: null,
    billableKm: null,
    kg: null,
    amount: 10000,
    currency: 'UYU',
    notes: null,
    updatedAt: null,
    status: { code: 'complete', label: 'Completo', missing: [] },
    ...rest,
  } as Trip;
}

function receipt(over: Partial<Receipt> = {}): Receipt {
  n++;
  return {
    id: 'r' + n,
    tripId: null,
    driverId: 'd1',
    driverName: null,
    recordedAt: null,
    date: '2026-10-10',
    vehicle: VOLVO,
    stationKey: 'name:',
    station: null,
    liters: 100,
    total: 5000,
    currency: 'UYU',
    fullTank: false,
    tripMeters: null,
    objectPath: null,
    archived: false,
    updatedAt: null,
    declared: { date: null, vehicle: null, stationId: null, station: null, liters: null, total: null, fullTank: null },
    panelData: {},
    ...over,
  };
}

function expense(target: ExpenseTarget, over: Partial<Expense> = {}): Expense {
  n++;
  return {
    id: 'e' + n,
    spentOn: '2026-10-10',
    category: 'Otros',
    amount: 1000,
    currency: 'UYU',
    target,
    targetKey: '',
    vehicleKey: null,
    trailerId: null,
    driverId: null,
    tripKey: null,
    targetName: '',
    serviceId: null,
    supplier: '',
    method: 'efectivo',
    notes: '',
    file: null,
    deleted: false,
    createdAt: '2026-10-10T12:00:00Z',
    updatedAt: '2026-10-10T12:00:00Z',
    ...over,
  };
}

const passage = (over: Partial<TollPassage> = {}): TollPassage => ({ id: 'p' + ++n, tripId: '1', vehicleKey: 'plate:abc1234', vehicleName: VOLVO, day: '2026-10-10', amount: 300, pointName: 'Peaje Pando', ...over });

const hitch = (over: Partial<Hitch> = {}): Hitch => ({ id: 'h' + ++n, trailerId: 'trailer-1', truckKey: 'plate:abc1234', fromOn: '2026-01-01', toOn: null, notes: '', endedByLeave: null, deleted: false, updatedAt: '', ...over });

const salary = (startsOn: string, amount: number, over: Partial<Salary> = {}): Salary => ({ id: 's' + ++n, driverId: 'd1', startsOn, amount, currency: 'UYU', notes: '', deleted: false, updatedAt: '', ...over });

const payment = (period: string, amount: number, over: Partial<Payment> = {}): Payment => ({
  id: 'pay' + ++n,
  driverId: 'd1',
  paidOn: period,
  period,
  amount,
  currency: 'UYU',
  concept: 'viatico',
  method: 'efectivo',
  notes: '',
  deleted: false,
  createdAt: '',
  updatedAt: '',
  ...over,
});

const input = (over: Partial<ProfitInput> = {}): ProfitInput => ({ trips: [], receipts: [], passages: [], expenses: [], hitches: [], payroll: [], ...over });
const money = (UYU: number, USD = 0): Record<Currency, number> => ({ UYU, USD });

describe('tripProfits', () => {
  it('takes from what a trip billed its fuel, its tolls and its expenses, in each currency', () => {
    const t = trip({ amount: 38500 });
    const other = trip({ amount: 2000, currency: 'USD' });
    const [a, b] = tripProfits([t, other], {
      receipts: [
        receipt({ tripId: t.appTripId, total: 9950 }),
        receipt({ tripId: t.appTripId, total: 310, currency: 'USD' }),
        // In the trash, of another trip, or of no trip: not this one's.
        receipt({ tripId: t.appTripId, total: 5000, archived: true }),
        receipt({ tripId: other.appTripId, total: 700 }),
        receipt({ tripId: null, total: 100 }),
      ],
      passages: [passage({ tripId: t.appTripId as string, amount: 455.5 }), passage({ tripId: t.appTripId as string, amount: null })],
      expenses: [
        expense('trip', { tripKey: t.key, amount: 520 }),
        expense('trip', { tripKey: t.key, amount: 99, deleted: true }),
        expense('truck', { vehicleKey: 'plate:abc1234', amount: 18500 }),
      ],
    });
    expect(a?.billed).toEqual(money(38500));
    expect(a?.fuel).toEqual(money(9950, 310));
    expect(a?.tolls).toBe(455.5);
    expect(a?.tollsWithoutRate).toBe(1);
    expect(a?.expenses).toEqual(money(520));
    expect(a?.result).toEqual(money(27574.5, -310));
    expect(b?.result).toEqual(money(-700, 2000));
  });

  it('leaves out the trips in the trash and tells which still need their amount', () => {
    const list = tripProfits(
      [
        trip({ amount: null }),
        trip({ amount: 0, active: true }),
        trip({ amount: null, loadType: 'empty' }),
        trip({ deleted: true }),
        trip({ amount: null, source: 'manual', appTripId: null, key: 'web:x' }),
      ],
      { receipts: [], passages: [], expenses: [] },
    );
    expect(list.map((p) => p.missing)).toEqual([true, false, false, true]);
    expect(list[3]?.result).toEqual(money(0));
  });
});

describe('monthlyProfit', () => {
  it('counts each thing on its own day, by truck, with what has no truck last', () => {
    const t = trip({ day: '2026-09-30', amount: 20000 });
    const months = monthlyProfit(
      input({
        trips: [t, trip({ day: '2026-10-02', vehicle: FORD, amount: 15000 }), trip({ day: '2026-10-05', vehicle: null, amount: 3000 })],
        // The trip's receipt of the next day counts in October, for its truck.
        receipts: [receipt({ tripId: t.appTripId, date: '2026-10-01', total: 6000 }), receipt({ date: '2026-10-03', vehicle: null, total: 800 })],
        passages: [passage({ tripId: t.appTripId as string, day: '2026-09-30', amount: 300 })],
        // An expense of the September trip, spent in October, goes with the Volvo in October.
        expenses: [expense('trip', { tripKey: t.key, spentOn: '2026-10-04', amount: 400 })],
      }),
      ['2026-09-01', '2026-10-01'],
    );
    const [sep, oct] = months;
    expect(sep?.trucks.map((x) => [x.label, x.trips, x.billed.UYU, x.tolls, x.result.UYU])).toEqual([[VOLVO, 1, 20000, 300, 19700]]);
    expect(oct?.trucks.map((x) => [x.label, x.trips, x.billed.UYU, x.fuel.UYU, x.expenses.UYU, x.result.UYU])).toEqual([
      [FORD, 1, 15000, 0, 0, 15000],
      [VOLVO, 0, 0, 6000, 400, -6400],
      ['Sin camión asignado', 1, 3000, 800, 0, 2200],
    ]);
    expect(oct?.trucks.at(-1)?.key).toBe(NO_TRUCK_KEY);
    expect(oct?.fleet.result).toEqual(money(10800));
    expect(oct?.result).toEqual(money(10800));
  });

  it('puts a trailer\'s expense on the truck that took it that day, and the rest of the expenses apart', () => {
    const hitches = [hitch({ fromOn: '2026-10-05', toOn: '2026-10-20' }), hitch({ trailerId: 'trailer-2', deleted: true })];
    const [oct] = monthlyProfit(
      input({
        hitches,
        expenses: [
          expense('trailer', { trailerId: 'trailer-1', spentOn: '2026-10-20', amount: 900 }),
          expense('trailer', { trailerId: 'trailer-1', spentOn: '2026-10-21', amount: 50 }),
          expense('trailer', { trailerId: 'trailer-2', spentOn: '2026-10-10', amount: 70 }),
          expense('truck', { vehicleKey: 'plate:jkl3456', targetName: FORD, amount: 2400, currency: 'USD' }),
          expense('driver', { driverId: 'd1', amount: 1200 }),
          expense('company', { amount: 950, currency: 'USD' }),
          expense('company', { amount: 5, deleted: true }),
        ],
      }),
      ['2026-10-01'],
    );
    expect(oct?.trucks.map((x) => [x.label, x.expenses])).toEqual([
      [FORD, money(0, 2400)],
      ['plate:abc1234', money(900)],
    ]);
    expect(oct?.general).toEqual({ company: money(0, 950), drivers: money(1200), trailers: money(120) });
    expect(generalTotal(oct!.general)).toEqual(money(1320, 950));
    expect(oct?.result).toEqual(money(-2220, -3350));
  });

  it('names the trucks as they are named now', () => {
    const [oct] = monthlyProfit(input({ hitches: [hitch()], expenses: [expense('trailer', { trailerId: 'trailer-1' })] }), ['2026-10-01']);
    expect(oct?.trucks[0]?.label).toBe('plate:abc1234');
    const [named] = monthlyProfit(input({ hitches: [hitch()], expenses: [expense('trailer', { trailerId: 'trailer-1' })], names: new Map([['plate:abc1234', VOLVO]]) }), ['2026-10-01']);
    expect(named?.trucks[0]?.label).toBe(VOLVO);
  });

  it('takes the salary in force each month and the viáticos of that month, whatever was paid', () => {
    const ana = { leftOn: null, salaries: [salary('2026-09-01', 45000), salary('2026-10-01', 48000), salary('2026-10-01', 99999, { deleted: true })], payments: [] as Payment[] };
    const ana2 = {
      ...ana,
      payments: [
        payment('2026-10-01', 3500),
        payment('2026-10-01', 100, { currency: 'USD' }),
        payment('2026-10-01', 9, { deleted: true }),
        // Advances and salary payments are not costs on their own: the salary of the month is.
        payment('2026-10-01', 10000, { concept: 'adelanto' }),
        payment('2026-09-01', 2000),
      ],
    };
    // Ramón stopped working in September: no salary from October on.
    const ramon = { leftOn: '2026-09-15', salaries: [salary('2026-07-01', 30000, { driverId: 'd2' })], payments: [] as Payment[] };
    const [sep, oct] = monthlyProfit(input({ payroll: [ana2, ramon] }), ['2026-09-01', '2026-10-01']);
    expect(sep?.salaries).toEqual(money(75000));
    expect(sep?.viaticos).toEqual(money(2000));
    expect(oct?.salaries).toEqual(money(48000));
    expect(oct?.viaticos).toEqual(money(3500, 100));
    expect(oct?.result).toEqual(money(-51500, -100));
    expect(monthCosts(oct!)).toEqual(money(51500, 100));
  });

  it('with until, counts only up to that day of the month, but the salary of the whole month', () => {
    const p = input({
      trips: [trip({ day: '2026-09-10', amount: 1000 }), trip({ day: '2026-09-20', amount: 5000 })],
      receipts: [receipt({ date: '2026-09-25', total: 700 })],
      payroll: [{ leftOn: null, salaries: [salary('2026-01-01', 3000)], payments: [] }],
    });
    const [whole] = monthlyProfit(p, ['2026-09-01']);
    const [part] = monthlyProfit(p, ['2026-09-01'], new Map([['2026-09-01', '2026-09-15']]));
    expect(whole?.result).toEqual(money(2300));
    expect(part?.fleet.trips).toBe(1);
    expect(part?.result).toEqual(money(-2000));
  });

  it('adds the tolls in pesos, and counts the passages without a rate', () => {
    const [oct] = monthlyProfit(input({ passages: [passage({ amount: 300 }), passage({ amount: 155.25 }), passage({ amount: null }), passage({ day: '2026-11-01' })] }), ['2026-10-01']);
    expect(oct?.fleet.tolls).toBe(455.25);
    expect(oct?.fleet.tollsWithoutRate).toBe(1);
    expect(oct?.result).toEqual(money(-455.25));
  });

  it('counts the trips that still need their amount, and leaves out the ones in the trash', () => {
    const [oct] = monthlyProfit(input({ trips: [trip({ amount: null }), trip({ amount: null, active: true }), trip({ deleted: true })] }), ['2026-10-01']);
    expect(oct?.fleet.trips).toBe(2);
    expect(oct?.fleet.missing).toBe(1);
  });

  it('counts the receipts that still need their amount (none, or in zero), by truck and for the trip, and they add nothing', () => {
    const t = trip({ amount: 10000 });
    const receipts = [
      receipt({ tripId: t.appTripId, total: null }),
      // The app lets a driver save a 0: nobody fills a tank for free, so it is an amount still to complete.
      receipt({ tripId: t.appTripId, total: 0 }),
      receipt({ tripId: t.appTripId, total: 2000 }),
      receipt({ vehicle: FORD, total: null }),
      // In the trash, or of another month: not counted.
      receipt({ total: null, archived: true }),
      receipt({ date: '2026-11-02', total: null }),
    ];
    const [oct] = monthlyProfit(input({ trips: [t], receipts }), ['2026-10-01']);
    expect(oct?.trucks.map((x) => [x.label, x.fuel.UYU, x.fuelMissing])).toEqual([
      [FORD, 0, 1],
      [VOLVO, 2000, 2],
    ]);
    expect(oct?.fleet.fuelMissing).toBe(3);
    expect(oct?.result).toEqual(money(8000));
    const [p] = tripProfits([t], { receipts, passages: [], expenses: [] });
    expect(p?.fuel).toEqual(money(2000));
    expect(p?.fuelMissing).toBe(2);
    expect(p?.result).toEqual(money(8000));
  });
});

describe('helpers', () => {
  it('lists the months up to a day, across years', () => {
    expect(monthsUpTo('2026-02-15', 3)).toEqual(['2025-12-01', '2026-01-01', '2026-02-01']);
  });

  it('finds the truck that took a trailer on a day, ends included', () => {
    const hitches = [hitch({ fromOn: '2026-10-05', toOn: '2026-10-20' }), hitch({ truckKey: 'plate:jkl3456', fromOn: '2026-10-21' })];
    expect(trailerTruck('trailer-1', '2026-10-04', hitches)).toBeNull();
    expect(trailerTruck('trailer-1', '2026-10-05', hitches)).toBe('plate:abc1234');
    expect(trailerTruck('trailer-1', '2026-10-20', hitches)).toBe('plate:abc1234');
    expect(trailerTruck('trailer-1', '2026-10-21', hitches)).toBe('plate:jkl3456');
  });

  it('reads a toll passage on its day in Uruguay', () => {
    expect(tollPassageFromRow({ id: 'x', trip_id: 't', vehicle_key: 'plate:abc1234', vehicle_name: VOLVO, happened_at: '2026-11-01T02:30:00Z', amount: 455.5, point_name: 'Peaje Pando' })).toEqual({
      id: 'x',
      tripId: 't',
      vehicleKey: 'plate:abc1234',
      vehicleName: VOLVO,
      day: '2026-10-31',
      amount: 455.5,
      pointName: 'Peaje Pando',
    });
    expect(tollPassageFromRow({ id: 'y', trip_id: 't', vehicle_key: 'k', vehicle_name: 'n', happened_at: '2026-10-10T12:00:00Z', amount: null, point_name: 'p' })?.amount).toBeNull();
  });

  it('keys a truck as GPS does', () => {
    expect(truckKeyOf(VOLVO)).toBe('plate:abc1234');
    expect(truckKeyOf(null)).toBe(NO_TRUCK_KEY);
  });
});
