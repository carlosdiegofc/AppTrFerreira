import { describe, expect, it } from 'vitest';
import { change, changeText, monthBefore, moneyTrend, periodBefore, trend } from '../../src/lib/change';
import { isDay } from '../../src/lib/dates';

describe('change', () => {
  it('says how much a number moved, rounded', () => {
    expect(change(106, 100)).toEqual({ direction: 'up', percent: 6 });
    expect(change(88, 100)).toEqual({ direction: 'down', percent: 12 });
    expect(change(100.4, 100)).toEqual({ direction: 'same', percent: 0 });
    expect(change(5, 0)).toBeNull();
    expect(change(0, 0)).toBeNull();
    // A loss that got smaller went up.
    expect(change(-50, -100)).toEqual({ direction: 'up', percent: 50 });
    expect(change(-100, 50)).toEqual({ direction: 'down', percent: 300 });
  });

  it('writes it as the panel says it', () => {
    expect(changeText({ direction: 'up', percent: 6 }, 'setiembre')).toBe('↑ 6 % más que setiembre');
    expect(changeText({ direction: 'down', percent: 1250 }, 'los 30 días anteriores')).toBe('↓ 1.250 % menos que los 30 días anteriores');
    expect(changeText({ direction: 'same', percent: 0 }, 'setiembre')).toBe('Igual que setiembre');
  });

  it('colours it by whether going up is good news', () => {
    expect(trend(110, 100, 'setiembre', 'up')?.tone).toBe('green');
    expect(trend(110, 100, 'setiembre', 'down')?.tone).toBe('red');
    expect(trend(90, 100, 'setiembre', 'down')?.tone).toBe('green');
    expect(trend(110, 100, 'setiembre', 'neither')?.tone).toBe('grey');
    expect(trend(100, 100, 'setiembre', 'up')?.tone).toBe('grey');
  });

  it('keeps pesos and dollars apart', () => {
    expect(moneyTrend({ UYU: 106, USD: 0 }, { UYU: 100, USD: 0 }, 'setiembre', 'up')).toEqual({ text: '↑ 6 % más que setiembre', tone: 'green' });
    expect(moneyTrend({ UYU: 0, USD: 90 }, { UYU: 0, USD: 100 }, 'setiembre', 'up')).toEqual({ text: '↓ 10 % menos que setiembre, en dólares', tone: 'red' });
    expect(moneyTrend({ UYU: 106, USD: 97 }, { UYU: 100, USD: 100 }, 'setiembre', 'up')).toEqual({ text: 'Contra setiembre: ↑ 6 % en pesos, ↓ 3 % en dólares', tone: 'grey' });
    expect(moneyTrend({ UYU: 106, USD: 110 }, { UYU: 100, USD: 100 }, 'setiembre', 'up')).toEqual({ text: 'Contra setiembre: ↑ 6 % en pesos, ↑ 10 % en dólares', tone: 'green' });
    // Dollars that the month before did not have: only the pesos compare.
    expect(moneyTrend({ UYU: 106, USD: 50 }, { UYU: 100, USD: 0 }, 'setiembre', 'up')).toEqual({ text: '↑ 6 % más que setiembre, en pesos', tone: 'green' });
    expect(moneyTrend({ UYU: 5, USD: 0 }, { UYU: 0, USD: 0 }, 'setiembre', 'up')).toBeNull();
    expect(moneyTrend({ UYU: 0, USD: 0 }, { UYU: 0, USD: 0 }, 'setiembre', 'up')).toBeNull();
  });
});

describe('the period before', () => {
  it('compares a month going on with the same days of the month before, and a past month with the whole one before', () => {
    expect(monthBefore('2026-10-01', '2026-10-27')).toEqual({ from: '2026-09-01', to: '2026-09-27', than: 'a esta altura de setiembre', upTo: '2026-10-27' });
    expect(monthBefore('2026-03-01', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28', than: 'a esta altura de febrero', upTo: '2026-03-31' });
    expect(monthBefore('2026-09-01', '2026-10-27')).toEqual({ from: '2026-08-01', to: '2026-08-31', than: 'agosto', upTo: '2026-09-30' });
    expect(monthBefore('2026-01-01', '2026-10-27')).toEqual({ from: '2025-12-01', to: '2025-12-31', than: 'diciembre', upTo: '2026-01-31' });
  });

  it('gives each period of the panel the one before it, of the same length', () => {
    const today = '2026-10-27';
    expect(periodBefore('mes', { from: '2026-10-01', to: '2026-10-31' }, today)).toEqual({ from: '2026-09-01', to: '2026-09-27', than: 'a esta altura de setiembre', upTo: today });
    expect(periodBefore('mes-anterior', { from: '2026-09-01', to: '2026-09-30' }, today)).toEqual({ from: '2026-08-01', to: '2026-08-31', than: 'agosto', upTo: '2026-09-30' });
    expect(periodBefore('30', { from: '2026-09-28', to: '2026-10-27' }, today)).toEqual({ from: '2026-08-29', to: '2026-09-27', than: 'los 30 días anteriores', upTo: today });
    expect(periodBefore('anio', { from: '2026-01-01', to: '2026-12-31' }, today)).toEqual({ from: '2025-01-01', to: '2025-10-27', than: 'a esta altura del año pasado', upTo: today });
    expect(periodBefore('anio', { from: '2028-01-01', to: '2028-12-31' }, '2028-02-29')).toEqual({ from: '2027-01-01', to: '2027-02-28', than: 'a esta altura del año pasado', upTo: '2028-02-29' });
    expect(periodBefore('fechas', { from: '2026-10-10', to: '2026-10-10' }, today)).toEqual({ from: '2026-10-09', to: '2026-10-09', than: 'el día anterior', upTo: '2026-10-10' });
    expect(periodBefore('fechas', { from: '2026-10-10', to: '2026-10-19' }, today)).toEqual({ from: '2026-09-30', to: '2026-10-09', than: 'los 10 días anteriores', upTo: '2026-10-19' });
    expect(periodBefore('todo', null, today)).toBeNull();
    expect(periodBefore('fechas', { from: '2026-10-19', to: '2026-10-10' }, today)).toBeNull();
  });

  it('cuts dates that go on after today on today, and the days before them on the same day', () => {
    const today = '2026-10-27';
    // 31 days, 27 of them gone: against the first 27 of the 31 days before.
    expect(periodBefore('fechas', { from: '2026-10-01', to: '2026-10-31' }, today)).toEqual({ from: '2026-08-31', to: '2026-09-26', than: 'a esta altura de los 31 días anteriores', upTo: today });
    expect(periodBefore('fechas', { from: today, to: '2026-11-13' }, today)).toEqual({ from: '2026-10-09', to: '2026-10-09', than: 'a esta altura de los 18 días anteriores', upTo: today });
    // Dates still to come have nothing to compare yet.
    expect(periodBefore('fechas', { from: '2026-10-28', to: '2026-11-05' }, today)).toBeNull();
  });

  it('compares nothing when a link brings dates that are not dates', () => {
    const today = '2026-10-27';
    expect(periodBefore('fechas', { from: 'aaa', to: 'zzz' }, today)).toBeNull();
    expect(periodBefore('fechas', { from: '2026-10-01', to: 'foo' }, today)).toBeNull();
    expect(periodBefore('fechas', { from: '2026-02-30', to: '2026-03-10' }, today)).toBeNull();
    expect(periodBefore('mes', { from: '2026-1-1', to: '2026-10-31' }, today)).toBeNull();
    expect(isDay('2026-10-27')).toBe(true);
    expect(isDay('2028-02-29')).toBe(true);
    for (const text of ['2027-02-29', '2026-13-01', '2026-10-32', '2026-10-1', 'aaa', '']) expect(isDay(text)).toBe(false);
  });
});
