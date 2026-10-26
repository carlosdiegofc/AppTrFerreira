// The base of every map and the full screen of the GPS and trip maps (decisions of 22/10/2026 and 26/10/2026): Google's
// streets, satellite and traffic, and OpenStreetMap only while Google does not answer. Google's Map Tiles API is
// replaced by the stand-in of helpers.ts: no request leaves the computer. The build of these tests has a made-up key.
import { expect, type Page, test } from '@playwright/test';
import { googleStandIn, open, prepare, rows, shot, signIn } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

const googleTiles = (map: ReturnType<Page['locator']>, session: string) => map.locator(`img.leaflet-tile[src^="https://tile.googleapis.com/v1/2dtiles/"][src*="session=${session}"]`);
const osmTiles = (map: ReturnType<Page['locator']>) => map.locator('img.leaflet-tile[src^="https://tile.openstreetmap.org/"]');
/** What the panel asks Google for each kind of session: on the phone, with sharper tiles. */
const sharp = () => (test.info().project.name === 'celular' ? { scale: 'scaleFactor2x', highDpi: true } : {});

test('el mapa del GPS se abre en pantalla completa con sus camiones y «Ver todos», y vuelve', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'GPS en vivo');
  const card = page.locator('.gps-map');
  await expect(card.locator('.fm-tag', { hasText: 'ABC1234' })).toBeVisible();
  await card.getByRole('button', { name: 'Pantalla completa' }).click();
  await expect(card).toHaveClass(/map-full/);
  const view = page.viewportSize();
  const box = await card.boundingBox();
  expect(box && view && Math.round(box.x) === 0 && Math.round(box.y) === 0 && Math.round(box.width) === view.width && Math.round(box.height) === view.height).toBe(true);
  // What was on the map is still there, and so is the button that shows the whole fleet.
  await expect(card.locator('.fm-tag', { hasText: 'ABC1234' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Ver todos' })).toBeVisible();
  await shot(page, 'gps-pantalla-completa');
  await page.keyboard.press('Escape');
  await expect(card).not.toHaveClass(/map-full/);
  await card.getByRole('button', { name: 'Pantalla completa' }).click();
  await card.getByRole('button', { name: 'Salir de pantalla completa' }).click();
  await expect(card).not.toHaveClass(/map-full/);
  // The small map of Inicio: Google's streets with its logo, without the switch nor the full screen.
  await open(page, 'Inicio');
  const home = page.locator('.map-home');
  await expect(home.locator('.fm-tag', { hasText: 'ABC1234' })).toBeVisible();
  await expect(googleTiles(home, 'sesion-calles').first()).toBeAttached();
  await expect(home.getByRole('img', { name: 'Google Maps' })).toBeVisible();
  await expect(home.getByRole('button', { name: 'Pantalla completa' })).toHaveCount(0);
  await expect(home.getByRole('group', { name: 'Vista del mapa' })).toHaveCount(0);
  await expect(home.getByRole('button', { name: 'Tráfico' })).toHaveCount(0);
});

test('el GPS y el viaje se ven con el mapa de Google: calles, satélite y tráfico, con su logo y sus créditos, y lo recuerdan', async ({ page }) => {
  const asked = await googleStandIn(page);
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'GPS en vivo');
  const map = page.locator('.gps-map .fleet-map');
  const views = map.getByRole('group', { name: 'Vista del mapa' });
  const traffic = map.getByRole('button', { name: 'Tráfico' });
  // The streets are Google's: OpenStreetMap does not show next to them.
  await expect(views.getByRole('button', { name: 'Mapa' })).toHaveAttribute('aria-pressed', 'true');
  await expect(traffic).toHaveAttribute('aria-pressed', 'false');
  await expect(map).toHaveClass(/is-google/);
  await expect(googleTiles(map, 'sesion-calles').first()).toBeAttached();
  await expect(osmTiles(map)).toHaveCount(0);
  // Google's credits as text, with its name and its terms, and its logo.
  const credits = map.locator('.leaflet-control-attribution');
  await expect(credits).toContainText('Google Maps · Datos ©2026 Prueba <b>sin HTML</b> · Términos');
  await expect(credits.locator('b')).toHaveCount(0);
  await expect(credits.getByRole('link', { name: 'Términos' })).toHaveAttribute('href', 'https://www.google.com/help/terms_maps.html');
  await expect(map.getByRole('img', { name: 'Google Maps' })).toBeVisible();
  const logo = await map.locator('img.map-google-logo').boundingBox();
  expect(logo && logo.height >= 16 && logo.height <= 19).toBe(true);
  // The credits never cover the logo, not even on a phone: they keep 10 px clear to its right.
  const line = await credits.boundingBox();
  expect(logo && line && logo.x + logo.width + 10 <= line.x).toBe(true);

  // Satellite, with the roads and their names; then the traffic of now on top.
  await views.getByRole('button', { name: 'Satélite' }).click();
  await expect(views.getByRole('button', { name: 'Satélite' })).toHaveAttribute('aria-pressed', 'true');
  await expect(map).toHaveClass(/is-satellite/);
  await expect(googleTiles(map, 'sesion-satelite').first()).toBeAttached();
  await expect(googleTiles(map, 'sesion-calles')).toHaveCount(0);
  await traffic.click();
  await expect(traffic).toHaveAttribute('aria-pressed', 'true');
  await expect(googleTiles(map, 'sesion-trafico').first()).toBeAttached();
  // The trucks and the points stay on top.
  await expect(map.locator('.fm-tag', { hasText: 'ABC1234' })).toBeVisible();
  await shot(page, 'gps-satelite-trafico');

  // Each session in Spanish, from Uruguay, with the key of the build; one of each kind.
  const sessions = asked.filter((a) => a.url.includes('/v1/createSession'));
  expect(sessions.every((a) => a.url.includes('key=clave-de-prueba'))).toBe(true);
  expect(sessions.map((a) => JSON.parse(a.body ?? '{}'))).toEqual([
    { mapType: 'roadmap', language: 'es-419', region: 'UY', ...sharp() },
    { mapType: 'satellite', language: 'es-419', region: 'UY', layerTypes: ['layerRoadmap'], ...sharp() },
    { mapType: 'roadmap', language: 'es-419', region: 'UY', layerTypes: ['layerTraffic'], overlay: true, imageFormat: 'png', ...sharp() },
  ]);

  // The choices are kept: a trip's map opens in satellite with the traffic, with the same sessions.
  await open(page, 'Viajes');
  await rows(page).filter({ hasText: 'ABC1234' }).first().getByRole('link').click();
  const trip = page.locator('.map-trip');
  await expect(trip).toHaveClass(/is-satellite/);
  await expect(trip.locator('path.fm-route')).toHaveCount(3);
  await expect(googleTiles(trip, 'sesion-trafico').first()).toBeAttached();
  expect(asked.filter((a) => a.url.includes('/v1/createSession'))).toHaveLength(3);
  await shot(page, 'viaje-satelite');
  // Full screen on the trip's map, back to the streets, and without the traffic.
  await trip.getByRole('button', { name: 'Pantalla completa' }).click();
  await expect(trip).toHaveClass(/map-full/);
  await trip.getByRole('button', { name: 'Salir de pantalla completa' }).click();
  await trip.getByRole('group', { name: 'Vista del mapa' }).getByRole('button', { name: 'Mapa' }).click();
  await expect(trip).not.toHaveClass(/is-satellite/);
  await expect(googleTiles(trip, 'sesion-calles').first()).toBeAttached();
  await trip.getByRole('button', { name: 'Tráfico' }).click();
  await expect(googleTiles(trip, 'sesion-trafico')).toHaveCount(0);
  await expect(trip.locator('img.map-google-logo')).toBeVisible();
  await expect(osmTiles(trip)).toHaveCount(0);
});

test('de noche, las calles de Google vienen con sus colores nocturnos y no se oscurecen aparte', async ({ page }) => {
  const asked = await googleStandIn(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'GPS en vivo');
  const map = page.locator('.gps-map .fleet-map');
  await expect(googleTiles(map, 'sesion-calles').first()).toBeAttached();
  const session = asked.find((a) => a.url.includes('/v1/createSession'));
  expect(JSON.parse(session?.body ?? '{}')).toMatchObject({ mapType: 'roadmap', styles: expect.arrayContaining([{ elementType: 'geometry', stylers: [{ color: '#242f3e' }] }]) });
  await expect(map.locator('.leaflet-tile-pane')).toHaveCSS('filter', 'none');
  await shot(page, 'gps-noche');
});

test('los peajes y las balanzas de la 0006 y los radares de la 0007: en orden en la lista, de lejos solo el punto y de cerca con su nombre', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'GPS en vivo');
  await page.getByRole('button', { name: 'Peajes, balanzas y radares', exact: true }).click();
  const list = page.locator('.road-controls .road-point');
  // 17 tolls, then 24 scales, then 122 radars, each by name and named once.
  await expect(list).toHaveCount(163);
  await expect(list.nth(0).getByRole('button').first()).toHaveText('Peaje Barra de Santa Lucía');
  await expect(list.nth(16).getByRole('button').first()).toHaveText('Peaje Solís');
  await expect(list.nth(17).getByRole('button').first()).toHaveText('Balanza Arrayanes');
  await expect(list.nth(0)).toContainText('Ruta 1 km 23,5, San José. Concesión: Consorcio Cruz del Sur.');
  await expect(list.nth(0)).toContainText('Tarifa pendiente.');
  await expect(list.nth(41).getByRole('button').first()).toHaveText('Radar 18 de Julio · Ruta 19 km 10');
  await expect(list.nth(41)).toContainText('En el MTOP: «18 de Julio», progresiva 9K970.');
  await expect(list.nth(162).getByRole('button').first()).toHaveText('Radar Villa María, acceso · Ruta 3 km 71,8');
  // The whole country: only the dots, so the names do not cover the map.
  const map = page.locator('.gps-map .fleet-map');
  await expect(map.locator('.road-marker')).toHaveCount(163);
  await expect(map.locator('.road-marker.road-radar')).toHaveCount(122);
  await page.locator('.gps-map').getByRole('button', { name: 'Ver todos' }).click();
  await expect(map).toHaveClass(/points-far/);
  await expect(map.locator('.road-marker span').first()).toBeHidden();
  await expect(map.locator('.road-marker[title="Peaje Barra de Santa Lucía"]')).toHaveCount(1);
  // A point of the list: the map goes there and shows the names.
  await list.nth(0).getByRole('button').first().click();
  await expect(map).not.toHaveClass(/points-far/);
  await expect(map.locator('.road-marker span', { hasText: 'Peaje Barra de Santa Lucía' })).toBeVisible();
  await shot(page, 'gps-peajes-balanzas');
});

test('si Google no responde, el mapa lo dice y muestra OpenStreetMap', async ({ page }) => {
  await page.route('https://tile.googleapis.com/**', (route) => route.fulfill({ status: 403, json: { error: { code: 403, message: 'API key not valid' } } }));
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'GPS en vivo');
  const map = page.locator('.gps-map .fleet-map');
  await expect(map.getByRole('status')).toHaveText('Google Maps no responde ahora: se ve el mapa de OpenStreetMap. Se vuelve a probar en 10 minutos.');
  await expect(map.getByRole('group', { name: 'Vista del mapa' }).getByRole('button', { name: 'Mapa' })).toHaveAttribute('aria-pressed', 'true');
  await expect(map).not.toHaveClass(/is-google/);
  await expect(osmTiles(map).first()).toBeAttached();
  await expect(map.locator('img.map-google-logo')).toHaveCount(0);
  await expect(map.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
});

test('si las imágenes de Google dejan de llegar, como al llegar al tope del día, el mapa pasa a OpenStreetMap', async ({ page }) => {
  // The session answers; the pictures do not (Google answers 429 once the quota of the day is used).
  await page.route('https://tile.googleapis.com/v1/2dtiles/**', (route) => route.fulfill({ status: 429, json: { error: { code: 429, message: 'Quota exceeded' } } }));
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'GPS en vivo');
  const map = page.locator('.gps-map .fleet-map');
  await expect(map.getByRole('status')).toHaveText('Google Maps no responde ahora: se ve el mapa de OpenStreetMap. Se vuelve a probar en 10 minutos.');
  await expect(osmTiles(map).first()).toBeAttached();
  await expect(map.locator('img.leaflet-tile[src^="https://tile.googleapis.com/"]')).toHaveCount(0);
  await expect(map.locator('img.map-google-logo')).toHaveCount(0);
});
