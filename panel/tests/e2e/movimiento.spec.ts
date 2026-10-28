// Smooth movement on the live maps (decision of 18/10/2026). The other tests switch motion off, so the trucks jump there;
// here motion is allowed, and a truck that moves glides to its new position with the route following it.
import { expect, type Page, test } from '@playwright/test';
import { BASE, open, prepare, rows, signIn } from './helpers';

test.use({ contextOptions: { reducedMotion: 'no-preference' } });
test.beforeEach(async ({ page }) => prepare(page));

const ANA = '00000000-0000-4000-8000-000000000011';

/** Where Leaflet draws a truck marker, in pixels of the map. */
const markerAt = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => {
    const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec((el as HTMLElement).style.transform);
    return m ? [Number(m[1]), Number(m[2])] : null;
  });

/** Where Leaflet draws a circle marker (an SVG path that starts at its left edge), in pixels of the map. */
const circleAt = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => {
    const m = /^M(-?[\d.]+),(-?[\d.]+)/.exec(el.getAttribute('d') ?? '');
    return m ? [Number(m[1]), Number(m[2])] : null;
  });

/** Heights of a point on screen every 100 ms for a while: enough for the next refresh and the whole glide. */
async function heights(read: () => Promise<number[] | null>, samples: number): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < samples; i++) {
    const p = await read();
    if (p && p[1] !== undefined) out.push(p[1]);
    await new Promise((done) => setTimeout(done, 100));
  }
  return out;
}

/**
 * Zooms the map in, so a couple of kilometres are many pixels, and waits for each animation. With `near`, around that
 * marker (a double click next to it), which Leaflet would stop drawing if the zoom left it out of the view.
 */
async function zoomIn(page: Page, map: string, times: number, near?: string) {
  // The map frames the trip when its route arrives; let that animation end first.
  await page.waitForTimeout(800);
  for (let i = 0; i < times; i++) {
    const box = near ? await page.locator(near).boundingBox() : null;
    if (box) await page.mouse.dblclick(box.x + box.width / 2 + 14, box.y + box.height / 2);
    else await page.locator(`${map} .leaflet-control-zoom-in`).click();
    await page.waitForTimeout(500);
  }
}

test('GPS en vivo: el camión que avanza se desliza hasta su nueva posición y el recorrido lo sigue', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'GPS en vivo');
  await page.getByRole('button', { name: /Volvo FH 460 · ABC1234/ }).click();
  await expect(page.locator('path.fm-route')).toHaveCount(3);
  await zoomIn(page, '.map-live', 2);
  const marker = '.map-live .leaflet-marker-icon[title^="Volvo FH 460 · ABC1234"]';
  const start = await markerAt(page, marker);
  expect(start).not.toBeNull();
  // The phone sends a reading 2,5 km further north.
  await page.route('**/rest/v1/trf_driver_locations*', async (route) => {
    const response = await route.fetch();
    const live = (await response.json()) as { driver_id: string; latitude: number }[];
    await route.fulfill({ response, json: live.map((r) => (r.driver_id === ANA ? { ...r, latitude: r.latitude + 0.0225, recorded_at: BASE } : r)) });
  });
  const ys = await heights(() => markerAt(page, marker), 75);
  const from = start?.[1] ?? 0;
  const to = ys.at(-1) ?? from;
  expect(to).toBeLessThan(from - 25);
  // On the way it went through the places in between, instead of jumping.
  expect(ys.filter((y) => y < from - 3 && y > to + 3).length).toBeGreaterThan(3);
  // The route reaches the truck: a line joins its last reading to the marker.
  await expect(page.locator('path.fm-tail')).toHaveCount(1);
});

test('el mapa de un viaje en curso lleva el camión por las lecturas nuevas y el recorrido crece detrás', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Viajes');
  await rows(page).filter({ hasText: 'ABC1234' }).first().getByRole('link').click();
  await expect(page.locator('.map-trip path.fm-route')).toHaveCount(3);
  const now = '.map-trip path.fm-now';
  await zoomIn(page, '.map-trip', 3, now);
  const start = await circleAt(page, now);
  expect(start).not.toBeNull();
  // The next refresh of the route (the readings saved after the last one shown) brings one more reading, 1,5 km north
  // of Ana's last one, in the same stretch.
  await page.route('**/rest/v1/trf_driver_location_history*', async (route) => {
    const response = await route.fetch();
    const readings = (await response.json()) as object[];
    const refresh = new URL(route.request().url()).searchParams.has('id');
    const more = refresh ? [...readings, { id: 990001, latitude: -34.3705 + 0.0135, longitude: -56.4835, recorded_at: BASE, segment: 1, speed_kmh: 80, estimated: false }] : readings;
    await route.fulfill({ response, json: more });
  });
  const ys = await heights(() => circleAt(page, now), 100);
  const from = start?.[1] ?? 0;
  const to = ys.at(-1) ?? from;
  expect(to).toBeLessThan(from - 25);
  expect(ys.filter((y) => y < from - 3 && y > to + 3).length).toBeGreaterThan(3);
  await expect(page.locator('.route-facts div', { hasText: 'Puntos del recorrido' }).locator('dd')).toHaveText('13');
});
