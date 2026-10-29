// Trips with several unloadings (app 0.27.0, migration 0014): the seed has three stops on Ana's trip in progress, one done
// by hand, one being unloaded and one to come, and the receipt of arrival belongs to the first. These tests only read.
import { expect, test } from '@playwright/test';
import { prepare, shot, signIn } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

test('el viaje muestra sus paradas con el estado, las horas y los kilos de cada una', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await page.goto('./#/viajes/app:10000000-0000-4000-8000-00000000000a');
  const card = page.locator('.card', { has: page.getByRole('heading', { name: 'Paradas de descarga (3)' }) });
  const rows = card.locator('.stop-list > li');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('1 · Molino San José · San José');
  await expect(rows.nth(0)).toContainText('Descargó');
  await expect(rows.nth(0)).toContainText('25 min descargando');
  await expect(rows.nth(0)).toContainText('12.500 kg');
  await expect(rows.nth(1)).toContainText('2 · Cooperativa del Este · Treinta y Tres');
  await expect(rows.nth(1)).toContainText('Descargando');
  await expect(rows.nth(2)).toContainText('Todavía no llegó');
  await expect(rows.nth(2)).toContainText('Por llegar');
  // The kilometres of the leg that ended at the second stop, from the route of the seed.
  await expect(rows.nth(1)).toContainText(/\d+,\d km desde Molino San José/);
  // The map marks the two stops the truck reached.
  await expect(page.locator('.map-trip path.fm-stop')).toHaveCount(2);
  // The receipt of arrival says which stop it is of.
  await expect(page.locator('.item-list li', { hasText: 'Parada: Molino San José · San José' })).toHaveCount(1);
  await shot(page, 'viaje-con-paradas');
});

test('un viaje sin paradas no muestra la tarjeta', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await page.goto('./#/viajes/app:10000000-0000-4000-8000-00000000000f');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ana Pereira');
  await expect(page.getByRole('heading', { name: /Paradas de descarga/ })).toHaveCount(0);
});
