import { describe, expect, it } from 'vitest';
import type { Reading } from '../../src/lib/route';
import { inOrder, legs, type Stop, stopState, stopTitle, unloadMs } from '../../src/lib/stops';

const stop = (over: Partial<Stop> = {}): Stop => ({
  id: 's', position: 1, client: 'Molino San José', place: 'San José', arrived_at: null, arrived_lat: null, arrived_lng: null, finished_at: null, finished_by: null, kg: null, ...over,
});
const at = (minutes: number) => new Date(Date.UTC(2026, 9, 15, 12, minutes)).toISOString();
// A truck going north, a reading a minute, one kilometre apart (0.009 degrees of latitude are about a kilometre).
const reading = (minute: number, segment = 0, estimated = false): Reading => ({ latitude: -34 + minute * 0.009, longitude: -56, recorded_at: at(minute), segment, estimated });

describe('stops', () => {
  it('a stop is waiting, then being unloaded, then done', () => {
    expect(stopState(stop())).toBe('waiting');
    expect(stopState(stop({ arrived_at: at(10) }))).toBe('unloading');
    expect(stopState(stop({ arrived_at: at(10), finished_at: at(30) }))).toBe('done');
  });

  it('the title takes the client and the place, or the number', () => {
    expect(stopTitle(stop())).toBe('Molino San José · San José');
    expect(stopTitle(stop({ client: '', place: 'Melo' }))).toBe('Melo');
    expect(stopTitle(stop({ client: ' ', place: '', position: 3 }))).toBe('Parada 3');
  });

  it('the unloading lasts from the arrival to the end, or to now while it goes on', () => {
    expect(unloadMs(stop(), Date.parse(at(50)))).toBeNull();
    expect(unloadMs(stop({ arrived_at: at(10), finished_at: at(35) }), 0)).toBe(25 * 60_000);
    expect(unloadMs(stop({ arrived_at: at(10) }), Date.parse(at(14)))).toBe(4 * 60_000);
  });

  it('the stops go in the order of the trip', () => {
    expect(inOrder([stop({ id: 'b', position: 2 }), stop({ id: 'a', position: 1 })]).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('the kilometres of each leg are the ones the route made between the stops', () => {
    const route = Array.from({ length: 31 }, (_, i) => reading(i));
    const stops = [
      stop({ id: 'a', position: 1, client: 'A', place: '', arrived_at: at(10), finished_at: at(15), finished_by: 'chofer' }),
      stop({ id: 'b', position: 2, client: 'B', place: '', arrived_at: at(20), finished_at: at(22), finished_by: 'movimiento' }),
    ];
    const result = legs(route, stops, at(0), at(30));
    expect(result.map((l) => `${l.from} → ${l.to}`)).toEqual(['Salida → A', 'A → B', 'B → Llegada']);
    // 10 minutes, then 5, then 8, a kilometre each.
    expect(result.map((l) => Math.round(l.meters / 1000))).toEqual([10, 5, 8]);
  });

  it('a stop not reached yet does not cut a leg, and one being unloaded ends the list', () => {
    const route = Array.from({ length: 21 }, (_, i) => reading(i));
    const waiting = [stop({ id: 'a', client: 'A', place: '', arrived_at: at(10), finished_at: at(12) }), stop({ id: 'b', position: 2, client: 'B', place: '' })];
    expect(legs(route, waiting, at(0), at(20)).map((l) => l.to)).toEqual(['A', 'Llegada']);
    const unloading = [stop({ id: 'a', client: 'A', place: '', arrived_at: at(10) })];
    expect(legs(route, unloading, at(0), null).map((l) => l.to)).toEqual(['A']);
    expect(legs(route, [stop()], at(0), at(20))).toEqual([]);
  });

  it('a pause in the route adds no kilometres to the leg', () => {
    const route = [reading(0, 0), reading(1, 0), reading(2, 1), reading(3, 1)];
    const result = legs(route, [stop({ arrived_at: at(3), finished_at: at(3) })], at(0), at(3));
    // Minute 1 to 2 is a pause (another segment): two kilometres counted, not three.
    expect(Math.round((result[0] as { meters: number }).meters / 1000)).toBe(2);
  });
});
