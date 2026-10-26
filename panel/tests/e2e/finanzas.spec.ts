// Gastos y finanzas, first part: the expenses of the month with their sums, the invoice, the filters, the sums by kind and
// by what each went to, the annulled ones, and where the other sections show them: the cost of each service done, the
// expenses of a trip and «Ver sus gastos» of a truck, a trailer and a driver. Read only: the seed's data.
import { expect, type Page, test } from '@playwright/test';
import { open, prepare, shot, signIn, stat } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

const filter = (page: Page, label: string) => page.locator('.filters').getByLabel(label);
const expenses = (page: Page) => page.getByRole('list', { name: 'Gastos' }).getByRole('listitem');
const view = (page: Page, name: string) => page.getByRole('group', { name: 'Vista' }).getByRole('button', { name: new RegExp(`^${name}`) });

test('los gastos del mes con sus totales y la factura', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Gastos y finanzas');
  await expect(page.getByRole('heading', { name: 'Gastos y finanzas', level: 1 })).toBeVisible();

  // October: pesos and dollars apart; the annulled fine does not count.
  await expect(stat(page, 'Gastado en el período')).toContainText('$ 21.120');
  await expect(stat(page, 'Gastado en el período')).toContainText('US$ 950');
  await expect(stat(page, 'Gastado en el período')).toContainText('5 gastos');
  await expect(stat(page, 'Lo que más pesó')).toContainText('$ 18.500');
  await expect(stat(page, 'Lo que más pesó')).toContainText('Reparación y repuestos');
  await expect(stat(page, 'En camiones y acoplados')).toContainText('$ 19.400');
  await expect(stat(page, 'Sin factura').locator('.stat-value')).toHaveText('4');

  // The newest first, each with what it went to.
  await expect(expenses(page).locator('.ex-main strong')).toHaveText(['Peajes en efectivo', 'Reparación y repuestos', 'Viáticos', 'Lavado', 'Seguro']);
  await expect(expenses(page).nth(0)).toContainText('15/10/2026');
  await expect(expenses(page).nth(0)).toContainText('Viaje: Orden de carga 24129 · Paysandú → Salto');
  await expect(expenses(page).nth(1)).toContainText('Camión: Volvo FH 460 · ABC1234 · Taller El Ruso');
  await expect(expenses(page).nth(1)).toContainText('$ 18.500');
  await expect(expenses(page).nth(2)).toContainText('Chofer: Bruno Díaz');
  await expect(expenses(page).nth(3)).toContainText('Acoplado: Semirremolque Randon · REM1001');
  await expect(expenses(page).nth(4)).toContainText('La empresa · BSE');
  await expect(expenses(page).nth(4)).toContainText('US$ 950');
  await expect(page.locator('.list-total')).toHaveText('5 gastos · $ 21.120 · US$ 950 · 4 sin factura');
  await shot(page, 'finanzas');

  // The invoice of the repair, from the private folder.
  await expect(expenses(page).nth(0)).toContainText('Sin factura');
  await expenses(page).nth(1).getByRole('button', { name: 'Ver factura' }).click();
  await expect(page.getByRole('dialog', { name: 'Factura · Reparación y repuestos del 12/10/2026' }).locator('img')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar la foto' }).click();
});

test('los filtros, la suma por tipo y a qué fue cada gasto', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await open(page, 'Gastos y finanzas');
  await expect(expenses(page)).toHaveCount(5);

  // Last month: the tyres of the Ford, the cost of its service, and the road tax of the Mercedes.
  await filter(page, 'Período').selectOption({ label: 'Mes anterior' });
  await expect(page).toHaveURL(/periodo=mes-anterior/);
  await expect(expenses(page).locator('.ex-main strong')).toHaveText(['Cubiertas', 'Patente e impuestos']);
  await expect(expenses(page).nth(0)).toContainText('US$ 2.400');
  await expect(expenses(page).nth(0)).toContainText('De un service');
  await expect(stat(page, 'Gastado en el período')).toContainText('$ 15.600');
  await expect(stat(page, 'Gastado en el período')).toContainText('US$ 2.400');

  // Every day, only the trucks.
  await filter(page, 'Período').selectOption({ label: 'Todo' });
  await filter(page, 'A qué va').selectOption({ label: 'Todos los camiones' });
  await expect(expenses(page).locator('.ex-main strong')).toHaveText(['Reparación y repuestos', 'Cubiertas', 'Patente e impuestos']);
  await filter(page, 'A qué va').selectOption({ label: 'Ford Cargo 1722 · JKL3456' });
  await expect(expenses(page).locator('.ex-main strong')).toHaveText(['Cubiertas']);
  await filter(page, 'A qué va').selectOption({ label: 'Todo' });
  await filter(page, 'Tipo').selectOption({ label: 'Lavado' });
  await expect(expenses(page).locator('.ex-main strong')).toHaveText(['Lavado']);
  await filter(page, 'Tipo').selectOption({ label: 'Todos los tipos' });
  await filter(page, 'Buscar').fill('bse');
  await expect(expenses(page).locator('.ex-main strong')).toHaveText(['Seguro']);
  // The filters stay in the address.
  await page.reload();
  await expect(filter(page, 'Buscar')).toHaveValue('bse');
  await expect(filter(page, 'Período')).toHaveValue('todo');
  await filter(page, 'Buscar').fill('');

  // By kind: the biggest first, each line shows its expenses.
  await filter(page, 'Período').selectOption({ label: 'Este mes' });
  await view(page, 'Por tipo').click();
  const kinds = page.getByRole('table', { name: 'Tipo' });
  await expect(kinds.locator('tbody tr td:first-child')).toHaveText(['Reparación y repuestos', 'Viáticos', 'Lavado', 'Peajes en efectivo', 'Seguro']);
  await expect(kinds.locator('tbody tr').nth(4)).toContainText('US$ 950');
  await shot(page, 'finanzas-por-tipo');
  await kinds.getByRole('button', { name: 'Viáticos' }).click();
  await expect(expenses(page).locator('.ex-main strong')).toHaveText(['Viáticos']);
  await expect(filter(page, 'Tipo')).toHaveValue('Viáticos');
  await filter(page, 'Tipo').selectOption({ label: 'Todos los tipos' });

  // What each went to: the truck, the driver, the trailer, the trip and the company.
  await view(page, 'A qué fue').click();
  const places = page.getByRole('table', { name: 'A qué fue' });
  await expect(places.locator('tbody tr td:first-child')).toHaveText(['Volvo FH 460 · ABC1234', 'Bruno Díaz', 'Semirremolque Randon · REM1001', 'Orden de carga 24129 · Paysandú → Salto', 'La empresa']);
  await expect(places.locator('tbody tr td:nth-child(2)')).toHaveText(['Camión', 'Chofer', 'Acoplado', 'Viaje', 'Empresa']);
  await places.getByRole('button', { name: 'Semirremolque Randon · REM1001' }).click();
  await expect(expenses(page).locator('.ex-main strong')).toHaveText(['Lavado']);

  // The annulled fine: it stays, apart, and counts nowhere.
  await filter(page, 'A qué va').selectOption({ label: 'Todo' });
  await view(page, 'Anulados').click();
  await expect(expenses(page).locator('.ex-main strong')).toHaveText(['Multas']);
  await expect(expenses(page).nth(0)).toContainText('Camión: Scania R450 · DEF5678');
  await expect(expenses(page).nth(0).getByRole('button', { name: 'Restaurar' })).toBeVisible();
  await expect(page.locator('.list-total')).toHaveText('1 gasto · $ 3.000 · no cuentan en los totales');
});

test('cada sección muestra sus gastos: el costo de los services, los gastos de un viaje y los de cada ficha', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');

  // The tyres of the Ford have their cost; the general check of the Scania does not have it yet.
  await open(page, 'Mantenimiento');
  await view(page, 'Hechos').click();
  const services = page.locator('.service-list > li');
  await expect(services.nth(0)).toContainText('Cubiertas');
  await expect(services.nth(0).locator('.sv-cost')).toContainText('CostoUS$ 2.400');
  await expect(services.nth(1)).toContainText('Revisión general');
  await expect(services.nth(1).getByRole('button', { name: 'Anotar el costo' })).toBeVisible();

  // Diego's trip: its cash tolls.
  await page.goto('./#/viajes/app:10000000-0000-4000-8000-00000000000d');
  const trip = page.locator('.card', { has: page.getByRole('heading', { name: 'Gastos del viaje (1)' }) });
  await expect(trip).toContainText('Peajes en efectivo');
  await expect(trip).toContainText('15/10/2026 · $ 520 · sin factura');
  await trip.getByRole('link', { name: 'Ver en Gastos y finanzas' }).click();
  await expect(page).toHaveURL(/destino=viaje%3Aapp%3A10000000-0000-4000-8000-00000000000d/);
  await expect(filter(page, 'A qué va')).toHaveValue('viaje:app:10000000-0000-4000-8000-00000000000d');
  await expect(expenses(page).locator('.ex-main strong')).toHaveText(['Peajes en efectivo']);

  // From the card of a truck, a trailer and a driver.
  await page.goto('./#/flota/camion/plate%3Aabc1234');
  await page.getByRole('link', { name: 'Ver sus gastos' }).click();
  await expect(filter(page, 'Período')).toHaveValue('todo');
  await expect(expenses(page).locator('.ex-main strong')).toHaveText(['Reparación y repuestos']);
  await page.goto('./#/flota/acoplado/a0000000-0000-4000-8000-000000000002');
  await page.getByRole('link', { name: 'Ver sus gastos' }).click();
  await expect(expenses(page).locator('.ex-main strong')).toHaveText(['Lavado']);
  await page.goto('./#/choferes/70000000-0000-4000-8000-000000000002');
  await page.getByRole('link', { name: 'Ver sus gastos' }).click();
  await expect(expenses(page).locator('.ex-main strong')).toHaveText(['Viáticos']);
  await expect(filter(page, 'A qué va')).toHaveValue('chofer:70000000-0000-4000-8000-000000000002');
});

test('si no se pueden leer los gastos, lo dice y se puede reintentar', async ({ page }) => {
  let fail = true;
  await page.route('**/rest/v1/trf_expenses*', (route) => (fail ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"falla de prueba"}' }) : route.fallback()));
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Gastos y finanzas');
  await expect(page.getByRole('alert')).toContainText('No se pudieron leer los gastos.');
  await expect(page.getByRole('button', { name: 'Nuevo gasto' })).toBeDisabled();
  fail = false;
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(expenses(page)).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Nuevo gasto' })).toBeEnabled();
});
