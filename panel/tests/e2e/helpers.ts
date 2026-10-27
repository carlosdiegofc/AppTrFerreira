// What every end-to-end test file shares: the fixed clock, the map tiles, signing in and moving around the panel.
import { mkdirSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

/** The browser clock is fixed at the seed's base instant: 15/10/2026 at noon in Uruguay. */
export const BASE = process.env.PANEL_E2E_BASE ?? '2026-10-15T15:00:00Z';
const SHOTS = 'tests/e2e/shots';
// 1×1 grey PNG: map tiles are never fetched from OpenStreetMap nor from Google during the tests.
export const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN89+7dfwAJ6QPbJ1DSWgAAAABJRU5ErkJggg==', 'base64');

mkdirSync(SHOTS, { recursive: true });

/** A request to Google's Map Tiles API, as the stand-in saw it. */
export interface GoogleAsk {
  url: string;
  body: string | null;
}

/**
 * The stand-in of Google's Map Tiles API (the build of the tests has a made-up key, .env.e2e): a session of two weeks
 * named by what it shows (sesion-calles, sesion-satelite or sesion-trafico), the credits of what is on screen, and the
 * grey picture for every tile. Nothing leaves the computer. What was asked is kept in the list it returns.
 */
export async function googleStandIn(page: Page): Promise<GoogleAsk[]> {
  const asked: GoogleAsk[] = [];
  await page.route('https://tile.googleapis.com/**', async (route) => {
    const url = route.request().url();
    const body = route.request().postData();
    asked.push({ url, body });
    if (url.includes('/v1/createSession')) {
      const request = JSON.parse(body ?? '{}') as { mapType?: string; layerTypes?: string[] };
      const name = request.layerTypes?.includes('layerTraffic') ? 'trafico' : request.mapType === 'satellite' ? 'satelite' : 'calles';
      const expiry = String(Math.floor(Date.parse(BASE) / 1000) + 14 * 86_400);
      return route.fulfill({ json: { session: `sesion-${name}`, expiry, tileWidth: 256, tileHeight: 256, imageFormat: 'png' } });
    }
    if (url.includes('/tile/v1/viewport')) {
      return route.fulfill({ json: { copyright: 'Datos ©2026 Prueba <b>sin HTML</b>', maxZoomRects: [{ maxZoom: 20, north: 90, south: -90, east: 180, west: -180 }] } });
    }
    return route.fulfill({ contentType: 'image/png', body: TILE });
  });
  return asked;
}

/** Every page of a test: the fixed clock and the stand-in map tiles, OpenStreetMap's and Google's. */
export async function prepare(page: Page) {
  await page.clock.setFixedTime(new Date(BASE));
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ contentType: 'image/png', body: TILE }));
  await googleStandIn(page);
}

export async function signIn(page: Page, email: string, password = 'clave-de-prueba') {
  await page.goto('./');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

/** Opens a section from the side menu, which on phones sits behind the menu button. */
export async function open(page: Page, section: string) {
  await expect(page.locator('main#contenido')).toBeVisible();
  const menu = page.getByRole('button', { name: 'Abrir el menú' });
  if (await menu.isVisible()) await menu.click();
  const link = page.getByRole('navigation').getByRole('link', { name: new RegExp(`^${section}`) });
  await link.click();
  // The router changes pages inside a transition: until the section's code arrives, the page before stays on screen,
  // and the bell or the search opened meanwhile closes when the new page lands. The menu marks the section once it has.
  await expect(link).toHaveAttribute('aria-current', 'page');
}

export const stat = (page: Page, label: string) => page.locator('.stat', { hasText: label });
export const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png`, fullPage: true });

/** The rows of the trip list and its tabs by state. */
export const rows = (page: Page) => page.locator('.trip-rows > li');
export const tab = (page: Page, name: string) => page.locator('.chip', { hasText: name });
