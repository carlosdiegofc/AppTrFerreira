import { describe, expect, it } from 'vitest';
import { ACTIVE_FOR_MS, compareVersions, driverPresence, type PresenceRow } from '../../src/lib/presence';

const NOW = Date.parse('2026-10-18T15:00:00Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const row = (id: string, name: string, version: string, seenMinutes: number, place?: { lat: number; lng: number; minutes: number }): PresenceRow => ({
  driver_id: id,
  driver_name: name,
  vehicle: null,
  app_version: version,
  seen_at: ago(seenMinutes),
  latitude: place?.lat ?? null,
  longitude: place?.lng ?? null,
  accuracy_m: place ? 12 : null,
  located_at: place ? ago(place.minutes) : null,
});

describe('app versions', () => {
  it('compares part by part, as numbers', () => {
    expect(compareVersions('0.17.0', '0.16.3')).toBeGreaterThan(0);
    expect(compareVersions('0.16.10', '0.16.9')).toBeGreaterThan(0);
    expect(compareVersions('0.17', '0.17.0')).toBe(0);
    expect(compareVersions('0.17.0', '0.17.1')).toBeLessThan(0);
  });
});

describe('who has the app open', () => {
  it('on a trip first, then active, then seen earlier; the newest notice first in each', () => {
    const list = driverPresence(
      [row('c', 'Carla', '0.17.0', 180), row('d', 'Diego', '0.17.1', 2), row('a', 'Ana', '0.17.1', 1), row('e', 'Emilia', '0.17.0', 5)],
      new Set(['a']),
      NOW,
    );
    expect(list.map((p) => [p.name, p.state])).toEqual([
      ['Ana', 'trip'],
      ['Diego', 'active'],
      ['Emilia', 'active'],
      ['Carla', 'seen'],
    ]);
  });
  it('a driver seen in the last 10 minutes is active; after that, only seen', () => {
    const [fresh] = driverPresence([row('a', 'Ana', '0.17.0', 9)], new Set(), NOW);
    const [old] = driverPresence([row('a', 'Ana', '0.17.0', ACTIVE_FOR_MS / 60_000 + 1)], new Set(), NOW);
    expect(fresh?.state).toBe('active');
    expect(old?.state).toBe('seen');
  });
  it('says when a newer version is in use in the fleet', () => {
    const list = driverPresence([row('a', 'Ana', '0.17.1', 1), row('b', 'Bruno', '0.17.0', 1)], new Set(), NOW);
    expect(list.find((p) => p.name === 'Bruno')?.newer).toBe('0.17.1');
    expect(list.find((p) => p.name === 'Ana')?.newer).toBeNull();
  });
});

describe('where an active driver is', () => {
  it('the position taken with the app open, while active and recent', () => {
    const [p] = driverPresence([row('d', 'Diego', '0.17.0', 2, { lat: -31.385, lng: -57.955, minutes: 2 })], new Set(), NOW);
    expect(p?.place).toEqual({ lat: -31.385, lng: -57.955, at: NOW - 2 * 60_000, accuracy: 12 });
  });
  it('nothing on a trip (the trip shows where the truck is), when only seen, with an old position or without a fix', () => {
    const at = { lat: -31.385, lng: -57.955, minutes: 2 };
    expect(driverPresence([row('d', 'Diego', '0.17.0', 2, at)], new Set(['d']), NOW)[0]?.place).toBeNull();
    expect(driverPresence([row('d', 'Diego', '0.17.0', 30, { ...at, minutes: 30 })], new Set(), NOW)[0]?.place).toBeNull();
    expect(driverPresence([row('d', 'Diego', '0.17.0', 2, { ...at, minutes: 40 })], new Set(), NOW)[0]?.place).toBeNull();
    expect(driverPresence([row('d', 'Diego', '0.17.0', 2, { lat: 0, lng: 0, minutes: 2 })], new Set(), NOW)[0]?.place).toBeNull();
  });
});
