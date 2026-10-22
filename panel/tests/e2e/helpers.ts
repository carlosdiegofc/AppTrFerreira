// What every end-to-end test file shares: the fixed clock, the map tiles, signing in and moving around the panel.
import { mkdirSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

/** The browser clock is fixed at the seed's base instant: 15/10/2026 at noon in Uruguay. */
export const BASE = process.env.PANEL_E2E_BASE ?? '2026-10-15T15:00:00Z';
const SHOTS = 'tests/e2e/shots';
// 1×1 grey PNG: map tiles are never fetched from OpenStreetMap (nor from Google) during the tests.
export const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN89+7dfwAJ6QPbJ1DSWgAAAABJRU5ErkJggg==', 'base64');

mkdirSync(SHOTS, { recursive: true });

/** Every page of a test: the fixed clock and the stand-in map tiles. */
export async function prepare(page: Page) {
  await page.clock.setFixedTime(new Date(BASE));
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ contentType: 'image/png', body: TILE }));
  // The satellite view: mapa.spec.ts answers for Google; anywhere else nothing goes out.
  await page.route('https://tile.googleapis.com/**', (route) => route.abort());
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
  await page.getByRole('navigation').getByRole('link', { name: new RegExp(`^${section}`) }).click();
}

export const stat = (page: Page, label: string) => page.locator('.stat', { hasText: label });
export const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png`, fullPage: true });

/** The rows of the trip list and its tabs by state. */
export const rows = (page: Page) => page.locator('.trip-rows > li');
export const tab = (page: Page, name: string) => page.locator('.chip', { hasText: name });
