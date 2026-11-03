// The advanced detail of a trip (3/11/2026): the times the truck stood still and the tolls, scales and radars it went by,
// closed until the office opens it. These tests only read.
import { expect, test } from '@playwright/test';
import { prepare, shot, signIn } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

test('el viaje tiene su detalle avanzado, cerrado hasta abrirlo', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await page.goto('./#/viajes/app:10000000-0000-4000-8000-00000000000a');
  const card = page.locator('.trip-advanced');
  await expect(card.locator('summary')).toContainText('Detenciones (');
  await expect(card.getByRole('heading', { name: 'Detenciones de 5 minutos o más' })).toBeHidden();
  await card.locator('summary').click();
  await expect(card.getByRole('heading', { name: 'Detenciones de 5 minutos o más' })).toBeVisible();
  await expect(card.getByRole('heading', { name: 'Peajes, balanzas y radares' })).toBeVisible();
  await expect(card).toContainText('Tocá el recorrido en el mapa');
  await shot(page, 'viaje-detalle-avanzado');
});
