// The smooth line of a chart through its points: monotone cubic pieces (Fritsch and Carlson, as d3's curveMonotoneX
// draws them), so between two points it never goes above the higher one nor below the lower one, and a month at zero
// stays on the baseline.

export interface Point {
  x: number;
  y: number;
}

const sign = (v: number) => (v < 0 ? -1 : 1);

/** The slope at the middle point of three, as the monotone curve takes it. */
function middleSlope(a: Point, b: Point, c: Point): number {
  const h0 = b.x - a.x;
  const h1 = c.x - b.x;
  const s0 = (b.y - a.y) / h0;
  const s1 = (c.y - b.y) / h1;
  const p = (s0 * h1 + s1 * h0) / (h0 + h1);
  return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
}

/** The slope at an end point, from the slope next to it. */
const endSlope = (a: Point, b: Point, t: number) => {
  const h = b.x - a.x;
  return h ? ((3 * (b.y - a.y)) / h - t) / 2 : t;
};

const n = (v: number) => Math.round(v * 100) / 100;

/** The SVG path of the line («M … C …»), from left to right; one point is a dot, two a straight line. */
export function smoothPath(points: readonly Point[]): string {
  if (points.length === 0) return '';
  const first = points[0]!;
  if (points.length < 3) return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${n(p.x)},${n(p.y)}`).join(' ');
  const slopes = points.map((p, i) => (i === 0 || i === points.length - 1 ? 0 : middleSlope(points[i - 1]!, p, points[i + 1]!)));
  slopes[0] = endSlope(points[0]!, points[1]!, slopes[1]!);
  const last = points.length - 1;
  slopes[last] = endSlope(points[last - 1]!, points[last]!, slopes[last - 1]!);
  let path = `M${n(first.x)},${n(first.y)}`;
  for (let i = 0; i < last; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = (b.x - a.x) / 3;
    path += ` C${n(a.x + dx)},${n(a.y + dx * slopes[i]!)} ${n(b.x - dx)},${n(b.y - dx * slopes[i + 1]!)} ${n(b.x)},${n(b.y)}`;
  }
  return path;
}

/** The same line closed down to the baseline, for the shade under it. */
export function areaPath(points: readonly Point[], baseline: number): string {
  if (points.length === 0) return '';
  return `${smoothPath(points)} L${n(points.at(-1)!.x)},${n(baseline)} L${n(points[0]!.x)},${n(baseline)} Z`;
}
