// How a big number changed against the period before (the «vidrio» design of 26/10/2026, with the second delivery of
// part 12b): «↑ 6 % más que setiembre». The period before has the same length: a month going on is compared with the
// same days of the month before, the last 30 days with the 30 before them. Pesos and dollars change each on its own.
// Pure functions.
import { addDays, daysBetween, firstOfMonth } from './dates';
import { monthLabel } from './drivers';
import { count } from './format';

export interface Change {
  /** 'same' when it moved less than half a percent. */
  direction: 'up' | 'down' | 'same';
  /** Rounded, without a sign. */
  percent: number;
}

/** How much current moved from previous; null when previous was 0 and there is nothing to compare with. */
export function change(current: number, previous: number): Change | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  const ratio = ((current - previous) / Math.abs(previous)) * 100;
  const percent = Math.round(Math.abs(ratio));
  if (percent === 0) return { direction: 'same', percent: 0 };
  return { direction: ratio > 0 ? 'up' : 'down', percent };
}

/** «↑ 6 % más que setiembre», «↓ 12 % menos que los 30 días anteriores», «Igual que setiembre». */
export function changeText(c: Change, than: string): string {
  if (c.direction === 'same') return `Igual que ${than}`;
  return `${c.direction === 'up' ? '↑' : '↓'} ${count(c.percent)} % ${c.direction === 'up' ? 'más' : 'menos'} que ${than}`;
}

/** Whether going up is good news (billed, collected, profit), bad news (spent) or neither (litres, kilometres). */
export type Good = 'up' | 'down' | 'neither';

export interface Trend {
  text: string;
  tone: 'green' | 'red' | 'grey';
}

const toneOf = (c: Change, good: Good): Trend['tone'] => (c.direction === 'same' || good === 'neither' ? 'grey' : (c.direction === 'up') === (good === 'up') ? 'green' : 'red');

/** The change of a number, with its tone; null without a period before to compare with. */
export function trend(current: number, previous: number, than: string, good: Good): Trend | null {
  const c = change(current, previous);
  return c ? { text: changeText(c, than), tone: toneOf(c, good) } : null;
}

const NAMES = { UYU: 'en pesos', USD: 'en dólares' } as const;

/**
 * The change of an amount in pesos and dollars, each on its own. With only one currency in both periods it reads as one
 * number; with both, «Contra setiembre: ↑ 6 % en pesos, ↓ 3 % en dólares». A currency the period before did not have is
 * left out.
 */
export function moneyTrend(current: { UYU: number; USD: number }, previous: { UYU: number; USD: number }, than: string, good: Good): Trend | null {
  const used = (['UYU', 'USD'] as const).filter((c) => current[c] !== 0 || previous[c] !== 0);
  if (used.length === 1) {
    const only = used[0] as 'UYU' | 'USD';
    const t = trend(current[only], previous[only], than, good);
    // Only dollars: it says so, as pesos go without saying.
    return t && only === 'USD' ? { ...t, text: `${t.text}, ${NAMES.USD}` } : t;
  }
  const parts = used.map((c) => ({ c, change: change(current[c], previous[c]) })).filter((p): p is { c: 'UYU' | 'USD'; change: Change } => p.change !== null);
  if (parts.length === 0) return null;
  if (parts.length === 1) {
    const [p] = parts as [{ c: 'UYU' | 'USD'; change: Change }];
    return { text: `${changeText(p.change, than)}, ${NAMES[p.c]}`, tone: toneOf(p.change, good) };
  }
  const tones = new Set(parts.map((p) => toneOf(p.change, good)));
  const say = (c: Change) => (c.direction === 'same' ? 'igual' : `${c.direction === 'up' ? '↑' : '↓'} ${count(c.percent)} %`);
  return { text: `Contra ${than}: ${parts.map((p) => `${say(p.change)} ${NAMES[p.c]}`).join(', ')}`, tone: tones.size === 1 ? ([...tones][0] as Trend['tone']) : 'grey' };
}

/** The period to compare with, and how to name it. */
export interface Before {
  from: string;
  to: string;
  than: string;
}

/** The same day of the month before, or its last day when it is shorter (31/03 → 28/02). */
function sameDayMonthBefore(day: string): string {
  const first = firstOfMonth(addDays(firstOfMonth(day), -1));
  const last = addDays(firstOfMonth(day), -1);
  const wanted = `${first.slice(0, 8)}${day.slice(8, 10)}`;
  return wanted > last ? last : wanted;
}

/**
 * The period before a month: the whole month before, or, for the month going on (today in it), the month before up to
 * the same day.
 */
export function monthBefore(month: string, today: string): Before {
  const first = firstOfMonth(addDays(month, -1));
  const name = monthLabel(first).replace(/ de \d+$/, '');
  if (firstOfMonth(today) === month) return { from: first, to: sameDayMonthBefore(today), than: `a esta altura de ${name}` };
  return { from: first, to: addDays(month, -1), than: name };
}

/**
 * The period before one of Gastos y finanzas, Combustible and Métricas, of the same length: this month against the month
 * before up to the same day, the month before against the one before it, the last 30 or 90 days against the ones before,
 * this year against the last one up to the same day, and some dates against as many days before. Null for «Todo».
 */
export type PeriodName = 'mes' | 'mes-anterior' | '30' | '90' | 'anio' | 'fechas' | 'todo';

export function periodBefore(kind: PeriodName, range: { from: string; to: string } | null, today: string): Before | null {
  if (kind === 'todo' || range === null || range.to < range.from) return null;
  if (kind === 'mes') return monthBefore(firstOfMonth(today), today);
  if (kind === 'mes-anterior') return monthBefore(range.from, today);
  if (kind === 'anio') {
    const year = Number(today.slice(0, 4)) - 1;
    const sameDay = `${year}${today.slice(4)}`;
    // 29/02 of a leap year goes against 28/02.
    const to = sameDay.endsWith('-02-29') ? `${year}-02-28` : sameDay;
    return { from: `${year}-01-01`, to, than: 'a esta altura del año pasado' };
  }
  const days = daysBetween(range.from, range.to) + 1;
  return { from: addDays(range.from, -days), to: addDays(range.from, -1), than: days === 1 ? 'el día anterior' : `los ${count(days)} días anteriores` };
}
