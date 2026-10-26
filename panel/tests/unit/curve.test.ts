import { describe, expect, it } from 'vitest';
import { areaPath, smoothPath } from '../../src/lib/curve';

// The y of a cubic piece at t, from the four numbers of «C» and its start.
const cubic = (y0: number, c1: number, c2: number, y1: number, t: number) => (1 - t) ** 3 * y0 + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t ** 2 * c2 + t ** 3 * y1;
const pieces = (path: string) =>
  [...path.matchAll(/C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)/g)].map((m) => m.slice(1).map(Number) as [number, number, number, number, number, number]);

describe('smoothPath', () => {
  it('starts at the first point, goes through each one and ends at the last', () => {
    const path = smoothPath([
      { x: 0, y: 10 },
      { x: 10, y: 40 },
      { x: 20, y: 25 },
      { x: 30, y: 60 },
    ]);
    expect(path.startsWith('M0,10 C')).toBe(true);
    expect(pieces(path).map((p) => [p[4], p[5]])).toEqual([
      [10, 40],
      [20, 25],
      [30, 60],
    ]);
  });

  it('keeps months at zero on the baseline before a rise', () => {
    const path = smoothPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 50 },
    ]);
    const [first, second] = pieces(path);
    expect([first![1], first![3], first![5]]).toEqual([0, 0, 0]);
    expect([second![1], second![3], second![5]]).toEqual([0, 0, 0]);
  });

  it('never goes past the points it joins', () => {
    const points = [
      { x: 0, y: 5 },
      { x: 10, y: 80 },
      { x: 20, y: 70 },
      { x: 30, y: 0 },
      { x: 40, y: 90 },
    ];
    let y0 = points[0]!.y;
    pieces(smoothPath(points)).forEach(([, c1, , c2, , y1]) => {
      for (let t = 0; t <= 1; t += 0.05) {
        const y = cubic(y0, c1, c2, y1, t);
        expect(y).toBeGreaterThanOrEqual(Math.min(y0, y1) - 1e-9);
        expect(y).toBeLessThanOrEqual(Math.max(y0, y1) + 1e-9);
      }
      y0 = y1;
    });
  });

  it('draws one point as a dot and two as a straight line', () => {
    expect(smoothPath([])).toBe('');
    expect(smoothPath([{ x: 5, y: 7 }])).toBe('M5,7');
    expect(
      smoothPath([
        { x: 0, y: 1 },
        { x: 10, y: 2 },
      ]),
    ).toBe('M0,1 L10,2');
  });
});

describe('areaPath', () => {
  it('closes the line down to the baseline', () => {
    const area = areaPath(
      [
        { x: 0, y: 10 },
        { x: 10, y: 0 },
      ],
      100,
    );
    expect(area).toBe('M0,10 L10,0 L10,100 L0,100 Z');
  });
});
