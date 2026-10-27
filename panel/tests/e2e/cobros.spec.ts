// Cobros, in Gastos y finanzas: each client's account with what its trips billed, what it paid and what it owes, pesos
// and dollars apart; a client's statement from its opening balance; the collections of a period and the annulled ones;
// and the search of the bar that leads to a client. Read only: the seed's data.
import { expect, type Page, test } from '@playwright/test';
import { open, prepare, shot, signIn, stat } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

const clients = (page: Page) => page.getByRole('list', { name: 'Clientes' }).getByRole('listitem');
const client = (page: Page, name: string) => page.getByRole('list', { name: 'Clientes' }).getByRole('link', { name: new RegExp(`^${name}`) });
const view = (page: Page, name: string) => page.getByRole('group', { name: 'Vista' }).getByRole('button', { name: new RegExp(`^${name}`) });
const collections = (page: Page, name = 'Cobros') => page.getByRole('list', { name }).getByRole('listitem');

async function openCobros(page: Page, email = 'dueno@ejemplo.uy') {
  await signIn(page, email);
  await open(page, 'Gastos y finanzas');
  await page.getByRole('navigation', { name: 'Partes de Gastos y finanzas' }).getByRole('link', { name: 'Cobros' }).click();
  await expect(page).toHaveURL(/\/finanzas\/cobros$/);
}

test('la cuenta de cada cliente, con lo facturado, lo cobrado y lo que debe', async ({ page }) => {
  await openCobros(page);
  await expect(page.getByRole('heading', { name: 'Gastos y finanzas', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Partes de Gastos y finanzas' }).getByRole('link', { name: 'Cobros' })).toHaveAttribute('aria-current', 'page');

  // October: pesos and dollars apart. Navios' trip is on the road, still without its amount: it is not missing yet.
  await expect(stat(page, 'A cobrar')).toContainText('$ 38.500');
  await expect(stat(page, 'A cobrar')).toContainText('US$ 250,50');
  await expect(stat(page, 'A cobrar')).toContainText('Lo que deben 2 clientes');
  await expect(stat(page, 'Facturado en el período')).toContainText('$ 38.500');
  await expect(stat(page, 'Facturado en el período')).toContainText('US$ 1.250,50');
  await expect(stat(page, 'Facturado en el período')).toContainText('2 viajes');
  await expect(stat(page, 'Cobrado en el período')).toContainText('$ 15.000');
  await expect(stat(page, 'Cobrado en el período')).toContainText('US$ 1.000');
  await expect(stat(page, 'Cobrado en el período')).toContainText('2 cobros');
  await expect(stat(page, 'Viajes sin importe').locator('.stat-value')).toHaveText('0');

  // Most recent activity first; the client of the app's list without trips last.
  await expect(clients(page).locator('.fs-name strong')).toHaveText(['Molino San José', 'Navios', 'Cooperativa Agraria', 'Cliente Uno']);
  await expect(clients(page).nth(0).locator('.fs-balance')).toHaveText('Nos debe $ 38.500');
  await expect(clients(page).nth(0)).toContainText('Escrito en los viajes · último viaje el 15/10/2026');
  await expect(clients(page).nth(0).locator('.fs-period')).toContainText('1 viaje · cobrado $ 15.000');
  await expect(clients(page).nth(1).locator('.fs-balance')).toHaveText('Al día en pesos');
  await expect(clients(page).nth(1).locator('.fs-period')).toContainText('1 viaje en curso');
  await expect(clients(page).nth(2).locator('.fs-balance')).toHaveText('Nos debe US$ 250,50');
  await expect(clients(page).nth(3)).toContainText('De la lista de la app · sin viajes');
  await expect(clients(page).nth(3).locator('.fs-balance')).toHaveText('Sin movimientos todavía');
  await expect(view(page, 'Clientes')).toContainText('4');
  await shot(page, 'cobros');

  // A client written in any way.
  await page.locator('.filters').getByLabel('Buscar').fill('COOPERATIVA agraria');
  await expect(page).toHaveURL(/buscar=COOPERATIVA/);
  await expect(clients(page)).toHaveCount(1);
  await expect(clients(page).first()).toContainText('Cooperativa Agraria');
});

test('el estado de cuenta de un cliente, desde su saldo inicial', async ({ page }) => {
  await openCobros(page, 'lectura@ejemplo.uy');
  await client(page, 'Molino San José').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Molino San José');
  await expect(page.locator('.page-sub')).toHaveText('Escrito en los viajes · último viaje el 15/10/2026 · 1 viaje');
  const pesos = page.locator('.card', { hasText: 'Cuenta en pesos' });
  await expect(pesos.locator('.card-head')).toContainText('Nos debe $ 38.500');
  await expect(pesos.locator('.facts')).toContainText('$ 15.000 al 05/10/2026');
  await expect(pesos.locator('.facts')).toContainText('Facturado$ 38.500');
  await expect(pesos.locator('.facts')).toContainText('Cobrado$ 15.000');
  const lines = pesos.locator('tbody tr');
  await expect(lines).toHaveCount(3);
  await expect(lines.nth(0)).toContainText('05/10/2026Saldo inicial$ 15.000$ 15.000');
  await expect(lines.nth(1)).toContainText('13/10/2026Cobro · Cheque · Cheque BROU 4521$ -15.000$ 0');
  await expect(lines.nth(2)).toContainText('15/10/2026Viaje · orden 24129 · Paysandú → Salto · Trigo · Ford Cargo 1722 · JKL3456$ 38.500$ 38.500');
  await expect(page.locator('.card', { hasText: 'Cuenta en dólares' })).toHaveCount(0);
  await shot(page, 'cobros-cliente');

  // Each trip leads to its page.
  await lines.nth(2).getByRole('link', { name: 'Ver viaje' }).click();
  await expect(page).toHaveURL(/\/viajes\/app:10000000-0000-4000-8000-00000000000d$/);
  // And the trip's client leads back to its account.
  await expect(page.locator('.order-facts').getByRole('link', { name: 'Molino San José' })).toHaveAttribute('href', /\/finanzas\/cobros\/name%3Amolino%20san%20jose$/);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Molino San José');
  // Back to the list as it was.
  await page.getByRole('button', { name: 'Cobros', exact: true }).click();
  await expect(page).toHaveURL(/\/finanzas\/cobros$/);
});

test('un viaje en curso todavía sin importe no suma ni falta, y lo anulado no cuenta', async ({ page }) => {
  await openCobros(page);
  await client(page, 'Navios').click();
  const pesos = page.locator('.card', { hasText: 'Cuenta en pesos' });
  await expect(pesos.locator('.card-head')).toContainText('Al día en pesos');
  await expect(pesos).toContainText('Un viaje sigue en curso, todavía sin importe.');
  const line = pesos.locator('tbody tr');
  await expect(line).toHaveCount(1);
  await expect(line).toContainText('Viaje · a Puerto de Montevideo · Soja · Volvo FH 460 · ABC1234');
  await expect(line).toContainText('En curso');
  await expect(line).toContainText('Sin importe');
  await expect(line.getByRole('link', { name: 'Completar' })).toHaveAttribute('href', /\/viajes\/app:10000000-0000-4000-8000-00000000000a$/);
});

test('los cobros del período, la búsqueda y los anulados aparte', async ({ page }) => {
  await openCobros(page, 'lectura@ejemplo.uy');
  await view(page, 'Cobros').click();
  await expect(page).toHaveURL(/vista=cobros/);
  await expect(collections(page).locator('.ex-main strong')).toHaveText(['Cooperativa Agraria', 'Molino San José']);
  await expect(collections(page).nth(0)).toContainText('14/10/2026');
  await expect(collections(page).nth(0)).toContainText('Transferencia');
  await expect(collections(page).nth(0)).toContainText('US$ 1.000');
  await expect(collections(page).nth(1)).toContainText('Cheque BROU 4521');
  await expect(page.locator('.list-total')).toHaveText('2 cobros · $ 15.000 · US$ 1.000');
  await page.locator('.filters').getByLabel('Buscar').fill('brou');
  await expect(collections(page)).toHaveCount(1);
  await expect(collections(page).first()).toContainText('Molino San José');
  await page.locator('.filters').getByLabel('Buscar').fill('');

  // The annulled transfer of Navios: apart, and it does not count.
  await view(page, 'Anulados').click();
  await expect(collections(page, 'Anulados')).toHaveCount(1);
  await expect(collections(page, 'Anulados').first()).toContainText('Navios');
  await expect(collections(page, 'Anulados').first()).toContainText('Era de otro cliente.');
  await expect(collections(page, 'Anulados').first()).toContainText('Anulado');
  await expect(collections(page, 'Anulados').first().getByRole('button', { name: 'Restaurar' })).toBeVisible();
  await expect(page.locator('.list-total')).toHaveText('1 anulado · $ 5.000 · no cuentan en los saldos');
  await shot(page, 'cobros-anulados');

  // Last month nothing was billed nor collected; what the clients owe does not change with the period.
  await page.locator('.filters').getByLabel('Período').selectOption({ label: 'Mes anterior' });
  await expect(stat(page, 'Facturado en el período')).toContainText('$ 0');
  await expect(stat(page, 'Cobrado en el período')).toContainText('0 cobros');
  await expect(stat(page, 'A cobrar')).toContainText('$ 38.500');
  await expect(page.getByText('No hay cobros anulados en este período')).toBeVisible();
});

test('el buscador de arriba lleva a los clientes de Cobros', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await expect(page.locator('main#contenido')).toBeVisible();
  if (test.info().project.name === 'celular') await page.getByRole('button', { name: 'Abrir la búsqueda' }).click();
  const box = page.getByRole('combobox', { name: 'Búsqueda en el panel' });
  await box.click();
  await box.fill('molino');
  await page.getByRole('listbox', { name: 'Resultados' }).getByRole('option', { name: /«molino» en Cobros/ }).click();
  await expect(page).toHaveURL(/\/finanzas\/cobros\?buscar=molino$/);
  await expect(clients(page)).toHaveCount(1);
  await expect(clients(page).first()).toContainText('Nos debe $ 38.500');
});

test('si no se pueden leer los cobros, lo dice y se puede reintentar', async ({ page }) => {
  let fail = true;
  await page.route('**/rest/v1/trf_client_movements*', (route) => (fail ? route.fulfill({ status: 500, json: { message: 'caída de prueba' } }) : route.fallback()));
  await openCobros(page);
  await expect(page.getByRole('alert')).toContainText('No se pudieron leer las cuentas de los clientes.');
  await expect(page.getByRole('button', { name: 'Registrar cobro' })).toBeDisabled();
  fail = false;
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(clients(page)).toHaveCount(4);
});
