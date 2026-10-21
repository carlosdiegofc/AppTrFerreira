// Mantenimiento with the invented data of db/seed.sql: the kilometres of each truck estimated from the odometer of the
// latest service done plus the GPS of its trips since that day, the services by date and by kilometres, and the filters.
import { expect, type Page, test } from '@playwright/test';
import { open, prepare, shot, signIn, stat } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

const services = (page: Page) => page.locator('.service-list > li');
const card = (page: Page, plate: string) => page.locator('.km-card', { hasText: plate });
const chip = (page: Page, name: string) => page.locator('.list-bar .chip', { hasText: name });

test('los services por hacer, por fecha y por kilómetros estimados', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await open(page, 'Mantenimiento');
  await expect(page.getByRole('heading', { name: 'Mantenimiento' })).toBeVisible();

  await expect(stat(page, 'Vencidos').locator('.stat-value')).toHaveText('1');
  await expect(stat(page, 'Próximos').locator('.stat-value')).toHaveText('2');
  await expect(stat(page, 'Por hacer').locator('.stat-value')).toHaveText('4');
  await expect(stat(page, 'Hechos en 30 días').locator('.stat-value')).toHaveText('2');

  // The Ford: 412.000 written 18 days ago plus the 95 km of today's trip (the trip deleted in the panel does not count).
  await expect(card(page, 'JKL3456').locator('.km-value')).toHaveText('412.095 km');
  await expect(card(page, 'JKL3456')).toContainText('412.000 km anotados el 27/09/2026 + 95 km de GPS');
  await expect(card(page, 'DEF5678').locator('.km-value')).toHaveText('250.040 km');
  await expect(card(page, 'ABC1234').locator('.km-value')).toHaveText('Sin kilometraje');
  await expect(card(page, 'ABC1234')).toContainText('2 por hacer');
  await expect(card(page, 'GHI9012')).toContainText('Nada por hacer');

  // Late first, then coming up (by date, then by kilometres), then without anything to compare with.
  await expect(services(page).locator('strong')).toHaveText(['Frenos', 'Cambio de aceite', 'Cambio de aceite', 'Cambio de filtros']);
  await expect(services(page).nth(0)).toContainText('Era para el 13/10/2026');
  await expect(services(page).nth(0).locator('.pill')).toHaveText('Vencido');
  await expect(services(page).nth(1)).toContainText('20/10/2026 · en 5 días');
  await expect(services(page).nth(2)).toContainText('Ford Cargo 1722 · JKL3456');
  await expect(services(page).nth(2)).toContainText('A los 412.500 km · faltan unos 405 km');
  await expect(services(page).nth(2)).toContainText('Cada 10.000 km');
  await expect(services(page).nth(2).locator('.pill')).toHaveText('Próximo');
  await expect(services(page).nth(3)).toContainText('A los 160.000 km · sin kilometraje para estimar cuánto falta');
  await expect(services(page).nth(3).locator('.pill')).toHaveText('Pendiente');
  await shot(page, 'mantenimiento');

  await chip(page, 'Hechos').click();
  await expect(page).toHaveURL(/vista=hechos/);
  await expect(services(page).locator('strong')).toHaveText(['Cubiertas', 'Revisión general']);
  await expect(services(page).nth(0)).toContainText('Hecho el 27/09/2026 · Con 412.000 km');
  await expect(services(page).nth(0)).toContainText('Taller Salto');
  await expect(services(page).nth(0).locator('.pill')).toHaveText('Realizado');

  // One truck: its card, the list and the counts.
  await card(page, 'JKL3456').click();
  await expect(page).toHaveURL(/camion=Ford/);
  await expect(services(page)).toHaveCount(1);
  await chip(page, 'Por hacer').click();
  await expect(services(page).locator('strong')).toHaveText(['Cambio de aceite']);
  await expect(stat(page, 'Por hacer').locator('.stat-value')).toHaveText('1');
  await page.getByLabel('Buscar').fill('frenos');
  await expect(page.getByText('No hay services por hacer')).toBeVisible();
  // The filters stay in the address.
  await page.reload();
  await expect(page.getByLabel('Buscar')).toHaveValue('frenos');
  await expect(page.locator('.filters').getByLabel('Camión')).toHaveValue('Ford Cargo 1722 · JKL3456');
});

test('sin un service hecho con sus kilómetros, actualizar no lee los viajes', async ({ page }) => {
  // No service done has its odometer: there is nothing to count the kilometres from.
  await page.route('**/rest/v1/trf_vehicle_maintenance*', async (route) => {
    const response = await route.fetch();
    const rows = (await response.json()) as { odometer_km: number | null }[];
    await route.fulfill({ response, json: rows.map((r) => ({ ...r, odometer_km: null })) });
  });
  const kmReads: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).searchParams.get('select') === 'id,vehicle,started_at,distance_meters') kmReads.push(r.url());
  });
  await signIn(page, 'lectura@ejemplo.uy');
  await expect(page.locator('.alert-line').first()).toBeVisible();
  const reread = () => page.waitForResponse((r) => r.url().includes('/rest/v1/trf_vehicle_maintenance'));
  let answer = reread();
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await answer;
  await open(page, 'Mantenimiento');
  await expect(card(page, 'JKL3456').locator('.km-value')).toHaveText('Sin kilometraje');
  answer = reread();
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await answer;
  await expect(page.getByRole('button', { name: 'Actualizar' })).toBeEnabled();
  expect(kmReads).toEqual([]);
});

test('volver atrás trae de nuevo la búsqueda de la lista', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await open(page, 'Mantenimiento');
  await page.getByLabel('Buscar').fill('frenos');
  await expect(page).toHaveURL(/buscar=frenos/);
  await expect(services(page).locator('strong')).toHaveText(['Frenos']);
  // The side menu opens the section again without filters; going back brings the search back, in the box and the list.
  await open(page, 'Mantenimiento');
  await expect(page.getByLabel('Buscar')).toHaveValue('');
  await expect(services(page)).toHaveCount(4);
  await page.goBack();
  await expect(page).toHaveURL(/buscar=frenos/);
  await expect(page.getByLabel('Buscar')).toHaveValue('frenos');
  await expect(services(page).locator('strong')).toHaveText(['Frenos']);
});

test('un service se abre con lo que tiene, y el kilometraje estimado de su camión', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Mantenimiento');
  await services(page).nth(2).getByRole('button').click();
  const form = page.getByRole('dialog', { name: 'Editar service' });
  await expect(form.getByLabel('Camión')).toHaveValue('Ford Cargo 1722 · JKL3456');
  await expect(form.getByLabel('Tipo de service')).toHaveValue('Cambio de aceite');
  await expect(form.getByLabel('A los km')).toHaveValue('412500');
  await expect(form.getByLabel('Se repite cada (km)')).toHaveValue('10000');
  await expect(form).toContainText('Hoy tiene unos 412.095 km (estimado con el GPS).');
  await expect(form).toContainText('Lo cargó Dueño de Prueba');
  // Nothing changed: closing does not ask.
  await form.getByRole('button', { name: 'Cancelar' }).click();
  await expect(form).toBeHidden();
});
