// Stretches without signal (28/10/2026): the app 0.24.0 fills the time without GPS with Google's road, counts its
// kilometres and marks its readings as estimated; a cut of more than 3 hours is left without counting, to check. The
// seed has one of each for Ana: five minutes without signal on the trip in progress, and more than 3 hours on the one
// of yesterday. These tests only read.
import { expect, test } from '@playwright/test';
import { open, prepare, shot, signIn } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

test('el recorrido sigue en línea punteada por el camino estimado y el viaje dice cuántos km se estimaron', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await page.goto('./#/viajes/app:10000000-0000-4000-8000-00000000000a');
  const map = page.locator('.map-trip');
  // The three stretches the GPS measured, and the road of the five minutes without signal between two of them.
  await expect(map.locator('path.fm-route')).toHaveCount(3);
  await expect(map.locator('path.fm-gap')).toHaveCount(1);
  await expect(map.locator('path.fm-gap')).toHaveAttribute('stroke-dasharray', '8 8');
  await expect(page.locator('.map-legend')).toContainText('Sin señal: el camino estimado');
  const facts = page.locator('.route-facts');
  // The estimated readings are not readings of the GPS.
  await expect(facts.locator('div', { hasText: 'Puntos del recorrido' }).locator('dd')).toHaveText('12');
  await expect(facts.locator('div', { hasText: 'Sin señal' }).locator('dd')).toHaveText('6,3 km estimados en 1 tramo');
  await expect(page.locator('.route-gap')).toHaveCount(0);
  // The five minutes without readings were with the truck moving: the office sees the GPS cut too (30/10/2026).
  const cuts = page.locator('.route-cuts');
  await expect(cuts).toContainText('El GPS del teléfono no registró con el camión en marcha una vez');
  await expect(cuts.locator('li')).toHaveCount(1);
  await expect(cuts.locator('li')).toContainText('km en línea recta');
  await shot(page, 'viaje-sin-senal');

  // The live map draws it the same way.
  await open(page, 'GPS en vivo');
  await page.getByRole('button', { name: /Volvo FH 460 · ABC1234/ }).click();
  await expect(page.locator('.map-live path.fm-route:not(.fm-tail)')).toHaveCount(3);
  await expect(page.locator('.map-live path.fm-gap')).toHaveCount(1);
  await expect(page.locator('.unit-detail dd').last()).toHaveText('12');
});

test('un corte de más de 3 horas queda sin contar y el viaje pide revisarlo', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await page.goto('./#/viajes/app:10000000-0000-4000-8000-00000000000f');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ana Pereira');
  await expect(page.locator('.route-facts div', { hasText: 'Sin señal' }).locator('dd')).toHaveText('1 sin contar');
  const warning = page.locator('.route-gap');
  await expect(warning).toHaveCount(1);
  await expect(warning).toContainText('durante 3 h 40 min');
  await expect(warning).toContainText('ese tramo quedó sin contar');
  await expect(warning).toContainText('Revisá los km del viaje.');
});
