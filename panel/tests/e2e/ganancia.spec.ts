// Ganancia, in Gastos y finanzas: what October left up to today (the seed's day), with each truck and each trip, the
// general expenses, the salaries and the viáticos, against the same days of September; the last 12 months, and a past
// month against the whole month before it. Read only: the seed's data.
import { expect, type Page, test } from '@playwright/test';
import { open, prepare, shot, signIn } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

/** A big number by its exact name: «Facturado» is also a word of the profit's explanation. */
const tile = (page: Page, label: string) => page.locator('.stat').filter({ has: page.locator('.stat-label', { hasText: new RegExp(`^${label}$`) }) });
const row = (page: Page, table: RegExp, text: string | RegExp) => page.getByRole('table', { name: table }).getByRole('row').filter({ hasText: text });

async function openGanancia(page: Page) {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Gastos y finanzas');
  await page.getByRole('navigation', { name: 'Partes de Gastos y finanzas' }).getByRole('link', { name: 'Ganancia' }).click();
  await expect(page).toHaveURL(/\/finanzas\/ganancia$/);
}

test('lo que dejó el mes: cada camión, cada viaje y la empresa, en pesos y en dólares', async ({ page }) => {
  await openGanancia(page);
  await expect(page.getByRole('combobox', { name: /^Mes/ })).toHaveValue('2026-10-01');

  // September up to the 15th had only Ana's salary: no billing to compare with, and the costs went up.
  const result = tile(page, 'Ganancia del mes, hasta hoy');
  await expect(result).toContainText('−$ 64.625,50');
  await expect(result).toContainText('−US$ 9,50');
  await expect(result.locator('.stat-trend')).toHaveText('↓ 44 % menos que a esta altura de setiembre, en pesos');
  await expect(tile(page, 'Facturado')).toContainText('$ 38.500');
  await expect(tile(page, 'Facturado')).toContainText('US$ 1.250,50');
  await expect(tile(page, 'Facturado')).toContainText('6 viajes');
  await expect(tile(page, 'Facturado').locator('.stat-trend')).toHaveCount(0);
  await expect(tile(page, 'Costos')).toContainText('$ 103.125,50');
  await expect(tile(page, 'Costos')).toContainText('US$ 1.260');
  await expect(tile(page, 'Costos').locator('.stat-trend')).toHaveText('↑ 129 % más que a esta altura de setiembre, en pesos');
  await expect(tile(page, 'Costos').locator('.stat-trend')).toHaveClass(/is-red/);
  await expect(tile(page, 'Viajes sin importe')).toContainText('Todos tienen importe');
  // Ana passed Pando with the Volvo, whose rate is not loaded.
  await expect(page.getByText('Un paso por un peaje no tiene tarifa: no suma.')).toBeVisible();

  const steps = /Cómo se llega a la ganancia de octubre de 2026/;
  await expect(row(page, steps, /^− ?Combustible/)).toContainText('$ 33.050');
  await expect(row(page, steps, /^− ?Combustible/)).toContainText('US$ 310');
  await expect(row(page, steps, /^− ?Peajes/)).toContainText('$ 455,50');
  await expect(row(page, steps, 'Lo que dejó la flota')).toContainText('−$ 14.925,50');
  await expect(row(page, steps, 'Lo que dejó la flota')).toContainText('US$ 940,50');
  await expect(row(page, steps, 'Gastos de la empresa')).toContainText('US$ 950');
  await expect(row(page, steps, 'Gastos de los choferes')).toContainText('$ 1.200');
  await expect(row(page, steps, 'Sueldos del mes')).toContainText('$ 45.000');
  await expect(row(page, steps, 'Viáticos del mes')).toContainText('$ 3.500');
  await expect(row(page, steps, 'Ganancia de la empresa')).toContainText('−$ 64.625,50');

  // Each truck: the Ford with its trip, its receipt, its toll and the trip's cash tolls; the Volvo with its repair and
  // the washing of the semi-trailer it takes.
  const trucks = /Ganancia de cada camión en octubre de 2026/;
  await expect(page.getByRole('table', { name: trucks }).locator('tbody tr td:first-child')).toHaveText([
    'Ford Cargo 1722 · JKL3456',
    'Iveco Stralis · MNO7890',
    'Mercedes Benz Actros · GHI9012',
    'Scania R450 · DEF5678',
    'Volvo FH 460 · ABC1234',
  ]);
  const ford = row(page, trucks, 'Ford Cargo 1722');
  for (const text of ['$ 38.500', '$ 16.500', '$ 455,50', '$ 520', '$ 21.024,50']) await expect(ford).toContainText(text);
  await expect(row(page, trucks, 'Volvo FH 460')).toContainText('$ 19.400');
  await expect(row(page, trucks, 'Volvo FH 460')).toContainText('−$ 29.350');
  await expect(row(page, trucks, 'Toda la flota')).toContainText('−$ 14.925,50');

  // Each trip, with what it cost on any day; the one in the trash is not there.
  const trips = /Ganancia de cada viaje de octubre de 2026/;
  await expect(page.getByRole('table', { name: trips }).locator('tbody tr')).toHaveCount(6);
  await expect(row(page, trips, 'Orden 24129')).toContainText('$ 37.524,50');
  await expect(row(page, trips, 'Navios')).toContainText('En curso');
  await expect(row(page, trips, 'Navios')).toContainText('1 paso sin tarifa');
  await expect(row(page, trips, 'Navios')).toContainText('−$ 9.950');

  const months = /Ganancia de la empresa mes a mes/;
  await expect(row(page, months, 'Setiembre de 2026')).toContainText('−$ 71.600');
  await expect(row(page, months, 'Setiembre de 2026')).toContainText('−US$ 2.400');
  // Ramón's salary until the month he stopped working.
  await expect(row(page, months, 'Agosto de 2026')).toContainText('−$ 30.000');
  await shot(page, 'ganancia');

  // September, whole, against the whole of August.
  await row(page, months, 'Setiembre de 2026').getByRole('button', { name: 'Setiembre de 2026' }).click();
  await expect(page).toHaveURL(/mes=2026-09/);
  await expect(page.getByRole('combobox', { name: /^Mes/ })).toHaveValue('2026-09-01');
  const september = tile(page, 'Ganancia del mes');
  await expect(september).toContainText('−$ 71.600');
  await expect(september.locator('.stat-trend')).toHaveText('↓ 139 % menos que agosto, en pesos');
  await expect(page.getByText('No hubo viajes en setiembre de 2026')).toBeVisible();
  await page.getByRole('button', { name: 'Mes siguiente' }).click();
  await expect(page).not.toHaveURL(/mes=/);
  await expect(page.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled();
});

test('una boleta sin importe no suma, y la página lo dice', async ({ page }) => {
  // Carla's receipt of 10/10 in the Mercedes, as if it had come without its amount.
  await page.route('**/rest/v1/trf_driver_fuel_receipts*', async (route) => {
    const response = await route.fetch();
    const rows = (await response.json()) as { id: string; total: number | null }[];
    await route.fulfill({ response, json: rows.map((r) => (r.id === '40000000-0000-4000-8000-000000000004' ? { ...r, total: null } : r)) });
  });
  await openGanancia(page);
  await expect(page.getByText('Una boleta de combustible del mes no tiene importe: no suma hasta completarla en Combustible.')).toBeVisible();
  await expect(row(page, /Cómo se llega a la ganancia de octubre de 2026/, /^− ?Combustible/)).toContainText('$ 26.450');
  await expect(row(page, /Ganancia de cada camión en octubre de 2026/, 'Mercedes Benz Actros')).toContainText('1 boleta sin importe');
});

test('el mes en curso cuenta hasta hoy: lo que tiene fecha posterior todavía no suma', async ({ page }) => {
  // The browser two days before the seed: the receipts of 15/10 are dated after «today», like a receipt with a wrong date.
  await page.clock.setFixedTime(new Date('2026-10-13T15:00:00Z'));
  await openGanancia(page);
  // Diego's receipt of the 13th and Carla's of the 10th; not Ana's nor Bruno's of the 15th.
  const fuel = row(page, /Cómo se llega a la ganancia de octubre de 2026/, /^− ?Combustible/);
  await expect(fuel).toContainText('$ 23.100');
  await expect(fuel).not.toContainText('US$');
});

test('un viaje lleva a su página', async ({ page }) => {
  await openGanancia(page);
  await row(page, /Ganancia de cada viaje/, 'Orden 24129').getByRole('link').click();
  await expect(page).toHaveURL(/\/viajes\/app:10000000-0000-4000-8000-00000000000d$/);
});

test('si falta leer algo, no muestra una ganancia hecha con una parte', async ({ page }) => {
  await page.route('**/rest/v1/trf_road_events*', (route) => route.fulfill({ status: 500, json: { message: 'Falla de prueba' } }));
  await openGanancia(page);
  const error = page.getByRole('alert').filter({ hasText: 'No se pudo leer todo lo que hace falta para la ganancia' });
  await expect(error).toBeVisible();
  await expect(page.locator('.stat')).toHaveCount(0);
  await page.unroute('**/rest/v1/trf_road_events*');
  await error.getByRole('button', { name: 'Reintentar' }).click();
  await expect(tile(page, 'Ganancia del mes, hasta hoy')).toContainText('−$ 64.625,50');
});

test('sin el catálogo de la flota tampoco muestra una ganancia', async ({ page }) => {
  // Without it, a truck written in an older way would make a row of its own.
  await page.route('**/rest/v1/trf_mobile_catalog*', (route) => route.fulfill({ status: 500, json: { message: 'Falla de prueba' } }));
  await openGanancia(page);
  await expect(page.getByRole('alert').filter({ hasText: 'No se pudo leer todo lo que hace falta para la ganancia' })).toBeVisible();
  await expect(page.locator('.stat')).toHaveCount(0);
});
