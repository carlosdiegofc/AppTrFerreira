// What each point of the map is, drawn inside its dot (request of 28/10/2026): «$» for a toll, a balance for a scale,
// a speedometer for a speed radar and a flag for the company's own points. Lines on a 24×24 grid, in white over the dot's
// colour, the same on the map and in the list of points.
import type { PointKind } from '../lib/road';

const BADGES: Record<PointKind, readonly string[]> = {
  toll: ['M12 4v16', 'M16 8.5C15.4 7.3 14 6.6 12.2 6.6 10 6.6 8.4 7.7 8.4 9.3s1.6 2.2 3.8 2.7 3.9 1.2 3.9 2.9-1.7 2.6-3.9 2.6c-1.9 0-3.4-.8-4-2.1'],
  scale: ['M12 4v15', 'M8 19h8', 'M5 7h14', 'M5 7l-3 6a3 3 0 0 0 6 0z', 'M19 7l-3 6a3 3 0 0 0 6 0z'],
  radar: ['M3.3 18a10 10 0 1 1 17.4 0', 'M12 15l4.5-5', 'M6.5 12.5h.01', 'M17.5 12.5h.01'],
  place: ['M6 21V4', 'M6 4h12l-2.5 4L18 12H6'],
};

/** The badge as an element, for the markers Leaflet draws outside React. */
export function badgeElement(kind: PointKind): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'road-badge');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of BADGES[kind]) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** The point's dot with its badge, next to its name in the list and the filters. */
export function PointBadge({ kind }: { kind: PointKind }) {
  return (
    <span className={`point-dot road-${kind}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="road-badge">
        {BADGES[kind].map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </span>
  );
}
