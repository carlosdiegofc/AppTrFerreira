import { describe, expect, it } from 'vitest';
import { type ActiveTrip, fleetUnits } from '../../src/lib/fleet';
import { appendReadings, drawable, gapSummary, lastSaved, measuredCount, type Reading, routeLink, routeRuns, validPosition } from '../../src/lib/route';

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

const solid = (...points: [number, number][]) => ({ points, estimated: false });
const dashed = (...points: [number, number][]) => ({ points, estimated: true });

describe('route lines (same rule as the app map, Gaps.kt)', () => {
  it('one line while the readings keep coming', () => {
    expect(routeRuns([reading(0, -34.9, -56.1), reading(30, -34.8, -56.2), reading(120, -34.7, -56.3)])).toEqual([solid([-34.9, -56.1], [-34.8, -56.2], [-34.7, -56.3])]);
  });
  it('a pause starts a new line', () => {
    expect(routeRuns([reading(0, -34.9, -56.1), reading(30, -34.8, -56.2, 0), reading(60, -34.7, -56.3, 1), reading(90, -34.6, -56.4, 1)])).toEqual([
      solid([-34.9, -56.1], [-34.8, -56.2]),
      solid([-34.7, -56.3], [-34.6, -56.4]),
    ]);
  });
  it('after more than 90 seconds without signal the line goes on dashed', () => {
    // About 1,4 km in a minute and a half.
    expect(routeRuns([reading(0, -34.9, -56.1), reading(90, -34.8, -56.2), reading(181, -34.79, -56.21), reading(200, -34.78, -56.22)])).toEqual([
      solid([-34.9, -56.1], [-34.8, -56.2]),
      dashed([-34.8, -56.2], [-34.79, -56.21]),
      solid([-34.79, -56.21], [-34.78, -56.22]),
    ]);
  });
  it('the estimated road of a stretch without signal is dashed, from the reading before to the one after', () => {
    const road = [reading(0, -34.9, -56.1), { ...reading(200, -34.85, -56.12), estimated: true }, { ...reading(400, -34.82, -56.15), estimated: true }, reading(600, -34.8, -56.2), reading(630, -34.79, -56.21)];
    expect(routeRuns(road)).toEqual([dashed([-34.9, -56.1], [-34.85, -56.12], [-34.82, -56.15], [-34.8, -56.2]), solid([-34.8, -56.2], [-34.79, -56.21])]);
    expect(measuredCount(road)).toBe(3);
  });
  it('a cut of more than 3 hours, or a jump no truck could make, stays open', () => {
    expect(routeRuns([reading(0, -34.9, -56.1), reading(3 * 3600 + 1, -34.8, -56.2)])).toEqual([solid([-34.9, -56.1]), solid([-34.8, -56.2])]);
    // 0.189° of latitude in 10 minutes: 126 km/h.
    expect(routeLink(reading(0, -34.7, -56.2), reading(600, -34.511, -56.2))).toBe('none');
    expect(routeLink(reading(0, -34.7, -56.2), reading(600, -34.53, -56.2))).toBe('dashed');
    // Closer than 300 m the truck did not go anywhere: joined dashed, whatever the time.
    expect(routeLink(reading(0, -34.7, -56.2), reading(5 * 3600, -34.7001, -56.2))).toBe('dashed');
  });
  it('readings without a fix are left out and do not break the line', () => {
    const points = [reading(0, -34.9, -56.1), reading(30, 0, 0), reading(60, -34.8, -56.2)];
    expect(drawable(points)).toHaveLength(2);
    expect(routeRuns(points)).toEqual([solid([-34.9, -56.1], [-34.8, -56.2])]);
  });
  it('no readings, no lines', () => {
    expect(routeRuns([])).toEqual([]);
    expect(routeRuns([reading(0, 0, 0)])).toEqual([]);
  });
});

describe('route refresh', () => {
  it('adds only the readings it did not have', () => {
    const shown = [{ id: 1, ...reading(0, -34.9, -56.1) }, { id: 2, ...reading(30, -34.8, -56.2) }];
    const newer = [{ id: 2, ...reading(30, -34.8, -56.2) }, { id: 3, ...reading(60, -34.7, -56.3) }];
    expect(appendReadings(shown, newer).map((p) => p.id)).toEqual([1, 2, 3]);
    expect(appendReadings(shown, [shown[1]!]).map((p) => p.id)).toEqual([1, 2]);
    expect(lastSaved(shown)).toBe(2);
    expect(lastSaved([])).toBeNull();
  });
  it('the estimated road of a stretch, saved when the signal is back, goes in its place by time', () => {
    const shown = [{ id: 1, ...reading(0, -34.9, -56.1) }, { id: 5, ...reading(600, -34.8, -56.2) }];
    const road = [{ id: 7, ...reading(300, -34.85, -56.15), estimated: true }, { id: 8, ...reading(630, -34.79, -56.21) }];
    expect(appendReadings(shown, road).map((p) => p.id)).toEqual([1, 7, 5, 8]);
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

describe('stretches without signal of a trip', () => {
  it('adds the kilometres of the ones filled and counts the ones left open', () => {
    expect(gapSummary([{ meters: 6300, method: 'ruta' }, { meters: 1200, method: 'recta' }, { meters: 0, method: 'sin_rellenar' }])).toEqual({ filled: 2, meters: 7500, open: 1 });
    expect(gapSummary([])).toEqual({ filled: 0, meters: 0, open: 0 });
  });
});
