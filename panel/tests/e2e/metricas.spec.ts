// Métricas with the invented data of db/seed.sql (the clock is fixed on 15/10/2026): the totals of the month per truck
// and per driver with the rules of «Rendimiento» in the app, the charts with their values on hover and with the keyboard,
// the table that sorts and leads to Viajes, the trucks without movements, the billing of the last 12 months and the files.
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { open, prepare, shot, signIn, stat } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

const table = (page: Page) => page.locator('.metrics-table');
const names = (page: Page) => table(page).locator('tbody tr td:first-child');
const row = (page: Page, name: string) => table(page).locator('tbody tr', { has: page.locator('td:first-child', { hasText: name }) });
const chart = (page: Page, title: string) => page.locator('.viz-card', { has: page.locator('.card-title', { hasText: title }) });
const lines = (page: Page, label: string) => stat(page, label).locator('.amount-lines span');

test('los números del mes por camión, como «Rendimiento» de la app', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await open(page, 'Métricas');
  await expect(page.getByRole('heading', { name: 'Métricas' })).toBeVisible();

  // October: six trips (the one in the trash does not count); pesos and dollars apart; the receipt of 25/09 is not in it.
  await expect(stat(page, 'Kilómetros del GPS').locator('.stat-value')).toHaveText('630 km');
  await expect(stat(page, 'Kilómetros del GPS')).toContainText('6 viajes · 46 % con carga');
  await expect(lines(page, 'Facturado')).toHaveText(['$ 38.500', 'US$ 1.250,50']);
  await expect(stat(page, 'Facturado')).toContainText('Falta el importe de 2 viajes');
  await expect(lines(page, 'Combustible')).toHaveText(['$ 33.050', 'US$ 310']);
  await expect(stat(page, 'Combustible')).toContainText('852,5 litros');
  await expect(stat(page, 'Consumo estimado').locator('.stat-value')).toHaveText('135,3 L/100 km');

  // Longest first; the Mercedes saved with an older label counts for its catalog truck.
  await expect(names(page)).toHaveText(['Mercedes Benz Actros · GHI9012', 'Volvo FH 460 · ABC1234', 'Iveco Stralis · MNO7890', 'Ford Cargo 1722 · JKL3456', 'Scania R450 · DEF5678']);
  // The Ford: the trip the office billed (the one in the trash is out) and its receipt; the Iveco: its trip typed by hand, in dollars.
  await expect(row(page, 'JKL3456').locator('td')).toHaveText(['Ford Cargo 1722 · JKL3456', '1', '95', '100 %', '120', '28.000', '$ 38.500', '300', '$ 16.500', '—']);
  await expect(row(page, 'MNO7890').locator('td')).toHaveText(['Iveco Stralis · MNO7890', '2', '132', '0 %', '180', '30.000', 'US$ 1.250,50', '—', '—', '—']);
  // The Scania's receipt was in dollars; the Volvo's kilos are what Ana typed on the phone; the office corrected its litres.
  await expect(row(page, 'DEF5678').locator('td').nth(8)).toHaveText('US$ 310');
  await expect(row(page, 'ABC1234').locator('td').nth(5)).toHaveText('30.000');
  await expect(row(page, 'ABC1234').locator('td').nth(7)).toHaveText('182,5');
  await expect(table(page).locator('tfoot td')).toHaveText(['Toda la flota', '6', '630', '46 %', '300', '88.000', '$ 38.500US$ 1.250,50', '852,5', '$ 33.050US$ 310', '135,3 L/100 km']);
  await expect(page.locator('.metrics-idle')).toHaveCount(0);

  // The charts: kilometres per truck with and without cargo, and day by day.
  const perTruck = chart(page, 'Kilómetros por camión');
  await expect(perTruck.locator('.viz-legend li')).toHaveText(['Con carga', 'Sin carga']);
  await expect(perTruck.locator('.bar-value')).toHaveText(['211 km', '152 km', '132 km', '95 km', '40 km']);
  await perTruck.locator('.bar-row', { hasText: 'JKL3456' }).hover();
  await expect(perTruck.getByRole('status')).toContainText('Ford Cargo 1722 · JKL3456');
  await expect(perTruck.getByRole('status')).toContainText('95 km con carga');
  // No truck has 300 km in the month: its own consumption is not calculated yet.
  await expect(chart(page, 'Consumo por camión')).toContainText('Todavía no se puede calcular');
  const perDay = chart(page, 'Kilómetros por día');
  await expect(perDay.locator('.col')).toHaveCount(31);
  await expect(perDay.locator('.col-value')).toHaveText('498 km');
  // With the keyboard: the last day, then the arrows move along the days.
  await page.mouse.move(0, 0);
  await perDay.getByRole('group', { name: 'Kilómetros por día' }).focus();
  await page.keyboard.press('End');
  await expect(perDay.getByRole('status')).toContainText('31/10/2026');
  for (let i = 0; i < 16; i++) await page.keyboard.press('ArrowLeft');
  await expect(perDay.getByRole('status')).toContainText('15/10/2026');
  await expect(perDay.getByRole('status')).toContainText('287 km con carga');
  await expect(perDay.getByRole('status')).toContainText('211 km sin carga');
  await perDay.getByText('Ver los datos').click();
  await expect(perDay.locator('.viz-data-table tbody tr')).toHaveCount(31);
  await expect(perDay.locator('.viz-data-table tbody tr', { hasText: '14/10/2026' }).locator('td')).toHaveText(['14/10/2026', '0 km', '132 km', '1']);

  // The last 12 months, by the start of each trip: October has the trip billed in pesos and the one in dollars.
  const billing = chart(page, 'Facturado en los últimos 12 meses');
  await expect(billing.locator('.viz-subtitle')).toHaveText(['En pesos', 'En dólares']);
  await expect(billing.locator('.col-value')).toHaveText(['$ 38.500', 'US$ 1.250,50']);
  await expect(billing.locator('.cols').first().locator('.col')).toHaveCount(12);
  await shot(page, 'metricas');

  // Sorted by a column, and back.
  await table(page).getByRole('button', { name: 'Combustible' }).click();
  await expect(names(page).first()).toHaveText('Ford Cargo 1722 · JKL3456');
  await table(page).getByRole('button', { name: 'Camión' }).click();
  await expect(names(page)).toHaveText(['Ford Cargo 1722 · JKL3456', 'Iveco Stralis · MNO7890', 'Mercedes Benz Actros · GHI9012', 'Scania R450 · DEF5678', 'Volvo FH 460 · ABC1234']);

  // A truck leads to its trips of the same period.
  await row(page, 'JKL3456').getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'Viajes' })).toBeVisible();
  await expect(page).toHaveURL(/periodo=fechas&desde=2026-10-01&hasta=2026-10-31&camion=Ford/);
  await expect(page.locator('.trip-rows > li')).toHaveCount(1);
});

test('por chofer, otro período y los camiones sin movimientos', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Métricas');
  await page.locator('.list-bar .chip', { hasText: 'Por chofer' }).click();
  await expect(page).toHaveURL(/vista=choferes/);
  // Each driver with the receipts they loaded; Ana also has the trip typed by hand.
  await expect(names(page)).toHaveText(['Ana Pereira', 'Carla Méndez', 'Diego Silva', 'Bruno Díaz']);
  await expect(row(page, 'Ana Pereira').locator('td').nth(1)).toHaveText('3');
  await expect(row(page, 'Ana Pereira').locator('td').nth(2)).toHaveText('284');
  await expect(chart(page, 'Kilómetros por chofer').locator('.bar-name').first()).toHaveText('Ana Pereira');

  // September: only Ana's receipt of the Iveco; the other trucks of the catalog had no movements.
  await page.getByLabel('Período').selectOption({ label: 'Mes anterior' });
  await page.locator('.list-bar .chip', { hasText: 'Por camión' }).click();
  await expect(names(page)).toHaveText(['Iveco Stralis · MNO7890']);
  await expect(row(page, 'MNO7890').locator('td').nth(8)).toHaveText('$ 11.000');
  await expect(page.locator('.metrics-idle')).toHaveText('Sin movimientos en el período: Volvo FH 460 · ABC1234, Scania R450 · DEF5678, Mercedes Benz Actros · GHI9012, Ford Cargo 1722 · JKL3456.');
  await expect(chart(page, 'Kilómetros por camión')).toContainText('Sin kilómetros del GPS en el período');
  // The filters stay in the address.
  await page.reload();
  await expect(page.getByLabel('Período')).toHaveValue('mes-anterior');
  await expect(page.locator('.list-bar .chip.is-on')).toHaveText('Por camión');
});

test('el consumo de cada camión contra el de la flota', async ({ page }) => {
  // The Ford made 400 km this month instead of 95: with its 300 litres it has its own consumption.
  await page.route('**/rest/v1/trf_driver_tracking_sessions*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('select') !== '*') return route.fallback();
    const response = await route.fetch();
    const rows = (await response.json()) as { id: string; distance_meters: number }[];
    await route.fulfill({ response, json: rows.map((r) => (r.id === '10000000-0000-4000-8000-00000000000d' ? { ...r, distance_meters: 400_000 } : r)) });
  });
  await signIn(page, 'lectura@ejemplo.uy');
  await open(page, 'Métricas');
  const consumption = chart(page, 'Consumo por camión');
  await expect(consumption.locator('.bar-name')).toHaveText(['Ford Cargo 1722 · JKL3456']);
  await expect(consumption.locator('.bar-value')).toHaveText(['75,0']);
  await expect(consumption).toContainText('Promedio de la flota: 91,2 L/100 km');
  await consumption.locator('.bar-row').hover();
  await expect(consumption.getByRole('status')).toContainText('75,0 L/100 km estimado');
  await expect(row(page, 'JKL3456').locator('td').last()).toHaveText('75,0 L/100 km');
});

async function saved(download: { path: () => Promise<string> }): Promise<Buffer> {
  return readFileSync(await download.path());
}
const unzipText = (data: Buffer, name: string) => strFromU8(unzipSync(new Uint8Array(data))[name] ?? new Uint8Array());

test('la tabla se exporta a Excel y a PDF', async ({ page }) => {
  test.skip(test.info().project.name !== 'escritorio', 'los archivos son los mismos en el celular');
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Métricas');
  await expect(names(page)).toHaveCount(5);
  const download = async (label: string) => {
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('group', { name: 'Exportar la tabla' }).getByRole('button', { name: label }).click()]);
    return file;
  };
  const excel = await download('Excel');
  expect(excel.suggestedFilename()).toBe('metricas_camiones_2026-10-01_a_2026-10-31.xlsx');
  const sheet = await saved(excel);
  const strings = unzipText(sheet, 'xl/sharedStrings.xml') + unzipText(sheet, 'xl/worksheets/sheet1.xml');
  expect(strings).toContain('Ford Cargo 1722 · JKL3456');
  expect(strings).toContain('Facturado US$');
  expect(strings).toContain('Toda la flota');
  const pdf = await download('PDF');
  expect(pdf.suggestedFilename()).toBe('metricas_camiones_2026-10-01_a_2026-10-31.pdf');
  const printed = (await saved(pdf)).toString('latin1');
  expect(printed.startsWith('%PDF')).toBe(true);
  expect(printed).toContain('Toda la flota');
});
