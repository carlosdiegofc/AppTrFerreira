import { describe, expect, it } from 'vitest';
import { addDays, ago, dayInZone, daysBetween, firstOfMonth, firstOfNextMonth, formatTime, inDays, startOfDay } from '../../src/lib/dates';
import { alerts, paperState, serviceState } from '../../src/lib/papers';

describe('days in Uruguay', () => {
  it('the day changes at local midnight, not at UTC midnight', () => {
    expect(dayInZone(Date.parse('2026-10-18T02:59:00Z'))).toBe('2026-10-17');
    expect(dayInZone(Date.parse('2026-10-18T03:00:00Z'))).toBe('2026-10-18');
  });
  it('a day starts at 03:00 UTC', () => {
    expect(startOfDay('2026-10-18')).toBe('2026-10-18T03:00:00.000Z');
    expect(formatTime(Date.parse('2026-10-18T03:05:00Z'))).toBe('00:05');
  });
  it('counts days and months', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(daysBetween('2026-10-18', '2026-11-17')).toBe(30);
    expect(firstOfMonth('2026-10-18')).toBe('2026-10-01');
    expect(firstOfNextMonth('2026-12-05')).toBe('2027-01-01');
  });
  it('speaks like the app', () => {
    expect(inDays('2026-10-18', '2026-10-18')).toBe('hoy');
    expect(inDays('2026-10-19', '2026-10-18')).toBe('mañana');
    expect(inDays('2026-10-25', '2026-10-18')).toBe('en 7 días');
    expect(inDays('2026-10-17', '2026-10-18')).toBe('ayer');
    expect(inDays('2026-10-10', '2026-10-18')).toBe('hace 8 días');
    const now = Date.parse('2026-10-18T15:00:00Z');
    expect(ago(now - 20_000, now)).toBe('recién');
    expect(ago(now - 4 * 60_000, now)).toBe('hace 4 min');
    expect(ago(now - 3 * 3_600_000, now)).toBe('hace 3 h');
    expect(ago(now - 26 * 3_600_000, now)).toBe('hace 1 día');
  });
});

describe('papers and services (thresholds of the app)', () => {
  const today = '2026-10-18';
  it('papers: expired, within 30 days, later, without date', () => {
    expect(paperState('2026-10-17', today)).toBe('late');
    expect(paperState('2026-10-18', today)).toBe('soon');
    expect(paperState('2026-11-17', today)).toBe('soon');
    expect(paperState('2026-11-18', today)).toBe('ok');
    expect(paperState(null, today)).toBe('nodate');
  });
  it('services: done, late, within 15 days, planned, without date', () => {
    expect(serviceState('2026-10-01', '2026-10-02', today)).toBe('done');
    expect(serviceState('2026-10-17', null, today)).toBe('late');
    expect(serviceState('2026-11-02', null, today)).toBe('soon');
    expect(serviceState('2026-11-03', null, today)).toBe('planned');
    expect(serviceState(null, null, today)).toBe('pending');
  });
  it('lists only what is late or coming up, earliest first, with whose it is', () => {
    const list = alerts(
      [
        { id: 'p1', scope: 'driver', driver_name: 'Chofer Uno', vehicle: '', kind: 'Licencia de conducir', expires_on: '2026-11-01' },
        { id: 'p2', scope: 'vehicle', driver_name: '', vehicle: 'Leyland · HTP1545', kind: 'SOA', expires_on: '2026-10-10' },
        { id: 'p3', scope: 'vehicle', driver_name: '', vehicle: 'Leyland · HTP1545', kind: 'Habilitación MTOP', expires_on: '2027-03-01' },
      ],
      [
        { id: 's1', vehicle: 'Ford Cargo 1722 · GTP4265', kind: 'Cambio de aceite', due_on: '2026-10-25', done_on: null },
        { id: 's2', vehicle: 'Ford Cargo 1722 · GTP4265', kind: 'Frenos', due_on: '2026-10-20', done_on: '2026-10-15' },
      ],
      today,
    );
    expect(list.map((a) => [a.kind, a.owner, a.state, a.detail])).toEqual([
      ['SOA', 'HTP1545', 'late', 'Venció el 10/10/2026'],
      ['Cambio de aceite', 'GTP4265', 'soon', '25/10/2026 · en 7 días'],
      ['Licencia de conducir', 'Chofer Uno', 'soon', 'Vence el 01/11/2026 · en 14 días'],
    ]);
  });
});
