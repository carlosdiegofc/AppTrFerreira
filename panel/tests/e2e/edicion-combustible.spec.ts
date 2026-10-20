// Saving fuel in a real browser: a panel account loads a receipt with its photo, the office corrects one without touching
// what was declared, sends it to the trash and back, registers a payment, corrects an opening balance, and two people
// correct the same receipt at once. Saving changes the test data, so this file runs after the read-only tests (project
// "edicion" in playwright.config.ts), in this order.
import { expect, type Page, test } from '@playwright/test';
import { open, prepare, shot, signIn } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

const station = (page: Page, name: string) => page.locator('.fuel-station', { hasText: name });
const receipts = (page: Page) => page.locator('.fuel-receipts > li');
const chip = (page: Page, name: string) => page.locator('.chip', { hasText: name });

/** A real JPEG drawn by the browser, like the photo of a receipt. */
async function receiptPhoto(page: Page, total = 'Total $ 5.500'): Promise<Buffer> {
  const data = await page.evaluate((line) => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 900;
    const g = canvas.getContext('2d') as CanvasRenderingContext2D;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 600, 900);
    g.fillStyle = '#222';
    g.font = '40px sans-serif';
    g.fillText('ESTACIÓN EL TALA', 60, 120);
    g.fillText(line, 60, 220);
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1] as string;
  }, total);
  return Buffer.from(data, 'base64');
}

test('una cuenta del panel carga una boleta con foto, a su nombre y sin viaje', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await open(page, 'Combustible');
  await page.getByRole('button', { name: 'Nueva boleta' }).click();
  const form = page.getByRole('dialog', { name: 'Nueva boleta' });
  await expect(form.getByLabel('Fecha de la boleta')).toHaveValue('2026-10-15');
  await expect(form).toContainText('Queda a tu nombre (Socio Lectura) y sin viaje');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Revisá los campos marcados.');
  await expect(form).toContainText('Elegí la estación de la lista o escribí su nombre.');
  await expect(form).toContainText('Escribí el importe de la boleta.');

  await form.getByLabel('Foto de la boleta').setInputFiles({ name: 'boleta.jpg', mimeType: 'image/jpeg', buffer: await receiptPhoto(page) });
  // The preview really shows (the panel's Content-Security-Policy allows it).
  const preview = form.getByRole('img', { name: 'Foto elegida de la boleta' });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(form).toContainText('Lista:');
  // Written another way, it is the same station as the receipts already there.
  await form.getByLabel('Estación', { exact: true }).selectOption({ label: 'Otra (escribila)' });
  await form.getByLabel('Nombre de la estación').fill('estacion el tala');
  await form.getByLabel('Camión').fill('Volvo FH 460 · ABC1234');
  await form.getByLabel('Litros').fill('100');
  await form.getByLabel('Importe').fill('5.500');
  await expect(form).toContainText('Se guarda: 5.500');
  await shot(page, 'combustible-nueva-boleta');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect(form).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Boleta cargada.');
  await expect(station(page, 'Estación El Tala').locator('.fs-balance')).toHaveText('Se le debe $ 12.100');
  await expect(station(page, 'Estación El Tala').locator('.fs-period')).toContainText('2 boletas · 220 L en el período');

  await chip(page, 'Boletas').click();
  await page.getByLabel('Buscar').fill('socio');
  await expect(receipts(page)).toHaveCount(1);
  await expect(receipts(page).first()).toContainText('Sin viaje');
  await expect(receipts(page).first()).toContainText('$ 5.500');
  await receipts(page).first().getByRole('button', { name: 'Ver boleta' }).click();
  await expect(page.getByRole('dialog', { name: /Boleta de Estación El Tala/ }).locator('img')).toBeVisible();
});

test('la oficina corrige una boleta sin tocar lo declarado, la manda a la papelera y la restaura', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Combustible');
  await chip(page, 'Boletas').click();
  await page.getByLabel('Buscar').fill('carla');
  await expect(receipts(page)).toHaveCount(1);
  await receipts(page).first().getByRole('button', { name: /Boleta del 10\/10\/2026/ }).click();
  const form = page.getByRole('dialog', { name: 'Corregir boleta' });
  await expect(form).toContainText('Se cargó sin viaje · Carla Méndez');
  await expect(form).toContainText('Importe: 6.600');
  await expect(form.getByLabel('Nombre de la estación')).toHaveValue('Estación El Tala');
  // Another month than the day it arrived: the app and the current panel go on counting it on that day.
  await form.getByLabel('Fecha de la boleta').fill('2026-09-30');
  await expect(form).toContainText('El resumen del mes de la app y el panel actual la cuentan el 10/10/2026, el día en que llegó.');
  await form.getByLabel('Fecha de la boleta').fill('2026-10-10');
  await expect(form).not.toContainText('el día en que llegó');
  await form.getByLabel('Importe').fill('7.000');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Boleta corregida.');
  await expect(receipts(page).first()).toContainText('$ 7.000');
  await expect(receipts(page).first()).toContainText('Corregida');

  // What the driver declared is still there, for the next correction.
  await receipts(page).first().getByRole('button', { name: /Boleta del 10\/10\/2026/ }).click();
  await expect(form).toContainText('Importe: 6.600');
  await form.getByRole('button', { name: 'Mandar a la papelera' }).click();
  const confirm = page.getByRole('dialog', { name: '¿Mandar esta boleta a la papelera?' });
  await confirm.getByRole('button', { name: 'Mandar a la papelera' }).click();
  await expect(page.getByRole('status')).toContainText('La boleta está en la papelera');
  await expect(receipts(page)).toHaveCount(0);

  await chip(page, 'Papelera').click();
  await expect(receipts(page)).toHaveCount(1);
  await receipts(page).first().getByRole('button', { name: 'Restaurar' }).click();
  await expect(page.getByRole('status')).toContainText('Boleta restaurada');
  await chip(page, 'Boletas').click();
  await expect(receipts(page)).toHaveCount(1);
  await expect(receipts(page).first()).toContainText('$ 7.000');
});

test('la oficina registra un pago, corrige el saldo inicial y anula el pago', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await open(page, 'Combustible');
  await station(page, 'Ancap Ruta 5 km 32').click();
  const pesos = page.locator('.card', { hasText: 'Cuenta en pesos' });
  await expect(pesos.locator('.card-head')).toContainText('Se le debe $ 31.450');

  await page.getByRole('button', { name: 'Registrar pago' }).click();
  const pay = page.getByRole('dialog', { name: 'Registrar pago' });
  await expect(pay.getByLabel('Estación')).toHaveValue('id:est-ruta5');
  await pay.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(pay).toContainText('Escribí cuánto se pagó.');
  await expect(pay).toContainText('Elegí cómo se pagó.');
  await pay.getByLabel('Importe pagado').fill('10.000');
  await pay.getByLabel('Forma de pago').selectOption({ label: 'Efectivo' });
  await pay.getByLabel('Nota').fill('Recibo 55');
  await pay.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(pay).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Pago registrado.');
  await expect(pesos.locator('.card-head')).toContainText('Se le debe $ 21.450');
  await expect(pesos.locator('tbody tr', { hasText: 'Recibo 55' })).toContainText('$ -10.000$ 21.450');

  // The opening balance is corrected from its line; a second one in pesos is not possible.
  await pesos.locator('tbody tr', { hasText: 'Saldo inicial' }).getByRole('button', { name: 'Corregir' }).click();
  const opening = page.getByRole('dialog', { name: 'Corregir saldo inicial' });
  await opening.getByLabel('Saldo', { exact: true }).fill('30.000');
  await opening.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(opening).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Saldo inicial corregido.');
  await expect(pesos.locator('.card-head')).toContainText('Se le debe $ 26.450');
  await page.getByRole('button', { name: 'Saldo inicial' }).click();
  const another = page.getByRole('dialog', { name: 'Saldo inicial' });
  await another.getByLabel('Moneda').selectOption('UYU');
  await another.getByLabel('Saldo', { exact: true }).fill('1');
  await another.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(another).toContainText('Esta estación ya tiene un saldo inicial en pesos: corregí el que está.');
  await another.getByRole('button', { name: 'Cancelar' }).click();
  await another.getByRole('button', { name: 'Salir sin guardar' }).click();
  await shot(page, 'combustible-pago');

  await pesos.locator('tbody tr', { hasText: 'Recibo 55' }).getByRole('button', { name: 'Corregir' }).click();
  const fix = page.getByRole('dialog', { name: 'Corregir pago' });
  await fix.getByRole('button', { name: 'Anular pago' }).click();
  await page.getByRole('dialog', { name: '¿Anular este pago?' }).getByRole('button', { name: 'Anular pago' }).click();
  await expect(page.getByRole('status')).toContainText('Pago anulado');
  await expect(pesos.locator('.card-head')).toContainText('Se le debe $ 36.450');
  await expect(pesos.locator('tbody tr', { hasText: 'Recibo 55' })).toHaveCount(0);
});

test('si dos personas corrigen la misma boleta a la vez, la segunda no pisa a la primera', async ({ browser }) => {
  const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
  for (const p of [a, b]) {
    await prepare(p);
    await signIn(p, 'dueno@ejemplo.uy');
    await open(p, 'Combustible');
    await chip(p, 'Boletas').click();
    await p.getByLabel('Buscar').fill('bruno');
    await receipts(p).first().getByRole('button', { name: /Boleta del 15\/10\/2026/ }).click();
  }
  const formA = a.getByRole('dialog', { name: 'Corregir boleta' });
  const formB = b.getByRole('dialog', { name: 'Corregir boleta' });
  await formA.getByLabel('Litros').fill('255');
  await formA.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(a.getByRole('status')).toContainText('Boleta corregida.');

  await formB.getByLabel('Importe').fill('999');
  await formB.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(b.getByRole('alert')).toContainText('Otra persona cambió esa boleta');
  // B reads the receipt again: A's correction, and not B's.
  await expect(receipts(b).first()).toContainText('255 L');
  await expect(receipts(b).first()).toContainText('US$ 310');
  await Promise.all([a.close(), b.close()]);
});

test('si se corta el alta y se cambia la foto, la boleta no se queda con la foto anterior', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await open(page, 'Combustible');
  const uploads: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/storage/v1/object/trf-fuel-receipts/')) uploads.push(decodeURIComponent(new URL(r.url()).pathname));
  });
  // The first save of the receipt is cut once its photo went up.
  const inserts: { id: string; object_path: string | null }[] = [];
  await page.route('**/rest/v1/trf_driver_fuel_receipts*', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    inserts.push(route.request().postDataJSON());
    return inserts.length === 1 ? route.abort('connectionfailed') : route.fallback();
  });

  await page.getByRole('button', { name: 'Nueva boleta' }).click();
  const form = page.getByRole('dialog', { name: 'Nueva boleta' });
  await form.getByLabel('Foto de la boleta').setInputFiles({ name: 'primera.jpg', mimeType: 'image/jpeg', buffer: await receiptPhoto(page, 'Total $ 1.111') });
  await expect(form).toContainText('Lista:');
  await form.getByLabel('Estación', { exact: true }).selectOption({ label: 'Ducsa Young' });
  await form.getByLabel('Importe').fill('1.111');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Sin conexión con el servidor');
  expect(uploads).toHaveLength(1);

  // The storage keeps the first photo at that receipt's path: the second one goes with a new receipt.
  await form.getByLabel('Foto de la boleta').setInputFiles({ name: 'segunda.jpg', mimeType: 'image/jpeg', buffer: await receiptPhoto(page, 'Total $ 2.222') });
  await expect(form).toContainText('Lista:');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Boleta cargada.');
  expect(inserts).toHaveLength(2);
  expect(inserts[1]!.id).not.toBe(inserts[0]!.id);
  expect(uploads).toHaveLength(2);
  expect(uploads[1]).toContain(`/standalone/${inserts[1]!.id}.jpg`);
  expect(inserts[1]!.object_path).toMatch(new RegExp(`/standalone/${inserts[1]!.id}\\.jpg$`));
  await expect(station(page, 'Ducsa Young').locator('.fs-balance')).toHaveText('Se le debe $ 1.111');
});

test('si se pierde la respuesta de una boleta sin foto y después se elige una, no la sube a una boleta ya guardada', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await open(page, 'Combustible');
  let uploads = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/storage/v1/object/trf-fuel-receipts/')) uploads++;
  });
  // The first save reaches the database, but its answer never comes back.
  let inserts = 0;
  await page.route('**/rest/v1/trf_driver_fuel_receipts*', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    inserts++;
    if (inserts > 1) return route.fallback();
    await route.fetch();
    return route.abort('connectionfailed');
  });

  await page.getByRole('button', { name: 'Nueva boleta' }).click();
  const form = page.getByRole('dialog', { name: 'Nueva boleta' });
  await form.getByLabel('Estación', { exact: true }).selectOption({ label: 'Petrobras Salto' });
  await form.getByLabel('Importe').fill('3.333');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Sin conexión con el servidor');

  await form.getByLabel('Foto de la boleta').setInputFiles({ name: 'tarde.jpg', mimeType: 'image/jpeg', buffer: await receiptPhoto(page, 'Total $ 3.333') });
  await expect(form).toContainText('Lista:');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('status')).toContainText('ya se había guardado en el intento anterior, sin foto');
  expect(inserts).toBe(1);
  expect(uploads).toBe(0);
  await expect(station(page, 'Petrobras Salto').locator('.fs-period')).toContainText('$ 3.333');
});

test('si se pierde la respuesta al registrar un pago, el reintento no lo cuenta dos veces', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Combustible');
  await station(page, 'Petrobras Salto').click();
  const dollars = page.locator('.card', { hasText: 'Cuenta en dólares' });
  await expect(dollars.locator('.card-head')).toContainText('Se le debe US$ 210');
  // The first save reaches the database, but its answer never comes back.
  let posts = 0;
  await page.route('**/rest/v1/trf_fuel_station_movements*', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    posts++;
    if (posts > 1) return route.fallback();
    await route.fetch();
    return route.abort('connectionfailed');
  });

  await page.getByRole('button', { name: 'Registrar pago' }).click();
  const pay = page.getByRole('dialog', { name: 'Registrar pago' });
  await pay.getByLabel('Importe pagado').fill('50');
  await pay.getByLabel('Moneda').selectOption({ label: 'Dólares (US$)' });
  await pay.getByLabel('Forma de pago').selectOption({ label: 'Efectivo' });
  await pay.getByLabel('Nota').fill('Recibo 77');
  await pay.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(pay.getByRole('alert')).toContainText('Sin conexión con el servidor');
  await pay.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(pay).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Pago registrado.');
  expect(posts).toBe(2);
  await expect(dollars.locator('tbody tr', { hasText: 'Recibo 77' })).toHaveCount(1);
  await expect(dollars.locator('.card-head')).toContainText('Se le debe US$ 160');
});
