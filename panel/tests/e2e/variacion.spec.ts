// The change of the big numbers against the period before, of the same length (the «vidrio» design, with the second
// delivery of part 12b): in Combustible, Gastos and Métricas, with dates whose period before has the seed's data; dates
// that go on after today compare only up to today, and dates that are not dates compare nothing. Read only.
import { expect, type Page, test } from '@playwright/test';
import { prepare, signIn } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

const tile = (page: Page, label: string) => page.locator('.stat').filter({ has: page.locator('.stat-label', { hasText: new RegExp(`^${label}$`) }) });

/** Signed in, the panel goes from its first address to Inicio: an address typed before that would give way to it. */
async function signedIn(page: Page) {
  await signIn(page, 'dueno@ejemplo.uy');
  await expect(page).toHaveURL(/#\/inicio$/);
}

async function signInAt(page: Page, address: string) {
  await signedIn(page);
  await page.goto(address);
}

test('Combustible compara lo cargado y los litros con los días anteriores', async ({ page }) => {
  // 20 days, against the 20 before them, which had Ana's receipt of 25/09.
  await signInAt(page, './#/combustible?periodo=fechas&desde=2026-09-26&hasta=2026-10-15');
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

test('unas fechas que siguen después de hoy comparan solo hasta hoy', async ({ page }) => {
  // The browser two days before the seed: the receipts of 15/10 are dated after «today», like a receipt with a wrong date.
  await page.clock.setFixedTime(new Date('2026-10-13T15:00:00Z'));
  // 18 days from today: the period shows the receipts of the 15th, but the change takes today against the same day of
  // the 18 days before, which had Ana's receipt of 25/09.
  await signInAt(page, './#/combustible?periodo=fechas&desde=2026-10-13&hasta=2026-10-30');
  const loaded = tile(page, 'Cargado en el período');
  await expect(loaded).toContainText('$ 26.450');
  await expect(loaded).toContainText('US$ 310');
  await expect(loaded.locator('.stat-trend')).toHaveText('↑ 50 % más que a esta altura de los 18 días anteriores');
  await expect(tile(page, 'Litros en el período').locator('.stat-trend')).toHaveText('↑ 50 % más que a esta altura de los 18 días anteriores');
});

test('unas fechas de un enlace que no son fechas no rompen la página ni comparan', async ({ page }) => {
  await signedIn(page);
  for (const [path, label] of [
    ['combustible', 'Cargado en el período'],
    ['finanzas', 'Gastado en el período'],
    ['finanzas/cobros', 'Facturado en el período'],
  ] as const) {
    await page.goto(`./#/${path}?periodo=fechas&desde=aaa&hasta=zzz`);
    await expect(tile(page, label)).toContainText('$ 0');
    await expect(tile(page, label).locator('.stat-trend')).toHaveCount(0);
  }
});

test('Gastos compara lo gastado con los días anteriores', async ({ page }) => {
  // 24 days, against the 24 before them, which had the Mercedes' road tax of 21/09.
  await signInAt(page, './#/finanzas?periodo=fechas&desde=2026-09-22&hasta=2026-10-15');
  const spent = tile(page, 'Gastado en el período');
  await expect(spent).toContainText('$ 21.120');
  await expect(spent).toContainText('US$ 3.350');
  await expect(spent.locator('.stat-trend')).toHaveText('↑ 35 % más que los 24 días anteriores, en pesos');
});

test('Métricas compara lo facturado y el combustible con los días anteriores', async ({ page }) => {
  // The last 3 days against the 3 before them: the trip typed by hand of 12/10, in dollars, and Carla's receipt.
  await signInAt(page, './#/metricas?periodo=fechas&desde=2026-10-13&hasta=2026-10-15');
  await expect(tile(page, 'Combustible').locator('.stat-trend')).toHaveText('↑ 301 % más que los 3 días anteriores, en pesos');
  await expect(tile(page, 'Facturado').locator('.stat-trend')).toHaveText('↓ 100 % menos que los 3 días anteriores, en dólares');
  await expect(tile(page, 'Facturado').locator('.stat-trend')).toHaveClass(/is-red/);
  // The trip typed by hand has no GPS kilometres: nothing to compare with.
  await expect(tile(page, 'Kilómetros del GPS').locator('.stat-trend')).toHaveCount(0);
});
