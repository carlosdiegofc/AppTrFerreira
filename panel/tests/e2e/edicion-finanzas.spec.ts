// Saving expenses in a real browser: a truck's expense with the photo of its invoice (a real one, drawn by the browser)
// that is corrected, annulled and restored; a kind written by hand with a PDF (a file that is not a PDF is refused); the
// cost of a service done, one per service even from two tabs; a trip's expense from its page; a save whose answer is
// cut; and two people correcting the same expense. Saving changes the test data, so this file runs after the read-only
// tests (project "edicion" in playwright.config.ts), in this order.
import { expect, type Page, test } from '@playwright/test';
import { open, prepare, shot, signIn, stat } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

const filter = (page: Page, label: string) => page.locator('.filters').getByLabel(label);
const expenses = (page: Page) => page.getByRole('list', { name: 'Gastos' }).getByRole('listitem');
const view = (page: Page, name: string) => page.getByRole('group', { name: 'Vista' }).getByRole('button', { name: new RegExp(`^${name}`) });
const save = (form: ReturnType<Page['getByRole']>) => form.getByRole('button', { name: 'Guardar', exact: true }).click();
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

/** A real JPEG drawn by the browser, like the photo of an invoice. */
async function invoicePhoto(page: Page): Promise<Buffer> {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 700;
    canvas.height = 900;
    const g = canvas.getContext('2d') as CanvasRenderingContext2D;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 700, 900);
    g.fillStyle = '#123';
    g.font = '40px sans-serif';
    g.fillText('Factura · Gomería Central', 40, 100);
    g.fillText('Total $ 12.500', 40, 180);
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1] as string;
  });
  return Buffer.from(data, 'base64');
}

/** The invoices the page uploads. */
function uploads(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (r.method() === 'POST' && url.pathname.includes('/storage/v1/object/trf-expense-files/')) seen.push(decodeURIComponent(url.pathname.split('/trf-expense-files/')[1] ?? ''));
  });
  return seen;
}

test('un gasto de un camión con la foto de su factura, que se corrige, se anula y se restaura', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Gastos y finanzas');
  const seen = uploads(page);
  await page.getByRole('button', { name: 'Nuevo gasto' }).click();
  const form = page.getByRole('dialog', { name: 'Nuevo gasto' });
  await expect(form.getByLabel('Fecha')).toHaveValue('2026-10-15');
  await save(form);
  await expect(form.getByRole('alert')).toContainText('Revisá los campos marcados.');
  await expect(form).toContainText('Elegí el tipo de gasto.');
  await expect(form).toContainText('Escribí el importe.');
  await form.getByLabel('Tipo de gasto').selectOption({ label: 'Cubiertas' });
  await form.getByLabel('Importe').fill('12.500');
  await expect(form).toContainText('Se guarda: 12.500');
  await form.getByRole('radio', { name: 'Un camión' }).click();
  await save(form);
  await expect(form).toContainText('Elegí el camión.');
  await form.getByLabel('Camión').selectOption({ label: 'Iveco Stralis · MNO7890' });
  await form.getByLabel('Proveedor').fill('Gomería Central');
  await form.getByLabel('Factura del gasto').setInputFiles({ name: 'factura.jpg', mimeType: 'image/jpeg', buffer: await invoicePhoto(page) });
  await expect(form).toContainText('Foto lista');
  await shot(page, 'gasto-nuevo');
  await save(form);
  await expect(form).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Gasto anotado: Cubiertas por $ 12.500.');
  // The invoice went to the folder of the expense, once.
  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);

  const row = expenses(page).filter({ hasText: 'Gomería Central' });
  await expect(row).toContainText('Camión: Iveco Stralis · MNO7890 · Gomería Central');
  await expect(row).toContainText('$ 12.500');
  await expect(stat(page, 'Gastado en el período')).toContainText('$ 33.620');
  await row.getByRole('button', { name: 'Ver factura' }).click();
  await expect(page.getByRole('dialog', { name: 'Factura · Cubiertas del 15/10/2026' }).locator('img')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar la foto' }).click();

  // A correction keeps the invoice.
  await row.getByRole('button', { name: /^Cubiertas del 15\/10\/2026/ }).click();
  const fix = page.getByRole('dialog', { name: 'Corregir gasto' });
  await expect(fix.getByLabel('Importe')).toHaveValue('12500');
  await expect(fix.getByLabel('Camión')).toHaveValue('plate:mno7890');
  await fix.getByLabel('Importe').fill('13.000');
  await save(fix);
  await expect(page.getByRole('status')).toContainText('Gasto corregido.');
  await expect(row).toContainText('$ 13.000');
  await expect(row.getByRole('button', { name: 'Ver factura' })).toBeVisible();
  expect(seen).toHaveLength(1);

  // Annulled: it stays, apart, and counts no more; restored, it counts again.
  await row.getByRole('button', { name: /^Cubiertas del 15\/10\/2026/ }).click();
  await fix.getByRole('button', { name: 'Anular gasto' }).click();
  await page.getByRole('dialog', { name: '¿Anular este gasto?' }).getByRole('button', { name: 'Anular gasto' }).click();
  await expect(page.getByRole('status')).toContainText('Gasto anulado: ya no cuenta en los totales.');
  await expect(row).toHaveCount(0);
  await expect(stat(page, 'Gastado en el período')).toContainText('$ 21.120');
  await view(page, 'Anulados').click();
  await expenses(page).filter({ hasText: 'Gomería Central' }).getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.getByRole('status')).toContainText('Gasto restaurado: vuelve a contar en los totales.');
  await view(page, 'Gastos').click();
  await expect(row).toContainText('$ 13.000');
  await expect(stat(page, 'Gastado en el período')).toContainText('$ 34.120');
});

test('un tipo escrito a mano, de la empresa, con un PDF; un archivo que no es PDF no se acepta', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await open(page, 'Gastos y finanzas');
  await page.getByRole('button', { name: 'Nuevo gasto' }).click();
  const form = page.getByRole('dialog', { name: 'Nuevo gasto' });
  await form.getByLabel('Tipo de gasto').selectOption({ label: 'Otro (escribilo)' });
  await form.getByLabel('Otro tipo').fill('  Balanza  ');
  await form.getByLabel('Importe').fill('350');
  await form.getByLabel('Forma de pago').selectOption({ label: 'Efectivo' });
  await form.getByLabel('Factura del gasto').setInputFiles({ name: 'ticket.pdf', mimeType: 'application/pdf', buffer: Buffer.from('hola') });
  await expect(form).toContainText('Ese archivo no es un PDF que se pueda abrir.');
  await form.getByLabel('Factura del gasto').setInputFiles({ name: 'ticket.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(form).toContainText('PDF listo: ticket.pdf');
  await save(form);
  await expect(page.getByRole('status')).toContainText('Gasto anotado: Balanza por $ 350.');
  const row = expenses(page).filter({ hasText: 'Balanza' });
  await expect(row).toContainText('La empresa');
  await expect(row).toContainText('Efectivo');
  await expect(row.getByRole('button', { name: 'Ver PDF' })).toBeVisible();
  // The kind written by hand is offered in the filter.
  await filter(page, 'Tipo').selectOption({ label: 'Balanza' });
  await expect(expenses(page)).toHaveCount(1);
});

test('el costo de un service hecho se anota desde Mantenimiento, uno solo aunque lo anoten dos personas', async ({ browser }) => {
  const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
  for (const p of [a, b]) {
    await prepare(p);
    await signIn(p, 'dueno@ejemplo.uy');
    await open(p, 'Mantenimiento');
    await view(p, 'Hechos').click();
    await p.locator('.service-list > li', { hasText: 'Revisión general' }).getByRole('button', { name: 'Anotar el costo' }).click();
  }
  const formA = a.getByRole('dialog', { name: 'Costo del service' });
  const formB = b.getByRole('dialog', { name: 'Costo del service' });
  // Of its truck, on the day it was done, as a service.
  await expect(formA).toContainText('Scania R450 · DEF5678 · es el costo de un service hecho: va a su camión.');
  await expect(formA.getByLabel('Fecha')).toHaveValue('2026-09-15');
  await expect(formA.getByLabel('Tipo de gasto')).toHaveValue('Service');
  await expect(formA.getByLabel('Notas')).toHaveValue('Revisión general');
  await expect(formA.getByRole('radio')).toHaveCount(0);
  await formA.getByLabel('Importe').fill('32.000');
  await formA.getByLabel('Proveedor').fill('Scania Montevideo');
  await shot(a, 'costo-service');
  await save(formA);
  await expect(a.getByRole('status')).toContainText('Costo del service anotado: Service por $ 32.000.');
  const costA = a.locator('.service-list > li', { hasText: 'Revisión general' }).locator('.sv-cost');
  await expect(costA).toContainText('Costo$ 32.000');

  // The second one, noted with the first already saved, is refused.
  await formB.getByLabel('Importe').fill('30.000');
  await save(formB);
  await expect(formB.getByRole('alert')).toContainText('Ese service ya tiene su costo anotado: corregí ese en vez de anotar otro.');
  await formB.getByRole('button', { name: 'Cancelar' }).click();
  await formB.getByRole('button', { name: 'Salir sin guardar' }).click();
  await b.getByRole('button', { name: 'Actualizar' }).click();
  await expect(b.locator('.service-list > li', { hasText: 'Revisión general' }).locator('.sv-cost')).toContainText('Costo$ 32.000');

  // Corrected from Mantenimiento: it stays of its service and its truck.
  await costA.getByRole('button', { name: '$ 32.000' }).click();
  const fix = a.getByRole('dialog', { name: 'Corregir gasto' });
  await expect(fix).toContainText('Scania R450 · DEF5678 · es el costo de un service hecho: va a su camión.');
  await fix.getByLabel('Importe').fill('31.500');
  await save(fix);
  await expect(a.getByRole('status')).toContainText('Gasto corregido.');
  await expect(costA).toContainText('Costo$ 31.500');

  // In Gastos y finanzas, last month.
  await a.goto('./#/finanzas?periodo=mes-anterior');
  const row = a.getByRole('list', { name: 'Gastos' }).getByRole('listitem').filter({ hasText: 'Scania Montevideo' });
  await expect(row).toContainText('Camión: Scania R450 · DEF5678');
  await expect(row).toContainText('$ 31.500');
  await expect(row).toContainText('De un service');
  await Promise.all([a.close(), b.close()]);
});

test('un gasto del viaje desde su página', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await page.goto('./#/viajes/web:20000000-0000-4000-8000-000000000001');
  const card = page.locator('.card', { has: page.getByRole('heading', { name: /^Gastos del viaje/ }) });
  await expect(card).toContainText('No hay gastos anotados en este viaje');
  await card.getByRole('button', { name: 'Anotar un gasto' }).click();
  const form = page.getByRole('dialog', { name: 'Nuevo gasto' });
  // Of this trip, on the day it arrived.
  await expect(form).toContainText('Orden de carga 24101 · Young → Nueva Palmira');
  await expect(form.getByRole('radio')).toHaveCount(0);
  await expect(form.getByLabel('Fecha')).toHaveValue('2026-10-12');
  await form.getByLabel('Tipo de gasto').selectOption({ label: 'Peajes en efectivo' });
  await form.getByLabel('Importe').fill('1.040');
  await form.getByLabel('Forma de pago').selectOption({ label: 'Efectivo' });
  await save(form);
  await expect(page.getByRole('status')).toContainText('Gasto anotado: Peajes en efectivo por $ 1.040.');
  await expect(card.getByRole('heading')).toHaveText('Gastos del viaje (1)');
  await expect(card).toContainText('12/10/2026 · $ 1.040 · sin factura');

  // Corrected from the trip: it stays of the trip.
  await card.getByRole('button', { name: 'Corregir peajes en efectivo del 12/10/2026' }).click();
  const fix = page.getByRole('dialog', { name: 'Corregir gasto' });
  await expect(fix).toContainText('Orden de carga 24101 · Young → Nueva Palmira');
  await fix.getByLabel('Proveedor').fill('Peaje Cufré');
  await save(fix);
  await expect(page.getByRole('status')).toContainText('Gasto corregido.');
  await expect(card).toContainText('12/10/2026 · Peaje Cufré · $ 1.040 · sin factura');

  // In Gastos y finanzas, with the trip.
  await card.getByRole('link', { name: 'Ver en Gastos y finanzas' }).click();
  await expect(expenses(page).locator('.ex-main strong')).toHaveText(['Peajes en efectivo']);
  await expect(expenses(page).nth(0)).toContainText('Viaje: Orden de carga 24101 · Young → Nueva Palmira · Peaje Cufré');
});

test('si se corta la respuesta al anotar un gasto, el reintento lo da por anotado una sola vez', async ({ page }) => {
  let cut = true;
  await page.route('**/rest/v1/trf_expenses*', async (route) => {
    if (route.request().method() !== 'POST' || !cut) return route.fallback();
    cut = false;
    await route.fetch();
    await route.abort('failed');
  });
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Gastos y finanzas');
  await page.getByRole('button', { name: 'Nuevo gasto' }).click();
  const form = page.getByRole('dialog', { name: 'Nuevo gasto' });
  await form.getByLabel('Tipo de gasto').selectOption({ label: 'Seguro' });
  await form.getByLabel('Importe').fill('480');
  await form.getByLabel('Proveedor').fill('Porto Seguro');
  await save(form);
  await expect(form.getByRole('alert')).toContainText('Sin conexión con el servidor');
  await save(form);
  await expect(form).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Gasto anotado: Seguro por $ 480.');
  await expect(expenses(page).filter({ hasText: 'Porto Seguro' })).toHaveCount(1);
});

test('si dos personas corrigen el mismo gasto a la vez, la segunda no pisa a la primera', async ({ browser }) => {
  const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
  for (const p of [a, b]) {
    await prepare(p);
    await signIn(p, 'dueno@ejemplo.uy');
    await open(p, 'Gastos y finanzas');
    await p.getByRole('list', { name: 'Gastos' }).getByRole('button', { name: /^Viáticos del 10\/10\/2026/ }).click();
  }
  const formA = a.getByRole('dialog', { name: 'Corregir gasto' });
  const formB = b.getByRole('dialog', { name: 'Corregir gasto' });
  await formA.getByLabel('Importe').fill('1.500');
  await save(formA);
  await expect(a.getByRole('status')).toContainText('Gasto corregido.');

  await formB.getByLabel('Importe').fill('1.800');
  await save(formB);
  await expect(b.getByRole('alert')).toContainText('Otra persona cambió ese gasto mientras lo tenías abierto');
  // B sees A's amount, not its own.
  await expect(b.getByRole('list', { name: 'Gastos' }).getByRole('listitem').filter({ hasText: 'Viáticos' })).toContainText('$ 1.500');
  await Promise.all([a.close(), b.close()]);
});
