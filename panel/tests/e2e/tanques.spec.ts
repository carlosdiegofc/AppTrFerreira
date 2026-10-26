// The tanks in Combustible and the low-fuel alert in Inicio, as seed.sql leaves them (decision of 22/10/2026): the Ford
// is low, the Volvo was filled on Ana's trip, the Iveco waits to know its level, and the others have no tank. Nothing
// here saves.
import { expect, test } from '@playwright/test';
import { open, prepare, shot, signIn } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

test('Combustible muestra cuánto combustible debería tener cada camión, con el bajo primero', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Combustible');
  const alert = page.locator('.notice-fuel');
  await expect(alert).toContainText('Ford Cargo 1722 · JKL3456 (≈ 58 L)');
  await alert.getByRole('button', { name: 'Ver los tanques' }).click();
  await expect(page).toHaveURL(/vista=tanques/);

  const items = page.getByRole('list', { name: 'Tanques' }).getByRole('listitem');
  await expect(items).toHaveCount(5);
  // Measured with 90 litres seven hours ago; then Diego's trip of 95 km at 3 km per litre.
  const ford = items.nth(0);
  await expect(ford).toContainText('Ford Cargo 1722 · JKL3456');
  await expect(ford).toContainText('Combustible bajo');
  await expect(ford).toContainText('≈ 58 L');
  await expect(ford).toContainText('19 % del tanque · rinde ≈ 175 km');
  await expect(ford).toContainText('Desde la medición del 15/10/2026 a las 05:00 (90 L): 95 km y 0 L cargados.');
  await expect(ford.getByRole('meter')).toHaveAttribute('aria-valuenow', '58');
  // Filled 90 minutes ago with 120 km of Ana's trip done; the trip is at 152,3 km now.
  const volvo = items.nth(1);
  await expect(volvo).toContainText('Volvo FH 460 · ABC1234');
  await expect(volvo).toContainText('≈ 389 L');
  await expect(volvo).toContainText('Desde el tanque lleno del 15/10/2026 a las 10:30 en Ancap Ruta 5 km 32: 32 km y 0 L cargados.');
  await expect(volvo).not.toContainText('Combustible bajo');
  await expect(items.nth(2)).toContainText('Iveco Stralis · MNO7890');
  await expect(items.nth(2)).toContainText('Falta saber cuánto tiene');
  await expect(items.nth(3)).toContainText('Mercedes Benz Actros · GHI9012');
  await expect(items.nth(3)).toContainText('Sin configurar');
  await expect(items.nth(4)).toContainText('Scania R450 · DEF5678');
  await shot(page, 'combustible-tanques');

  // The load that filled the tank says so in the list of receipts.
  await page.getByRole('group', { name: 'Vista' }).getByRole('button', { name: /Boletas/ }).click();
  await expect(page.getByRole('list', { name: 'Boletas' }).getByRole('listitem').filter({ hasText: 'Volvo FH 460 · ABC1234' })).toContainText('Tanque lleno');
});

test('Inicio avisa de los camiones con poco combustible', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  const low = page.getByRole('list', { name: 'Combustible bajo' });
  await expect(low).toContainText('Ford Cargo 1722 · JKL3456');
  await expect(low).toContainText('≈ 58 L · rinde ≈ 175 km');
  await low.getByRole('link').click();
  await expect(page).toHaveURL(/combustible\?vista=tanques/);
  await expect(page.getByRole('list', { name: 'Tanques' })).toBeVisible();
});

test('si el combustible no se puede actualizar, Inicio y la campana dicen que el aviso es de la última lectura', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  const low = page.getByRole('list', { name: 'Combustible bajo' });
  await expect(low).toContainText('Ford Cargo 1722 · JKL3456');

  // The tanks stop answering: «Actualizar» keeps the Ford, and says so.
  await page.route('**/rest/v1/trf_tank_settings*', (route) => route.fulfill({ status: 500, json: { message: 'Falla de prueba' } }));
  await page.getByRole('button', { name: 'Actualizar' }).click();
  const text = 'No se pudo actualizar el combustible de los camiones: los avisos de combustible bajo son de la última lectura.';
  await expect(page.getByRole('alert').filter({ hasText: text })).toBeVisible();
  await expect(low).toContainText('Ford Cargo 1722 · JKL3456');

  // The bell, in another section, says it too; «Reintentar» reads them again once they answer.
  await open(page, 'Viajes');
  await page.getByRole('button', { name: /^Avisos/ }).click();
  const notices = page.locator('#avisos');
  const note = notices.getByRole('alert').filter({ hasText: text });
  await expect(note).toBeVisible();
  await expect(notices.getByRole('list', { name: 'Combustible bajo' })).toContainText('Ford Cargo 1722 · JKL3456');
  await page.unroute('**/rest/v1/trf_tank_settings*');
  await note.getByRole('button', { name: 'Reintentar' }).click();
  await expect(note).toHaveCount(0);
  await expect(notices.getByRole('list', { name: 'Combustible bajo' })).toContainText('Ford Cargo 1722 · JKL3456');
});
