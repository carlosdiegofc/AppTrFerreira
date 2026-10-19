import { describe, expect, it } from 'vitest';
import { between, glideAt, grownTail, MAX_GLIDE_METERS, meters, type Point, sameLines, startGlide, tailStart } from '../../src/lib/glide';

const T0 = Date.parse('2026-10-18T15:00:00Z');
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();
// About 111 m per thousandth of a degree of latitude.
const A: Point = [-34.37, -56.48];
const B: Point = [-34.369, -56.48];
const C: Point = [-34.368, -56.48];

describe('distances and halfway points', () => {
  it('measures metres over the Earth', () => {
    expect(meters(A, B)).toBeCloseTo(111.2, 0);
    expect(meters(A, A)).toBe(0);
  });
  it('the point a fraction of the way, never past either end', () => {
    expect(between(A, C, 0.5)).toEqual([-34.369, -56.48]);
    expect(between(A, C, -1)).toEqual(A);
    expect(between(A, C, 2)).toEqual(C);
  });
});

describe('gliding to the new position', () => {
  it('moves at an even speed from where the truck is drawn to where it is now', () => {
    const g = startGlide([A, C], 1000, 3000);
    expect(g).not.toBeNull();
    if (!g) return;
    expect(glideAt(g, 1000)).toEqual({ at: A, walked: [A, A], done: false });
    const half = glideAt(g, 2500);
    expect(half.at[0]).toBeCloseTo(-34.369, 6);
    expect(half.done).toBe(false);
    expect(glideAt(g, 4000)).toEqual({ at: C, walked: [A, C], done: true });
    expect(glideAt(g, 9000).done).toBe(true);
  });
  it('follows the readings in between, and the walked part is the line behind the truck', () => {
    const g = startGlide([A, B, C], 0, 2000);
    if (!g) throw new Error('should glide');
    const late = glideAt(g, 1500);
    expect(late.at[0]).toBeCloseTo(-34.3685, 6);
    expect(late.walked.slice(0, 2)).toEqual([A, B]);
    expect(late.walked.at(-1)).toEqual(late.at);
  });
  it('jumps when it did not move, when the move is too long or without time', () => {
    expect(startGlide([A, A], 0, 3000)).toBeNull();
    expect(startGlide([A], 0, 3000)).toBeNull();
    expect(startGlide([A, C], 0, 0)).toBeNull();
    const far: Point = [A[0] + (MAX_GLIDE_METERS + 200) / 111_200, A[1]];
    expect(startGlide([A, far], 0, 3000)).toBeNull();
  });
});

describe('what a live route refresh added', () => {
  it('the new points of the last stretch, when the route only grew', () => {
    expect(grownTail([[A, B]], [[A, B, C]])).toEqual({ kept: [A, B], added: [C] });
    expect(grownTail([[A], [B]], [[A], [B, C]])).toEqual({ kept: [B], added: [C] });
  });
  it('nothing to glide when the route changed in another way', () => {
    expect(grownTail([], [[A, B]])).toBeNull();
    expect(grownTail([[A, B]], [[A, B]])).toBeNull();
    expect(grownTail([[A, B]], [[A, B], [C]])).toBeNull();
    expect(grownTail([[A, B]], [[A, C, B]])).toBeNull();
  });
  it('tells a redraw of the same route from a changed one', () => {
    expect(sameLines([[A, B], [C]], [[[...A], [...B]], [[...C]]])).toBe(true);
    expect(sameLines([], [])).toBe(true);
    expect(sameLines([[A, B]], [[A, B, C]])).toBe(false);
    expect(sameLines([[A, B]], [[A], [B]])).toBe(false);
    expect(sameLines([[A, B]], [[A, C]])).toBe(false);
  });
});

describe('joining the route to the truck', () => {
  const last = { latitude: A[0], longitude: A[1], recorded_at: at(0) };
  const truck = (seconds: number, point: Point, state = 'moving') => ({ lat: point[0], lng: point[1], at: T0 + seconds * 1000, state });
  it('from the last reading to a newer, close position on the road', () => {
    expect(tailStart(last, truck(4, B))).toEqual(A);
    expect(tailStart(last, truck(4, B, 'stopped'))).toEqual(A);
  });
  it('not when paused, without signal, older, after a gap or too far', () => {
    expect(tailStart(last, truck(4, B, 'paused'))).toBeNull();
    expect(tailStart(last, truck(4, B, 'nosignal'))).toBeNull();
    expect(tailStart(last, truck(0, B))).toBeNull();
    expect(tailStart(last, truck(-3, B))).toBeNull();
    expect(tailStart(last, truck(91, B))).toBeNull();
    expect(tailStart(last, truck(4, [A[0] + 0.05, A[1]]))).toBeNull();
    expect(tailStart(undefined, truck(4, B))).toBeNull();
    expect(tailStart(last, { lat: null, lng: null, at: null, state: 'moving' })).toBeNull();
  });
});
