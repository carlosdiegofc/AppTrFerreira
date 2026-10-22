// The base of the GPS and trip maps and their full screen (decision of 22/10/2026). Google's Map Tiles API is replaced
// here by a stand-in: no request leaves the computer. The build of these tests has a made-up key (.env.e2e).
import { expect, type Page, test } from '@playwright/test';
import { BASE, open, prepare, rows, shot, signIn, TILE } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

/** Google's answers: a session of two weeks, the credits of what is on screen, and the pictures. What was asked is kept. */
async function google(page: Page) {
  const asked: { url: string; body: string | null }[] = [];
  await page.route('https://tile.googleapis.com/**', async (route) => {
    const url = route.request().url();
    asked.push({ url, body: route.request().postData() });
    if (url.includes('/v1/createSession')) {
      return route.fulfill({
        json: { session: 'sesion-de-prueba', expiry: String(Math.floor(Date.parse(BASE) / 1000) + 14 * 86_400), tileWidth: 256, tileHeight: 256, imageFormat: 'jpeg' },
      });
    }
    if (url.includes('/tile/v1/viewport')) {
      return route.fulfill({ json: { copyright: 'Imágenes ©2026 Prueba <b>sin HTML</b>', maxZoomRects: [{ maxZoom: 20, north: 90, south: -90, east: 180, west: -180 }] } });
    }
    return route.fulfill({ contentType: 'image/png', body: TILE });
  });
  return asked;
}

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
  // The small map of Inicio stays as it was.
  await open(page, 'Inicio');
  await expect(page.locator('.map-home .fm-tag', { hasText: 'ABC1234' })).toBeVisible();
  await expect(page.locator('.map-home').getByRole('button', { name: 'Pantalla completa' })).toHaveCount(0);
  await expect(page.locator('.map-home').getByRole('group', { name: 'Vista del mapa' })).toHaveCount(0);
});

test('el GPS y el viaje se ven en satélite de Google con las rutas encima, con su logo y sus créditos, y lo recuerda', async ({ page }) => {
  const asked = await google(page);
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'GPS en vivo');
  const map = page.locator('.gps-map .fleet-map');
  const views = map.getByRole('group', { name: 'Vista del mapa' });
  await expect(views.getByRole('button', { name: 'Mapa' })).toHaveAttribute('aria-pressed', 'true');
  await expect(map.locator('img.leaflet-tile[src^="https://tile.openstreetmap.org/"]').first()).toBeAttached();
  await views.getByRole('button', { name: 'Satélite' }).click();
  await expect(views.getByRole('button', { name: 'Satélite' })).toHaveAttribute('aria-pressed', 'true');
  await expect(map).toHaveClass(/is-satellite/);
  await expect(map.locator('img.leaflet-tile[src^="https://tile.googleapis.com/v1/2dtiles/"]').first()).toBeAttached();
  await expect(map.locator('img.leaflet-tile[src^="https://tile.openstreetmap.org/"]')).toHaveCount(0);
  // Google's credits as text, and its logo.
  await expect(map.locator('.leaflet-control-attribution')).toContainText('Imágenes ©2026 Prueba <b>sin HTML</b>');
  await expect(map.locator('.leaflet-control-attribution b')).toHaveCount(0);
  await expect(map.locator('img.map-google-logo')).toBeVisible();
  // Satellite with the roads and their names, in Spanish, from Uruguay, with the key of the build.
  const session = asked.filter((a) => a.url.includes('/v1/createSession'));
  expect(session).toHaveLength(1);
  expect(session[0]?.url).toContain('key=clave-de-prueba');
  expect(JSON.parse(session[0]?.body ?? '{}')).toEqual({ mapType: 'satellite', language: 'es-419', region: 'UY', layerTypes: ['layerRoadmap'] });
  expect(asked.some((a) => a.url.includes('/v1/2dtiles/') && a.url.includes('session=sesion-de-prueba'))).toBe(true);
  // The trucks and the points stay on top.
  await expect(map.locator('.fm-tag', { hasText: 'ABC1234' })).toBeVisible();
  await shot(page, 'gps-satelite');

  // The choice is kept: a trip's map opens in satellite too, with the same session.
  await open(page, 'Viajes');
  await rows(page).filter({ hasText: 'ABC1234' }).first().getByRole('link').click();
  const trip = page.locator('.map-trip');
  await expect(trip).toHaveClass(/is-satellite/);
  await expect(trip.locator('path.fm-route')).toHaveCount(3);
  expect(asked.filter((a) => a.url.includes('/v1/createSession'))).toHaveLength(1);
  await shot(page, 'viaje-satelite');
  // Full screen on the trip's map, and back to the street map.
  await trip.getByRole('button', { name: 'Pantalla completa' }).click();
  await expect(trip).toHaveClass(/map-full/);
  await trip.getByRole('button', { name: 'Salir de pantalla completa' }).click();
  await trip.getByRole('group', { name: 'Vista del mapa' }).getByRole('button', { name: 'Mapa' }).click();
  await expect(trip).not.toHaveClass(/is-satellite/);
  await expect(trip.locator('img.leaflet-tile[src^="https://tile.openstreetmap.org/"]').first()).toBeAttached();
  await expect(trip.locator('img.map-google-logo')).toHaveCount(0);
  await expect(trip.locator('.leaflet-control-attribution')).not.toContainText('Prueba');
});

test('si Google no da la vista satelital, lo dice y sigue el mapa de calles', async ({ page }) => {
  await page.route('https://tile.googleapis.com/**', (route) => route.fulfill({ status: 403, json: { error: { code: 403, message: 'API key not valid' } } }));
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'GPS en vivo');
  const map = page.locator('.gps-map .fleet-map');
  await map.getByRole('group', { name: 'Vista del mapa' }).getByRole('button', { name: 'Satélite' }).click();
  await expect(map.getByRole('status')).toHaveText('No se pudo abrir la vista satelital de Google Maps. Sigue el mapa de calles.');
  await expect(map.getByRole('group', { name: 'Vista del mapa' }).getByRole('button', { name: 'Mapa' })).toHaveAttribute('aria-pressed', 'true');
  await expect(map).not.toHaveClass(/is-satellite/);
  await expect(map.locator('img.leaflet-tile[src^="https://tile.openstreetmap.org/"]').first()).toBeAttached();
});
