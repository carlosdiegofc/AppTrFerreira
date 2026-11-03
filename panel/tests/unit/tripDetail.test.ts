import { describe, expect, it } from 'vitest';
import { halts, spotAt } from '../../src/lib/tripDetail';

const T0 = Date.parse('2026-11-03T12:00:00Z');
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();
const p = (seconds: number, lng: number, speed: number | null = null, segment = 0, estimated = false) => ({ latitude: -34.5, longitude: lng, recorded_at: at(seconds), segment, speed_kmh: speed, estimated });

// 0.001° of longitude here is about 92 m.
describe('the times the truck stood still (3/11/2026)', () => {
  it('ten minutes in the same place is a stop, from its first reading to its last', () => {
    const route = [p(0, -56.3, 80), p(60, -56.28, 80), p(90, -56.2799, 0), ...Array.from({ length: 20 }, (_, k) => p(120 + k * 30, -56.27995, 0)), p(780, -56.26, 60)];
    const found = halts(route);
    expect(found).toHaveLength(1);
    expect(found[0]?.from).toBe(at(60));
    expect(found[0]?.to).toBe(at(690));
    expect(found[0]?.paused).toBe(false);
  });
  it('a traffic light is not a stop', () => {
    expect(halts([p(0, -56.3, 60), p(60, -56.299, 0), p(120, -56.2989, 0), p(180, -56.28, 60)])).toEqual([]);
  });
  it('a pause in the same place is marked as a pause', () => {
    const found = halts([p(0, -56.3, 60), p(30, -56.29, 0, 0), p(1830, -56.29, 0, 1), p(1900, -56.2, 60, 1)]);
    expect(found).toHaveLength(1);
    expect(found[0]?.paused).toBe(true);
    expect(found[0]?.ms).toBe(1800_000);
  });
  it('the estimated road of a stretch without signal is not a stop', () => {
    expect(halts([p(0, -56.3, 60), p(400, -56.3, null, 0, true), p(800, -56.3, null, 0, true), p(1200, -56.2, 60)])).toEqual([]);
  });
});

describe('what the GPS read where the office taps the route', () => {
  const route = [p(0, -56.3, 50), p(60, -56.29, 70), p(120, -56.28, 90)];
  it('the nearest reading, with its speed and the kilometres up to it', () => {
    const spot = spotAt(route, -34.5001, -56.2801);
    expect(spot?.recorded_at).toBe(at(120));
    expect(spot?.speed_kmh).toBe(90);
    expect(Math.round((spot?.meters ?? 0) / 10)).toBe(Math.round(1834 / 10));
  });
  it('a tap far from the route is not on it', () => {
    expect(spotAt(route, -34.6, -56.29)).toBeNull();
    expect(spotAt([], -34.5, -56.3)).toBeNull();
  });
  it('a reading without speed says so', () => {
    expect(spotAt([p(0, -56.3)], -34.5, -56.3)?.speed_kmh).toBeNull();
  });
});
