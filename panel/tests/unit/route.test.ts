import { describe, expect, it } from 'vitest';
import { type ActiveTrip, fleetUnits } from '../../src/lib/fleet';
import { appendReadings, drawable, type Reading, routeLines, validPosition } from '../../src/lib/route';

const T0 = Date.parse('2026-10-18T15:00:00Z');
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();
const reading = (seconds: number, lat: number, lng: number, segment = 0): Reading => ({ latitude: lat, longitude: lng, recorded_at: at(seconds), segment });

describe('positions (same rule as validLatLng in the current panel)', () => {
  it('a reading without a fix is not a place', () => {
    expect(validPosition(0, 0)).toBe(false);
    expect(validPosition(-34.9, -56.16)).toBe(true);
    expect(validPosition(0, -56.16)).toBe(true);
  });
  it('out of the globe or missing is not a place', () => {
    expect(validPosition(91, 10)).toBe(false);
    expect(validPosition(10, -181)).toBe(false);
    expect(validPosition(Number.NaN, 10)).toBe(false);
    expect(validPosition(null, 10)).toBe(false);
    expect(validPosition(undefined, undefined)).toBe(false);
  });
});

describe('route lines (same rule as routeSegments in the current panel and the app map)', () => {
  it('one line while the readings keep coming', () => {
    expect(routeLines([reading(0, -34.9, -56.1), reading(30, -34.8, -56.2), reading(120, -34.7, -56.3)])).toEqual([
      [[-34.9, -56.1], [-34.8, -56.2], [-34.7, -56.3]],
    ]);
  });
  it('a pause starts a new line', () => {
    expect(routeLines([reading(0, -34.9, -56.1), reading(30, -34.8, -56.2, 0), reading(60, -34.7, -56.3, 1), reading(90, -34.6, -56.4, 1)])).toEqual([
      [[-34.9, -56.1], [-34.8, -56.2]],
      [[-34.7, -56.3], [-34.6, -56.4]],
    ]);
  });
  it('more than 90 seconds without signal leaves the route open', () => {
    expect(routeLines([reading(0, -34.9, -56.1), reading(90, -34.8, -56.2), reading(181, -34.7, -56.3), reading(200, -34.6, -56.4)])).toEqual([
      [[-34.9, -56.1], [-34.8, -56.2]],
      [[-34.7, -56.3], [-34.6, -56.4]],
    ]);
  });
  it('readings without a fix are left out and do not break the line', () => {
    const points = [reading(0, -34.9, -56.1), reading(30, 0, 0), reading(60, -34.8, -56.2)];
    expect(drawable(points)).toHaveLength(2);
    expect(routeLines(points)).toEqual([[[-34.9, -56.1], [-34.8, -56.2]]]);
  });
  it('no readings, no lines', () => {
    expect(routeLines([])).toEqual([]);
    expect(routeLines([reading(0, 0, 0)])).toEqual([]);
  });
});

describe('route refresh', () => {
  it('adds only the readings it did not have; the last one shown comes again', () => {
    const shown = [{ id: 1, ...reading(0, -34.9, -56.1) }, { id: 2, ...reading(30, -34.8, -56.2) }];
    const newer = [{ id: 2, ...reading(30, -34.8, -56.2) }, { id: 3, ...reading(60, -34.7, -56.3) }];
    expect(appendReadings(shown, newer).map((p) => p.id)).toEqual([1, 2, 3]);
    expect(appendReadings(shown, [shown[1]!]).map((p) => p.id)).toEqual([1, 2]);
  });
});

describe('trucks on the map', () => {
  it('a truck whose last reading has no fix is listed but not placed', () => {
    const trip: ActiveTrip = { id: 't1', driver_id: 'd1', driver_name: 'Chofer Uno', vehicle: 'Leyland · HTP1545', started_at: at(-3600), paused: false, load_type: 'loaded', distance_meters: 1000, last: { latitude: 0, longitude: 0, speed_kmh: 60, recorded_at: at(-60) } };
    const [unit] = fleetUnits([trip], [], [{ model: 'Leyland', plate: 'HTP1545' }], T0);
    expect(unit).toMatchObject({ key: 'trip:t1', lat: null, lng: null, state: 'moving' });
  });
  it('an idle truck is placed where its last trip ended, if that place is known', () => {
    const units = fleetUnits([], [{ driver_name: 'Chofer Dos', vehicle: 'Leyland · HTP1545', ended_at: at(-7200), arrival_lat: 0, arrival_lng: 0 }], [{ model: 'Leyland', plate: 'HTP1545' }], T0);
    expect(units[0]).toMatchObject({ state: 'idle', lat: null, lng: null, driver: 'Chofer Dos' });
  });
});
