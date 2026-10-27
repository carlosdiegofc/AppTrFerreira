// Cobros that save: a collection registered from a client's page, its opening balance corrected (a second one in the
// same currency is not possible), a collection annulled and restored from «Anulados», the collection of a client written
// by hand that is then moved to its client, a save whose answer is cut (the retry does not count it twice) and two tabs
// that correct the same collection. They run in the «edicion» project, after the tests that read the seed.
import { expect, type Page, test } from '@playwright/test';
import { open, prepare, shot, signIn } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

const client = (page: Page, name: string) => page.getByRole('list', { name: 'Clientes' }).getByRole('link', { name: new RegExp(`^${name}`) });
const view = (page: Page, name: string) => page.getByRole('group', { name: 'Vista' }).getByRole('button', { name: new RegExp(`^${name}`) });

async function openCobros(page: Page, email = 'lectura@ejemplo.uy') {
  await signIn(page, email);
  await open(page, 'Gastos y finanzas');
  await page.getByRole('navigation', { name: 'Partes de Gastos y finanzas' }).getByRole('link', { name: 'Cobros' }).click();
  await expect(page).toHaveURL(/\/finanzas\/cobros$/);
}

test('la oficina registra un cobro, corrige el saldo inicial y anula y restaura un cobro', async ({ page }) => {
  await openCobros(page);
  await client(page, 'Molino San José').click();
  const pesos = page.locator('.card', { hasText: 'Cuenta en pesos' });
  await expect(pesos.locator('.card-head')).toContainText('Nos debe $ 38.500');

  await page.getByRole('button', { name: 'Registrar cobro' }).click();
  const pay = page.getByRole('dialog', { name: 'Registrar cobro' });
  await expect(pay.getByLabel('Cliente')).toHaveValue('Molino San José');
  await pay.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(pay).toContainText('Escribí cuánto se cobró.');
  await expect(pay).toContainText('Elegí cómo se cobró.');
  await pay.getByLabel('Importe cobrado').fill('20.000');
  await pay.getByLabel('Forma de cobro').selectOption({ label: 'Transferencia' });
  await pay.getByLabel('Nota').fill('Transferencia Itaú 8812');
  await pay.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(pay).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Cobro registrado.');
  await expect(pesos.locator('.card-head')).toContainText('Nos debe $ 18.500');
  await expect(pesos.locator('tbody tr', { hasText: 'Itaú 8812' })).toContainText('$ -20.000$ 18.500');

  // The opening balance is corrected from its line; a second one in pesos is not possible.
  await pesos.locator('tbody tr', { hasText: 'Saldo inicial' }).getByRole('button', { name: 'Corregir' }).click();
  const opening = page.getByRole('dialog', { name: 'Corregir saldo inicial' });
  await opening.getByLabel('Saldo', { exact: true }).fill('17.500');
  await opening.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(opening).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Saldo inicial corregido.');
  await expect(pesos.locator('.card-head')).toContainText('Nos debe $ 21.000');
  await page.getByRole('button', { name: 'Saldo inicial' }).click();
  const another = page.getByRole('dialog', { name: 'Saldo inicial' });
  await another.getByLabel('Moneda').selectOption('UYU');
  await another.getByLabel('Saldo', { exact: true }).fill('1');
  await another.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(another).toContainText('Este cliente ya tiene un saldo inicial en pesos: corregí el que está.');
  await another.getByRole('button', { name: 'Cancelar' }).click();
  await another.getByRole('button', { name: 'Salir sin guardar' }).click();
  await shot(page, 'cobros-cobro');

  // Annulled, it no longer counts; it comes back from «Anulados».
  await pesos.locator('tbody tr', { hasText: 'Itaú 8812' }).getByRole('button', { name: 'Corregir' }).click();
  const fix = page.getByRole('dialog', { name: 'Corregir cobro' });
  await fix.getByRole('button', { name: 'Anular cobro' }).click();
  await page.getByRole('dialog', { name: '¿Anular este cobro?' }).getByRole('button', { name: 'Anular cobro' }).click();
  await expect(page.getByRole('status')).toContainText('Cobro anulado');
  await expect(pesos.locator('.card-head')).toContainText('Nos debe $ 41.000');
  await expect(pesos.locator('tbody tr', { hasText: 'Itaú 8812' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Cobros', exact: true }).click();
  await view(page, 'Anulados').click();
  const annulled = page.getByRole('list', { name: 'Anulados' }).getByRole('listitem').filter({ hasText: 'Itaú 8812' });
  await annulled.getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.getByRole('status')).toContainText('Cobro restaurado');
  await view(page, 'Clientes').click();
  await expect(client(page, 'Molino San José').locator('.fs-balance')).toHaveText('Nos debe $ 21.000');
});

test('el cobro de un cliente escrito a mano, que después se pasa a su cliente', async ({ page }) => {
  await openCobros(page, 'dueno@ejemplo.uy');
  await page.getByRole('button', { name: 'Registrar cobro' }).click();
  const pay = page.getByRole('dialog', { name: 'Registrar cobro' });
  await pay.getByLabel('Cliente').fill('Sucesores de Pérez');
  await expect(pay).toContainText('Cliente nuevo: su cuenta junta los viajes que tengan este nombre');
  await pay.getByLabel('Importe cobrado').fill('2.000');
  await pay.getByLabel('Forma de cobro').selectOption({ label: 'Efectivo' });
  await pay.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(pay).toBeHidden();
  await expect(client(page, 'Sucesores de Pérez').locator('.fs-balance')).toHaveText('A favor del cliente $ 2.000');

  // It was Navios': written in another way, it goes to its account.
  await view(page, 'Cobros').click();
  await page.getByRole('button', { name: /Cobro del 15\/10\/2026 de Sucesores de Pérez/ }).click();
  const fix = page.getByRole('dialog', { name: 'Corregir cobro' });
  await fix.getByLabel('Cliente').fill('NAVIOS');
  await expect(fix).not.toContainText('Cliente nuevo');
  await fix.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Cobro corregido.');
  await view(page, 'Clientes').click();
  await expect(client(page, 'Sucesores de Pérez')).toHaveCount(0);
  await expect(client(page, 'Navios').locator('.fs-balance')).toHaveText('A favor del cliente $ 2.000');
});

test('si se pierde la respuesta al registrar un cobro, el reintento no lo cuenta dos veces', async ({ page }) => {
  await openCobros(page, 'dueno@ejemplo.uy');
  await client(page, 'Cooperativa Agraria').click();
  const dollars = page.locator('.card', { hasText: 'Cuenta en dólares' });
  await expect(dollars.locator('.card-head')).toContainText('Nos debe US$ 250,50');
  // The first save reaches the database, but its answer never comes back.
  let posts = 0;
  await page.route('**/rest/v1/trf_client_movements*', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    posts++;
    if (posts > 1) return route.fallback();
    await route.fetch();
    return route.abort('connectionfailed');
  });

  await page.getByRole('button', { name: 'Registrar cobro' }).click();
  const pay = page.getByRole('dialog', { name: 'Registrar cobro' });
  await expect(pay.getByLabel('Moneda')).toHaveValue('USD');
  await pay.getByLabel('Importe cobrado').fill('250,50');
  await pay.getByLabel('Forma de cobro').selectOption({ label: 'Cheque' });
  await pay.getByLabel('Nota').fill('Cheque 3301');
  await pay.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(pay.getByRole('alert')).toContainText('Sin conexión con el servidor');
  await pay.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(pay).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Cobro registrado.');
  expect(posts).toBe(2);
  await expect(dollars.locator('tbody tr', { hasText: 'Cheque 3301' })).toHaveCount(1);
  await expect(dollars.locator('.card-head')).toContainText('Al día en dólares');
});

test('si dos personas corrigen el mismo cobro a la vez, la segunda no pisa a la primera', async ({ browser }) => {
  const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
  for (const p of [a, b]) {
    await prepare(p);
    await openCobros(p);
    await client(p, 'Cooperativa Agraria').click();
    await p.locator('.card', { hasText: 'Cuenta en dólares' }).locator('tbody tr', { hasText: 'Cobro · Transferencia' }).getByRole('button', { name: 'Corregir' }).click();
  }
  const formA = a.getByRole('dialog', { name: 'Corregir cobro' });
  const formB = b.getByRole('dialog', { name: 'Corregir cobro' });
  await formA.getByLabel('Importe cobrado').fill('900');
  await formA.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(a.getByRole('status')).toContainText('Cobro corregido.');

  await formB.getByLabel('Nota').fill('Otra nota');
  await formB.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(b.getByRole('alert')).toContainText('Otra persona lo cambió');
  // B reads the account again: A's correction, and not B's.
  const dollars = b.locator('.card', { hasText: 'Cuenta en dólares' });
  await expect(dollars.locator('tbody tr', { hasText: 'Cobro · Transferencia' })).toContainText('US$ -900');
  await expect(dollars.locator('tbody tr', { hasText: 'Otra nota' })).toHaveCount(0);
  await Promise.all([a.close(), b.close()]);
});
