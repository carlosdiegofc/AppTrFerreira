// Editing trips in a real browser: the office completes a trip of the app, types one by hand, sends one to the trash
// and back, and two people save the same trip at once. Saving changes the test data, so this file runs after the
// others (project "edicion" in playwright.config.ts), in this order.
import { expect, type Page, test } from '@playwright/test';
import { open, prepare, rows, shot, signIn, tab } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

/** A line of the load order on the trip's page. */
const fact = (page: Page, label: string) => page.locator('.order-facts > div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd');

test('la oficina completa los datos de un viaje de la app', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Viajes');
  await tab(page, 'Pendientes').click();
  await expect(rows(page)).toHaveCount(1);
  await rows(page).first().getByRole('link').click();
  await expect(page.locator('.trip-status')).toContainText('Falta completar: Origen, Destino.');

  await page.getByRole('button', { name: 'Completar datos' }).click();
  const form = page.getByRole('dialog', { name: 'Completar datos del viaje' });
  await expect(form).toContainText('Lo registró la app y no se cambia acá');
  await form.getByLabel('Origen').fill('Montevideo');
  await form.getByLabel('Destino').fill('Punta del Este');
  // The point where the GPS saw the truck arrive becomes the destination on the map.
  await form.getByRole('button', { name: 'Usar donde llegó (GPS)' }).click();
  await form.getByLabel('Km facturables').fill('132,5');
  await expect(form).toContainText('Se guarda: 132,5 km');
  await shot(page, 'viaje-completar');
  await form.getByRole('button', { name: 'Guardar datos' }).click();

  await expect(form).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Datos guardados.');
  await expect(page.locator('.trip-status')).toContainText('Completo');
  await expect(fact(page, 'Origen')).toHaveText('Montevideo');
  await expect(fact(page, 'Km facturables')).toHaveText('132,5 km');
  // It has its row in the panel now: the next change edits it.
  await expect(page.getByRole('button', { name: 'Editar datos' })).toBeVisible();

  await page.getByRole('button', { name: 'Viajes' }).first().click();
  await expect(tab(page, 'Pendientes')).toContainText('0');
});

test('la oficina carga un viaje a mano', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Viajes');
  await expect(rows(page)).toHaveCount(6);
  await page.getByRole('button', { name: 'Nuevo viaje' }).click();
  const form = page.getByRole('dialog', { name: 'Nuevo viaje' });
  // It starts at the current minute in Uruguay, and the truck is required.
  await expect(form.getByLabel('Salida (hora de Uruguay)')).toHaveValue('2026-10-15T12:00');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Revisá los campos marcados.');
  await expect(form).toContainText('Indicá el camión.');

  await form.getByLabel('Camión').fill('Scania R450 · DEF5678');
  await form.getByLabel('Chofer').fill('Bruno Díaz');
  await form.getByLabel('Salida (hora de Uruguay)').fill('2026-10-14T08:30');
  await form.getByLabel('Llegada (hora de Uruguay)').fill('2026-10-14T07:00');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toContainText('La llegada no puede ser antes de la salida.');
  await form.getByLabel('Llegada (hora de Uruguay)').fill('2026-10-14T13:15');
  await form.getByLabel('Orden de carga').fill('24150');
  await form.getByLabel('Cliente').fill('Cooperativa Agraria');
  await form.getByLabel('Producto').fill('Maíz');
  await form.getByLabel('Kilos').fill('29.500');
  await form.getByLabel('Origen').fill('Young');
  await form.getByLabel('Destino').fill('Nueva Palmira');
  await form.getByLabel('Importe').fill('1.100');
  await form.getByLabel('Moneda').selectOption('USD');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Orden de carga 24150');
  await expect(page.getByRole('status')).toContainText('Viaje cargado.');
  await expect(page.locator('.trip-status')).toContainText('Completo');
  await expect(fact(page, 'Salida')).toHaveText('14/10/2026 08:30');
  await expect(fact(page, 'Kilos')).toHaveText('29.500 kg');
  await expect(fact(page, 'Importe')).toHaveText('US$ 1.100');
  await page.getByRole('button', { name: 'Viajes' }).first().click();
  await expect(rows(page)).toHaveCount(7);
});

test('un viaje va a la papelera y vuelve', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Viajes');
  await rows(page).filter({ hasText: 'Orden 24101' }).getByRole('link').click();
  await page.getByRole('button', { name: 'Mandar a la papelera' }).click();
  const ask = page.getByRole('dialog', { name: '¿Mandar este viaje a la papelera?' });
  await expect(ask).toContainText('Lo podés restaurar cuando quieras');
  await ask.getByRole('button', { name: 'Mandar a la papelera' }).click();
  await expect(ask).toBeHidden();
  await expect(page.getByRole('status')).toContainText('El viaje está en la papelera');
  await expect(page.locator('.trip-status')).toContainText('Está en la papelera desde el 15/10/2026');

  await page.getByRole('button', { name: 'Viajes' }).first().click();
  await expect(tab(page, 'Eliminados')).toContainText('2');
  await tab(page, 'Eliminados').click();
  await rows(page).filter({ hasText: 'Orden 24101' }).getByRole('link').click();
  await page.getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.getByRole('status')).toContainText('Viaje restaurado');
  await expect(page.locator('.trip-status')).toContainText('Completo');
});

test('si otra persona guarda el mismo viaje a la vez, avisa y no pisa nada', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Viajes');
  await rows(page).filter({ hasText: 'Molino San José' }).getByRole('link').click();
  await page.getByRole('button', { name: 'Editar datos' }).click();
  const mine = page.getByRole('dialog', { name: 'Editar datos del viaje' });
  await mine.getByLabel('Kilos').fill('27.000');

  // The same trip in another tab, where someone saves first.
  const other = await page.context().newPage();
  await prepare(other);
  await other.goto(page.url());
  await other.getByRole('button', { name: 'Editar datos' }).click();
  const theirs = other.getByRole('dialog', { name: 'Editar datos del viaje' });
  await theirs.getByLabel('Cliente').fill('Molino San José S.A.');
  await theirs.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(other.getByRole('status')).toContainText('Datos guardados.');
  await other.close();

  await page.bringToFront();
  await mine.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(mine).toBeHidden();
  await expect(page.getByRole('alert')).toContainText('Otra persona cambió este viaje');
  // What the other person saved is on screen, and the kilos typed here were not saved.
  await expect(fact(page, 'Cliente')).toHaveText('Molino San José S.A.');
  await expect(fact(page, 'Kilos')).toHaveText('28.000 kg');
  await shot(page, 'viaje-conflicto');
});

test('en el celular el formulario ocupa la pantalla y no se cierra sin avisar', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Viajes');
  await page.getByRole('button', { name: 'Nuevo viaje' }).click();
  const form = page.getByRole('dialog', { name: 'Nuevo viaje' });
  await form.getByLabel('Cliente').fill('Cliente Uno');
  await shot(page, 'viaje-nuevo-celular');
  await form.getByRole('button', { name: 'Cancelar' }).click();
  await expect(form).toContainText('Hay cambios sin guardar');
  await form.getByRole('button', { name: 'Seguir editando' }).click();
  await page.keyboard.press('Escape');
  await expect(form).toContainText('Hay cambios sin guardar');
  await form.getByRole('button', { name: 'Salir sin guardar' }).click();
  await expect(form).toBeHidden();
  await expect(rows(page)).toHaveCount(7);
});
