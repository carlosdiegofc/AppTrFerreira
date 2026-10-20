// Combustible as the office reads it: the receipts of the app grouped by station, with what was loaded in the period,
// each station's account and its statement. Read-only: the tests that save run last, in edicion-combustible.spec.ts.
import { expect, type Page, test } from '@playwright/test';
import { open, prepare, shot, signIn, stat } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

const station = (page: Page, name: string) => page.locator('.fuel-station', { hasText: name });
const receipts = (page: Page) => page.locator('.fuel-receipts > li');
const chip = (page: Page, name: string) => page.locator('.chip', { hasText: name });
/** A filter of the list: the rows name their station too. */
const filter = (page: Page, label: string) => page.getByRole('region', { name: 'Filtros' }).getByLabel(label);

test('las boletas se agrupan por estación, con lo cargado en el período y la cuenta de cada una', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Combustible');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Combustible');
  // Most recent first; the catalog station without receipts shows too.
  await expect(page.locator('.fs-name strong')).toHaveText(['Ancap Ruta 5 km 32', 'Petrobras Salto', 'Estación El Tala', 'Ducsa Young']);

  // Diego typed «ANCAP  ruta 5 KM 32»: it counts for the station of the list. The office's correction of Ana's receipt
  // (9.950 instead of 9.800) is what counts.
  const ruta5 = station(page, 'Ancap Ruta 5 km 32');
  await expect(ruta5).toContainText('De la lista de la app · última carga el 15/10/2026');
  await expect(ruta5.locator('.fs-period')).toContainText('$ 37.450');
  await expect(ruta5.locator('.fs-period')).toContainText('3 boletas · 682,5 L en el período');
  // Opening balance of 25.000 ten days ago, plus 9.950 and 16.500 since then, minus the transfer of 20.000; the receipt
  // of twenty days ago is inside the opening balance.
  await expect(ruta5.locator('.fs-balance')).toHaveText('Se le debe $ 31.450');

  // Dollars stay apart; the receipt in the trash does not count.
  const salto = station(page, 'Petrobras Salto');
  await expect(salto.locator('.fs-period')).toContainText('US$ 310');
  await expect(salto.locator('.fs-period')).toContainText('1 boleta · 250 L en el período');
  await expect(salto.locator('.fs-balance')).toHaveText('Se le debe US$ 210');

  await expect(station(page, 'Estación El Tala')).toContainText('Escrita a mano · última carga el 10/10/2026');
  await expect(station(page, 'Estación El Tala').locator('.fs-balance')).toHaveText('Se le debe $ 6.600');
  await expect(station(page, 'Ducsa Young')).toContainText('Sin cuenta todavía');

  // Pesos and dollars on lines of their own, never added together.
  await expect(stat(page, 'Cargado').locator('.amount-lines > span')).toHaveText(['$ 44.050', 'US$ 310']);
  await expect(stat(page, 'Cargado').locator('.stat-detail')).toHaveText('5 boletas');
  await expect(stat(page, 'Litros en el período').locator('.stat-value')).toHaveText('1.052,5');
  await expect(stat(page, 'Saldo con las estaciones').locator('.amount-lines > span')).toHaveText(['$ 38.050', 'US$ 210']);
  await expect(stat(page, 'Boletas sin importe').locator('.stat-value')).toHaveText('0');
  await shot(page, 'combustible-estaciones');

  // The previous month: only the receipt of twenty days ago. The accounts are always as of today.
  await page.getByLabel('Período').selectOption({ label: 'Mes anterior' });
  await expect(ruta5.locator('.fs-period')).toContainText('$ 11.000');
  await expect(ruta5.locator('.fs-period')).toContainText('1 boleta · 200 L en el período');
  await expect(salto.locator('.fs-period')).toContainText('Sin cargas');
  await expect(salto.locator('.fs-balance')).toHaveText('Se le debe US$ 210');
  await expect(page).toHaveURL(/periodo=mes-anterior/);
});

test('la lista de boletas filtra por estación y búsqueda, muestra la foto y tiene papelera', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Combustible');
  await chip(page, 'Boletas').click();
  await expect(receipts(page)).toHaveCount(5);
  await expect(page.locator('.list-total')).toHaveText('5 boletas · 1.052,5 L · $ 44.050 · US$ 310');
  // Newest first: Bruno loaded his an hour after Ana. Ana's receipt on her trip was corrected by the office.
  await expect(receipts(page).first()).toContainText('15/10/2026En un viajePetrobras SaltoBruno Díaz');
  const ana = receipts(page).nth(1);
  await expect(ana).toContainText('15/10/2026');
  await expect(ana).toContainText('Ancap Ruta 5 km 32');
  await expect(ana).toContainText('$ 9.950');
  await expect(ana).toContainText('Corregida');
  await expect(ana.getByRole('link', { name: 'Ver viaje' })).toHaveAttribute('href', /\/viajes\/app:10000000-0000-4000-8000-00000000000a$/);

  await filter(page, 'Estación').selectOption({ label: 'Ancap Ruta 5 km 32' });
  await expect(receipts(page)).toHaveCount(3);
  await page.getByLabel('Buscar').fill('diego');
  await expect(receipts(page)).toHaveCount(1);
  await expect(receipts(page).first()).toContainText('Sin viaje');
  await receipts(page).first().getByRole('button', { name: 'Ver boleta' }).click();
  await expect(page.getByRole('dialog', { name: /Boleta de Ancap Ruta 5 km 32/ }).locator('img')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar la foto' }).click();
  await shot(page, 'combustible-boletas');

  // The trash: Diego's receipt of yesterday.
  await filter(page, 'Estación').selectOption({ label: 'Todas las estaciones' });
  await page.getByLabel('Buscar').fill('');
  await chip(page, 'Papelera').click();
  await expect(receipts(page)).toHaveCount(1);
  await expect(receipts(page).first()).toContainText('Petrobras Salto');
  await expect(receipts(page).first()).toContainText('$ 2.700');
  await expect(receipts(page).first().getByRole('button', { name: 'Restaurar' })).toBeVisible();
});

test('el estado de cuenta de una estación va del saldo inicial en adelante, con el saldo después de cada renglón', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Combustible');
  await station(page, 'Ancap Ruta 5 km 32').click();
  await expect(page).toHaveURL(/\/combustible\/estaciones\/id%3Aest-ruta5$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ancap Ruta 5 km 32');
  await expect(page.locator('.page-sub')).toHaveText('De la lista de estaciones de la app · última carga el 15/10/2026 · 3 boletas');

  const pesos = page.locator('.card', { hasText: 'Cuenta en pesos' });
  await expect(pesos.locator('.card-head')).toContainText('Se le debe $ 31.450');
  await expect(pesos.locator('.facts')).toContainText('Saldo inicial$ 25.000 al 05/10/2026');
  await expect(pesos.locator('.facts')).toContainText('Cargas$ 26.450');
  await expect(pesos.locator('.facts')).toContainText('Pagos$ 20.000');
  await expect(pesos).toContainText('1 boleta o pago anterior al 05/10/2026 está dentro del saldo inicial.');
  const lines = pesos.locator('tbody tr');
  await expect(lines).toHaveCount(4);
  await expect(lines.nth(0)).toContainText('05/10/2026Saldo inicial$ 25.000$ 25.000');
  await expect(lines.nth(1)).toContainText('12/10/2026Pago · Transferencia · Transferencia BROU$ -20.000$ 5.000');
  await expect(lines.nth(2)).toContainText('13/10/2026Boleta · Diego Silva · Ford Cargo 1722 · JKL3456 · 300 L$ 16.500$ 21.500');
  await expect(lines.nth(3)).toContainText('15/10/2026Boleta · Ana Pereira · Volvo FH 460 · ABC1234 · 182,5 L');
  await expect(lines.nth(3)).toContainText('$ 9.950$ 31.450');
  await expect(lines.nth(2).getByRole('button', { name: 'Ver boleta' })).toBeVisible();
  await shot(page, 'combustible-estado-de-cuenta');

  await page.getByRole('button', { name: 'Combustible' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Combustible');

  // In dollars, without an opening balance: from the first payment on.
  await station(page, 'Petrobras Salto').click();
  const dollars = page.locator('.card', { hasText: 'Cuenta en dólares' });
  await expect(dollars.locator('tbody tr')).toHaveCount(2);
  await expect(dollars.locator('.facts')).toContainText('Sin saldo inicial: la cuenta empieza con la primera boleta');
  await expect(dollars.locator('tbody tr').last()).toContainText('US$ 310US$ 210');
});

test('una boleta con fecha posterior a hoy suma en la cuenta y queda marcada para corregir la fecha', async ({ page }) => {
  // The browser two days before the seed: the receipts of 15/10 are dated after «today».
  await page.clock.setFixedTime(new Date('2026-10-13T15:00:00Z'));
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Combustible');
  const warning = page.locator('.notice-warn', { hasText: 'fecha posterior a hoy' });
  await expect(warning).toContainText('2 boletas tienen fecha posterior a hoy y ya suman en la cuenta de su estación: abrilas y corregí la fecha.');
  // The fuel was loaded: the accounts are the same as on the 15th.
  await expect(station(page, 'Ancap Ruta 5 km 32').locator('.fs-balance')).toHaveText('Se le debe $ 31.450');
  await expect(station(page, 'Petrobras Salto').locator('.fs-balance')).toHaveText('Se le debe US$ 210');
  await shot(page, 'combustible-fecha-futura');

  // The periods end today: the button shows every receipt, the ones dated later first.
  await warning.getByRole('button', { name: 'Ver las boletas' }).click();
  await expect(page).toHaveURL(/vista=boletas/);
  await expect(page.getByLabel('Período')).toHaveValue('todo');
  await expect(receipts(page).locator('.fr-date.is-future')).toHaveCount(2);
  await expect(receipts(page).nth(0).locator('.fr-date')).toHaveText('15/10/2026Fecha futura');
  await expect(receipts(page).nth(2).locator('.fr-date')).toHaveText('13/10/2026Sin viaje');
  await expect(warning.getByRole('button')).toHaveCount(0);
  await shot(page, 'combustible-fecha-futura-boletas');

  // In the statement, Ana's line is marked and a note says why.
  await chip(page, 'Por estación').click();
  await station(page, 'Ancap Ruta 5 km 32').click();
  const pesos = page.locator('.card', { hasText: 'Cuenta en pesos' });
  await expect(pesos).toContainText('Una boleta tiene fecha posterior a hoy y ya suma en el saldo: con «Corregir» poné la fecha correcta.');
  await expect(pesos.locator('tbody tr').last()).toContainText('Fecha futura');
  await expect(pesos.locator('tbody tr').last()).toContainText('$ 9.950$ 31.450');
  await expect(pesos.locator('tbody tr').filter({ hasText: 'Fecha futura' })).toHaveCount(1);
  await shot(page, 'combustible-fecha-futura-cuenta');
});

test('sin la lista de estaciones de la app no muestra cuentas que darían mal, y con fechas al revés no da totales', async ({ page }) => {
  let failing = true;
  await page.route('**/rest/v1/trf_mobile_catalog*', (route) =>
    failing ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"falla de prueba"}' }) : route.fallback(),
  );
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Combustible');
  const note = page.getByRole('alert').filter({ hasText: 'No se pudo leer la lista de estaciones de la app' });
  await expect(note).toContainText('las cuentas de las estaciones darían mal');
  await expect(page.locator('.stat')).toHaveCount(0);
  await expect(page.locator('.fuel-station')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Registrar pago' })).toBeDisabled();
  failing = false;
  await note.getByRole('button', { name: 'Reintentar' }).click();
  await expect(station(page, 'Ancap Ruta 5 km 32').locator('.fs-balance')).toHaveText('Se le debe $ 31.450');
  await expect(page.getByRole('button', { name: 'Registrar pago' })).toBeEnabled();

  // «Hasta» before «desde», from an edited address: no period, so no totals for it.
  await page.goto('./#/combustible?periodo=fechas&desde=2026-10-10&hasta=2026-10-01');
  await expect(page.getByRole('alert').filter({ hasText: 'Revisá las fechas' })).toBeVisible();
  await expect(stat(page, 'Cargado en el período').locator('.stat-value')).toHaveText('—');
  await expect(stat(page, 'Litros en el período').locator('.stat-value')).toHaveText('—');
  await expect(stat(page, 'Saldo con las estaciones').locator('.amount-lines > span')).toHaveText(['$ 38.050', 'US$ 210']);
});

test('las boletas que no dicen la estación no suman en ninguna cuenta y se corrigen desde su página', async ({ page }) => {
  // An old receipt without a station, added to what the database sends.
  await page.route('**/rest/v1/trf_driver_fuel_receipts*', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    const rows = (await response.json()) as Record<string, unknown>[];
    rows.push({
      id: '40000000-0000-4000-8000-0000000000aa', trip_id: null, driver_id: '00000000-0000-4000-8000-000000000013', driver_name: 'Carla Méndez', vehicle: 'Mercedes Benz Actros',
      recorded_at: '2026-10-14T15:00:00Z', receipt_date: '2026-10-14', distance_meters: 0, object_path: null, archived: false, station_id: '', station_name: '', liters: 50, total: 2500,
      panel_data: null, updated_at: null, updated_by: null,
    });
    return route.fulfill({ response, json: rows });
  });
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Combustible');
  const none = station(page, 'Estación sin indicar');
  await expect(none).toContainText('Boletas sin estación');
  await expect(none.locator('.fs-balance')).toHaveText('No suma en ninguna cuenta');
  // What is owed to the stations is the same as without it.
  await expect(stat(page, 'Saldo con las estaciones').locator('.amount-lines > span')).toHaveText(['$ 38.050', 'US$ 210']);

  await none.click();
  await expect(page).toHaveURL(/\/combustible\/estaciones\/name%3A$/);
  await expect(page.locator('.notice-warn')).toContainText('Estas boletas no dicen en qué estación se cargaron');
  const list = page.locator('.card', { hasText: 'Boletas en pesos' });
  await expect(list.locator('tbody tr')).toHaveCount(1);
  await expect(list.locator('tbody tr')).toContainText('$ 2.500');
  await expect(list.locator('thead')).not.toContainText('Saldo');
  await expect(page.getByRole('button', { name: 'Registrar pago' })).toHaveCount(0);
  await expect(list.getByRole('button', { name: 'Corregir' })).toBeVisible();
});

test('una estación que no existe lo dice', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await expect(stat(page, 'En ruta')).toBeVisible();
  await page.goto('./#/combustible/estaciones/name%3Ano%20existe');
  await expect(page.getByText('No encontramos esa estación')).toBeVisible();
});
