// The change of the big numbers against the period before, of the same length (the «vidrio» design, with the second
// delivery of part 12b): in Combustible, Gastos and Métricas, with dates whose period before has the seed's data.
// Read only.
import { expect, type Page, test } from '@playwright/test';
import { prepare, signIn } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

const tile = (page: Page, label: string) => page.locator('.stat').filter({ has: page.locator('.stat-label', { hasText: new RegExp(`^${label}$`) }) });

test('Combustible compara lo cargado y los litros con los días anteriores', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  // 20 days, against the 20 before them, which had Ana's receipt of 25/09.
  await page.goto('./#/combustible?periodo=fechas&desde=2026-09-26&hasta=2026-10-15');
  const loaded = tile(page, 'Cargado en el período');
  await expect(loaded).toContainText('$ 33.050');
  await expect(loaded.locator('.stat-trend')).toHaveText('↑ 200 % más que los 20 días anteriores, en pesos');
  const liters = tile(page, 'Litros en el período');
  await expect(liters).toContainText('852,5');
  await expect(liters.locator('.stat-trend')).toHaveText('↑ 326 % más que los 20 días anteriores');
  await expect(liters.locator('.stat-trend')).toHaveClass(/is-grey/);
  // «Todo» has no period before.
  await page.goto('./#/combustible?periodo=todo');
  await expect(tile(page, 'Cargado en el período')).toContainText('$ 44.050');
  await expect(tile(page, 'Cargado en el período').locator('.stat-trend')).toHaveCount(0);
});

test('Gastos compara lo gastado con los días anteriores', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  // 24 days, against the 24 before them, which had the Mercedes' road tax of 21/09.
  await page.goto('./#/finanzas?periodo=fechas&desde=2026-09-22&hasta=2026-10-15');
  const spent = tile(page, 'Gastado en el período');
  await expect(spent).toContainText('$ 21.120');
  await expect(spent).toContainText('US$ 3.350');
  await expect(spent.locator('.stat-trend')).toHaveText('↑ 35 % más que los 24 días anteriores, en pesos');
});

test('Métricas compara lo facturado y el combustible con los días anteriores', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  // The last 3 days against the 3 before them: the trip typed by hand of 12/10, in dollars, and Carla's receipt.
  await page.goto('./#/metricas?periodo=fechas&desde=2026-10-13&hasta=2026-10-15');
  await expect(tile(page, 'Combustible').locator('.stat-trend')).toHaveText('↑ 301 % más que los 3 días anteriores, en pesos');
  await expect(tile(page, 'Facturado').locator('.stat-trend')).toHaveText('↓ 100 % menos que los 3 días anteriores, en dólares');
  await expect(tile(page, 'Facturado').locator('.stat-trend')).toHaveClass(/is-red/);
  // The trip typed by hand has no GPS kilometres: nothing to compare with.
  await expect(tile(page, 'Kilómetros del GPS').locator('.stat-trend')).toHaveCount(0);
});
