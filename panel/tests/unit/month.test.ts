import { expect, it } from 'vitest';
import { monthTotals } from '../../src/lib/month';

const fleet = [
  { model: 'Ford Cargo 1722', plate: 'GTP4265' },
  { model: 'Leyland', plate: 'HTP1545' },
];

it('adds the GPS kilometres, splits them by cargo and counts each truck once', () => {
  const totals = monthTotals(
    [
      { distance_meters: 100_000, load_type: 'loaded', vehicle: 'Ford Cargo 1722 · GTP4265' },
      { distance_meters: 50_000, load_type: 'empty', vehicle: 'Ford Cargo' },
      { distance_meters: 50_000, load_type: 'loaded', vehicle: 'Leyland · HTP1545' },
      { distance_meters: 0, load_type: 'loaded', vehicle: 'Sin camión asignado' },
    ],
    fleet,
  );
  expect(totals).toEqual({ trips: 4, meters: 200_000, loadedShare: 0.75, trucks: 2 });
});

it('has no share without kilometres', () => {
  expect(monthTotals([], fleet)).toEqual({ trips: 0, meters: 0, loadedShare: null, trucks: 0 });
});
