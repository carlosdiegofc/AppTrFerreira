// Saving services in a real browser: marking done one that repeats every N km schedules the next one, a new service
// with a kind written by hand, deleting for good, and two people changing the same service at once or marking it done
// at once. Saving changes the test data, so this file runs after the read-only tests (project "edicion" in
// playwright.config.ts), in this order.
import { expect, type Page, test } from '@playwright/test';
import { open, prepare, shot, signIn } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

const services = (page: Page) => page.locator('.service-list > li');
const service = (page: Page, text: string) => page.locator('.service-list > li', { hasText: text });
const card = (page: Page, plate: string) => page.locator('.km-card', { hasText: plate });
const chip = (page: Page, name: string) => page.locator('.list-bar .chip', { hasText: name });

test('marcar como hecho un service que se repite agenda el próximo', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await open(page, 'Mantenimiento');
  await service(page, 'A los 412.500 km').getByRole('button').click();
  const form = page.getByRole('dialog', { name: 'Editar service' });
  await form.getByRole('radio', { name: 'Sí, ya se hizo' }).click();
  await expect(form.getByLabel('Fecha en que se hizo')).toHaveValue('2026-10-15');
  await expect(form).toContainText('Hoy tiene unos 412.095 km (estimado con el GPS).');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toContainText('Para agendar el próximo, escribí el kilometraje del día en que se hizo.');
  await form.getByLabel('Kilometraje ese día').fill('412.480');
  await expect(form).toContainText('Al guardar se agenda el próximo a los 422.480 km.');
  await shot(page, 'mantenimiento-hecho');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect(form).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Service marcado como hecho. El próximo quedó agendado a los 422.480 km.');
  // The odometer of today is the new start: plus the trip of today.
  await expect(card(page, 'JKL3456').locator('.km-value')).toHaveText('412.575 km');
  await expect(card(page, 'JKL3456')).toContainText('412.480 km anotados el 15/10/2026 + 95 km de GPS');
  await expect(service(page, 'A los 422.480 km')).toContainText('faltan unos 9.905 km');
  await expect(service(page, 'A los 422.480 km').locator('.pill')).toHaveText('Programado');
  await chip(page, 'Hechos').click();
  await expect(services(page).first()).toContainText('Hecho el 15/10/2026 · Con 412.480 km');
  await expect(services(page).first()).toContainText('Cada 10.000 km');
  // Inicio no longer warns about it.
  await open(page, 'Inicio');
  await expect(page.locator('.alert-line', { hasText: 'JKL3456' })).toHaveCount(0);
});

/** The first request of a kind to the services reaches the database, but its answer is lost. */
async function cutFirst(page: Page, method: string) {
  let cut = true;
  await page.route('**/rest/v1/trf_vehicle_maintenance*', async (route) => {
    if (route.request().method() !== method || !cut) return route.fallback();
    cut = false;
    await route.fetch();
    await route.abort('failed');
  });
}

test('si se corta la respuesta al marcarlo como hecho, el reintento agenda el próximo una sola vez', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await open(page, 'Mantenimiento');
  await cutFirst(page, 'PATCH');
  await service(page, 'A los 422.480 km').getByRole('button').click();
  const form = page.getByRole('dialog', { name: 'Editar service' });
  await form.getByRole('radio', { name: 'Sí, ya se hizo' }).click();
  await form.getByLabel('Kilometraje ese día').fill('422.400');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Sin conexión con el servidor');
  // The database already has it done: trying again goes on from there.
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Service marcado como hecho. El próximo quedó agendado a los 432.400 km.');
  await expect(service(page, 'A los 432.400 km')).toHaveCount(1);
});

test('si se corta la respuesta al agendar el próximo, no queda dos veces', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await open(page, 'Mantenimiento');
  await cutFirst(page, 'POST');
  await service(page, 'A los 432.400 km').getByRole('button').click();
  const form = page.getByRole('dialog', { name: 'Editar service' });
  await form.getByRole('radio', { name: 'Sí, ya se hizo' }).click();
  await form.getByLabel('Kilometraje ese día').fill('432.500');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Service marcado como hecho. El próximo quedó agendado a los 442.500 km.');
  await expect(service(page, 'A los 442.500 km')).toHaveCount(1);
});

test('un service nuevo con un tipo escrito a mano', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Mantenimiento');
  await page.getByRole('button', { name: 'Nuevo service' }).click();
  const form = page.getByRole('dialog', { name: 'Nuevo service' });
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toContainText('Elegí el camión.');
  await expect(form).toContainText('Elegí el tipo de service.');
  await form.getByLabel('Camión').selectOption('Iveco Stralis · MNO7890');
  await form.getByLabel('Tipo de service').selectOption({ label: 'Otro (escribilo)' });
  await form.getByLabel('Otro tipo').fill('Embrague');
  await form.getByLabel('Fecha prevista').fill('2026-11-30');
  await form.getByLabel('A los km').fill('412,5');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toContainText('Escribí los kilómetros sin decimales.');
  await form.getByLabel('A los km').fill('');
  await form.getByLabel('Notas').fill('Taller Young');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Service cargado.');
  await expect(service(page, 'Embrague')).toContainText('Para el 30/11/2026');
  await expect(service(page, 'Embrague')).toContainText('Taller Young');
  await expect(service(page, 'Embrague').locator('.pill')).toHaveText('Programado');
  await expect(card(page, 'MNO7890')).toContainText('1 por hacer');
});

test('un service se borra para siempre, preguntando antes', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await open(page, 'Mantenimiento');
  await chip(page, 'Hechos').click();
  // The row itself: a service done also has the button of its cost.
  await service(page, 'Revisión general').locator('.service-row').click();
  const form = page.getByRole('dialog', { name: 'Editar service' });
  await form.getByRole('button', { name: 'Eliminar' }).click();
  const confirm = page.getByRole('dialog', { name: '¿Eliminar este service?' });
  await expect(confirm).toContainText('Se borra para siempre, también en la app.');
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  await form.getByRole('button', { name: 'Eliminar' }).click();
  await confirm.getByRole('button', { name: 'Eliminar' }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Service eliminado.');
  await expect(service(page, 'Revisión general')).toHaveCount(0);
  // It was the Scania's only odometer.
  await expect(card(page, 'DEF5678').locator('.km-value')).toHaveText('Sin kilometraje');
});

test('si dos personas cambian el mismo service a la vez, la segunda no pisa a la primera', async ({ browser }) => {
  const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
  for (const p of [a, b]) {
    await prepare(p);
    await signIn(p, 'dueno@ejemplo.uy');
    await open(p, 'Mantenimiento');
    await service(p, 'Cambio de filtros').getByRole('button').click();
  }
  const formA = a.getByRole('dialog', { name: 'Editar service' });
  const formB = b.getByRole('dialog', { name: 'Editar service' });
  await formA.getByLabel('Notas').fill('Taller A');
  await formA.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(a.getByRole('status')).toContainText('Service guardado.');

  await formB.getByLabel('Notas').fill('Taller B');
  await formB.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(b.getByRole('alert')).toContainText('Otra persona cambió o borró ese service');
  // B reads it again: A's change, and not B's.
  await expect(service(b, 'Cambio de filtros')).toContainText('Taller A');
  await Promise.all([a.close(), b.close()]);
});

test('si dos personas marcan como hecho el mismo service a la vez, el próximo queda una sola vez', async ({ browser }) => {
  const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
  for (const p of [a, b]) {
    await prepare(p);
    await signIn(p, 'dueno@ejemplo.uy');
    await open(p, 'Mantenimiento');
    // The Ford's oil change, scheduled by the tests above.
    await service(p, 'A los 442.500 km').getByRole('button').click();
    const form = p.getByRole('dialog', { name: 'Editar service' });
    await form.getByRole('radio', { name: 'Sí, ya se hizo' }).click();
    await form.getByLabel('Kilometraje ese día').fill('442.450');
  }
  // Both save the same: A first, then B, whose save finds the service already done that way.
  for (const p of [a, b]) {
    await p.getByRole('dialog', { name: 'Editar service' }).getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(p.getByRole('status')).toContainText('Service marcado como hecho. El próximo quedó agendado a los 452.450 km.');
  }
  for (const p of [a, b]) {
    await p.reload();
    await expect(service(p, 'A los 452.450 km')).toHaveCount(1);
  }
  await Promise.all([a.close(), b.close()]);
});
