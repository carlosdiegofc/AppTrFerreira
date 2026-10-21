import { describe, expect, it } from 'vitest';
import { addDays, ago, calendarDay, dayInZone, daysBetween, firstOfMonth, firstOfNextMonth, formatTime, inDays, startOfDay } from '../../src/lib/dates';
import { alerts, kmState, paperState, serviceState, serviceStatus } from '../../src/lib/papers';

describe('days in Uruguay', () => {
  it('the day changes at local midnight, not at UTC midnight', () => {
    expect(dayInZone(Date.parse('2026-10-18T02:59:00Z'))).toBe('2026-10-17');
    expect(dayInZone(Date.parse('2026-10-18T03:00:00Z'))).toBe('2026-10-18');
  });
  it('a day starts at 03:00 UTC', () => {
    expect(startOfDay('2026-10-18')).toBe('2026-10-18T03:00:00.000Z');
    expect(formatTime(Date.parse('2026-10-18T03:05:00Z'))).toBe('00:05');
  });
  it('the calendar day of a date or an instant, as the office reads it', () => {
    // Deleted at 22:00 of the 15th in Uruguay: the 16th in UTC, still the 15th here.
    expect(calendarDay('2026-10-16T01:00:00+00:00')).toBe('2026-10-15');
    expect(calendarDay('2026-10-15')).toBe('2026-10-15');
    expect(calendarDay('15/10/2026')).toBe('2026-10-15');
    expect(calendarDay('ayer')).toBeNull();
    expect(calendarDay(null)).toBeNull();
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

describe('services due by kilometres (estimated)', () => {
  const today = '2026-10-18';
  it('late from the kilometre it was due, coming up 1.000 km before, unknown without kilometres', () => {
    expect(kmState(null, 412_000)).toBeNull();
    expect(kmState(412_500, null)).toBe('unknown');
    expect(kmState(412_500, 412_500)).toBe('late');
    expect(kmState(412_500, 411_500)).toBe('soon');
    expect(kmState(412_500, 411_499)).toBe('planned');
  });
  it('the worse of the date and the kilometres decides, and both are said', () => {
    const both = serviceStatus({ due_on: '2026-12-01', done_on: null, due_km: 412_500 }, today, 412_095);
    expect(both).toMatchObject({ state: 'soon', dateState: 'planned', kmState: 'soon', byDate: 'Para el 01/12/2026', byKm: 'A los 412.500 km · faltan unos 405 km' });
    expect(serviceStatus({ due_on: '2026-10-10', done_on: null, due_km: 500_000 }, today, 412_095).state).toBe('late');
    expect(serviceStatus({ due_on: null, done_on: null, due_km: 412_000 }, today, 412_095)).toMatchObject({ state: 'late', byDate: null, byKm: 'Era a los 412.000 km · se pasó unos 95 km' });
    expect(serviceStatus({ due_on: null, done_on: null, due_km: 412_095 }, today, 412_095).byKm).toBe('Era a los 412.095 km · ya llegó');
  });
  it('without kilometres to compare, a service due only by kilometres is pending', () => {
    expect(serviceStatus({ due_on: null, done_on: null, due_km: 160_000 }, today, null)).toMatchObject({ state: 'pending', byKm: 'A los 160.000 km · sin kilometraje para estimar cuánto falta' });
    expect(serviceStatus({ due_on: null, done_on: null, due_km: null }, today, null)).toMatchObject({ state: 'pending', byDate: 'Sin fecha prevista', byKm: null });
    expect(serviceStatus({ due_on: '2026-10-20', done_on: null, due_km: 160_000 }, today, null).state).toBe('soon');
    expect(serviceStatus({ due_on: '2026-10-20', done_on: '2026-10-19', due_km: 160_000 }, today, 170_000)).toMatchObject({ state: 'done', byDate: 'Hecho el 19/10/2026', byKm: null });
  });
  it('the start screen warns by kilometres with the estimate of the truck, dated today', () => {
    const list = alerts(
      [],
      [
        { id: 's1', vehicle: 'Ford Cargo 1722 · JKL3456', kind: 'Cambio de aceite', due_on: null, done_on: null, due_km: 412_500 },
        { id: 's2', vehicle: 'Volvo FH 460 · ABC1234', kind: 'Cambio de filtros', due_on: null, done_on: null, due_km: 160_000 },
        { id: 's3', vehicle: 'Scania R450 · DEF5678', kind: 'Frenos', due_on: '2026-10-25', done_on: null, due_km: 250_500 },
        { id: 's4', vehicle: 'Scania R450 · DEF5678', kind: 'Cubiertas', due_on: '2026-10-16', done_on: null, due_km: null },
      ],
      today,
      (vehicle) => (vehicle.startsWith('Ford') ? 412_095 : vehicle.startsWith('Scania') ? 250_040 : null),
    );
    expect(list.map((a) => [a.kind, a.owner, a.state, a.date, a.detail])).toEqual([
      ['Cubiertas', 'DEF5678', 'late', '2026-10-16', 'Era para el 16/10/2026'],
      ['Cambio de aceite', 'JKL3456', 'soon', today, 'A los 412.500 km · faltan unos 405 km'],
      ['Frenos', 'DEF5678', 'soon', '2026-10-25', '25/10/2026 · en 7 días · A los 250.500 km · faltan unos 460 km'],
    ]);
  });
});
