import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNumber, toNumber, formatNumber, formatMoney, splitVehicle, normalizePlate, toCsv, chunk, fromLocalInput,
  toLocalInput, rangeToIso, periodRange, formatDuration, fold, firstValue, validLatLng,
} from '../../js/util.js';

test('parseNumber reads the way numbers are typed in Uruguay', () => {
  const ok = (text, value) => assert.deepEqual(parseNumber(text), { ok: true, value }, text);
  ok('', null);
  ok('  ', null);
  ok('30000', 30000);
  ok('30.000', 30000);
  ok('1.234.567', 1234567);
  ok('12,5', 12.5);
  ok('1.234,5', 1234.5);
  ok('1,234.5', 1234.5);
  ok('12.5', 12.5);
  ok('1234.56', 1234.56);
  ok('0', 0);
  ok(' 184 ', 184);
  ok('1 500', 1500);
});

test('parseNumber rejects what would be stored wrong', () => {
  for (const text of ['-5', 'abc', '12a', '1.2.3', '1,2,3,4,5', '12,', ',5', '1.234,5,6', '12.', '.', ',', '1.23,4.5']) {
    const r = parseNumber(text);
    assert.equal(r.ok, false, text);
    assert.ok(r.error.length > 5, text);
  }
});

test('toNumber accepts numbers and numeric text only', () => {
  assert.equal(toNumber(12), 12);
  assert.equal(toNumber('98,2'), 98.2);
  assert.equal(toNumber(''), null);
  assert.equal(toNumber(null), null);
  assert.equal(toNumber(NaN), null);
  assert.equal(toNumber('x'), null);
});

test('formatting uses Uruguayan separators', () => {
  assert.equal(formatNumber(30000), '30.000');
  assert.equal(formatNumber(184.24, 1), '184,2');
  assert.equal(formatNumber(null), '—');
  assert.equal(formatMoney(45000, 'UYU'), '$ 45.000');
  assert.equal(formatMoney(1200.5, 'USD'), 'US$ 1.200,50');
  assert.equal(formatMoney(41000.5, 'UYU'), '$ 41.000,50');
});

test('vehicle labels from the app are split into model and plate', () => {
  assert.deepEqual(splitVehicle('Ford Cargo 1722 · ITP2187'), { model: 'Ford Cargo 1722', plate: 'ITP2187', label: 'Ford Cargo 1722 · ITP2187' });
  assert.deepEqual(splitVehicle('Mercedes-Benz 1618 · SAB 1234'), { model: 'Mercedes-Benz 1618', plate: 'SAB1234', label: 'Mercedes-Benz 1618 · SAB 1234' });
  assert.deepEqual(splitVehicle('Leyland'), { model: 'Leyland', plate: '', label: 'Leyland' });
  assert.deepEqual(splitVehicle('Ford Cargo 1722'), { model: 'Ford Cargo 1722', plate: '', label: 'Ford Cargo 1722' });
  assert.deepEqual(splitVehicle('Sin camión asignado'), { model: '', plate: '', label: '' });
  assert.deepEqual(splitVehicle(''), { model: '', plate: '', label: '' });
  assert.equal(splitVehicle('ITP-2187').plate, 'ITP2187');
  assert.equal(normalizePlate('abc1d23'), 'ABC1D23');
  assert.equal(normalizePlate('Cargo'), '');
});

test('CSV opens in Excel and cannot run formulas', () => {
  const csv = toCsv([{ a: 'Soja; granos', b: 12.5, c: '=HYPERLINK("x")', d: null, e: 'dice "hola"' }], [
    { label: 'A', value: (r) => r.a }, { label: 'B', value: (r) => r.b }, { label: 'C', value: (r) => r.c },
    { label: 'D', value: (r) => r.d }, { label: 'E', value: (r) => r.e },
  ]);
  assert.ok(csv.startsWith('﻿A;B;C;D;E\r\n'));
  assert.ok(csv.includes('"Soja; granos";12,5;"\'=HYPERLINK(""x"")";;"dice ""hola"""'));
});

test('dates from the form are read in local time and invalid ones are flagged', () => {
  assert.equal(fromLocalInput(''), null);
  assert.equal(fromLocalInput('no'), undefined);
  assert.equal(fromLocalInput('2025-02-30T10:00'), new Date('2025-02-30T10:00').getTime() ? new Date('2025-02-30T10:00').toISOString() : undefined);
  const iso = fromLocalInput('2025-07-30T08:00');
  assert.equal(toLocalInput(iso), '2025-07-30T08:00');
  assert.equal(toLocalInput('garbage'), '');
});

test('periods cover whole local days', () => {
  const now = new Date(2026, 9, 7, 15, 30);
  assert.deepEqual(periodRange('month', now), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(periodRange('prev-month', now), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(periodRange('30', now), { from: '2026-09-08', to: '2026-10-07' });
  const r = rangeToIso('2026-10-01', '2026-10-31');
  assert.equal(new Date(r.fromIso).getTime(), new Date(2026, 9, 1).getTime());
  assert.equal(new Date(r.toIso).getTime(), new Date(2026, 10, 1).getTime());
  assert.equal(rangeToIso('2026-10-31', '2026-10-01'), null);
  assert.equal(rangeToIso('x', '2026-10-01'), null);
});

test('small helpers', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.equal(formatDuration(160 * 60000), '2 h 40 min');
  assert.equal(formatDuration(30000), 'menos de 1 min');
  assert.equal(formatDuration(-1), '—');
  assert.equal(fold('  Paysandú '), 'paysandu');
  assert.equal(firstValue(null, '  ', undefined, 0, 'x'), 0);
  assert.equal(validLatLng(-33.87, -58.41), true);
  assert.equal(validLatLng(0, 0), false);
  assert.equal(validLatLng(95, 10), false);
});
