// The panel in a real browser against PostgREST and the local copy of the database structure, with invented data
// (tests/e2e/db/seed.sql). The browser clock is fixed at the seed's base instant: 15/10/2026 at noon in Uruguay.
import { mkdirSync, readFileSync } from 'node:fs';
import { type Download, expect, type Page, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';

const BASE = process.env.PANEL_E2E_BASE ?? '2026-10-15T15:00:00Z';
const SHOTS = 'tests/e2e/shots';
// 1×1 grey PNG: map tiles are never fetched from OpenStreetMap during the tests.
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN89+7dfwAJ6QPbJ1DSWgAAAABJRU5ErkJggg==', 'base64');

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(BASE));
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ contentType: 'image/png', body: TILE }));
});

async function signIn(page: Page, email: string, password = 'clave-de-prueba') {
  await page.goto('./');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

/** Opens a section from the side menu, which on phones sits behind the menu button. */
async function open(page: Page, section: string) {
  await expect(page.locator('main#contenido')).toBeVisible();
  const menu = page.getByRole('button', { name: 'Abrir el menú' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation').getByRole('link', { name: new RegExp(`^${section}`) }).click();
}

const stat = (page: Page, label: string) => page.locator('.stat', { hasText: label });
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png`, fullPage: true });

test('rechaza una contraseña incorrecta', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy', 'otra-clave');
  await expect(page.getByRole('alert')).toHaveText('El correo o la contraseña no son correctos.');
});

test('una cuenta de chofer no entra al panel', async ({ page }) => {
  await signIn(page, 'chofer1@ejemplo.uy');
  await expect(page.getByRole('heading', { name: 'Esta cuenta no tiene acceso' })).toBeVisible();
  await page.getByRole('button', { name: 'Ingresar con otra cuenta' }).click();
  await expect(page.getByLabel('Correo')).toBeVisible();
});

test('un administrador que no está en la lista del panel tampoco entra', async ({ page }) => {
  await signIn(page, 'admin@ejemplo.uy');
  await expect(page.getByRole('heading', { name: 'Esta cuenta no tiene acceso' })).toBeVisible();
});

test('el inicio muestra la flota, los viajes de hoy y lo que hay que tener en cuenta', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Buen día, Dueño');
  await expect(stat(page, 'En ruta').locator('.stat-value')).toHaveText('1');
  await expect(stat(page, 'Detenidos').locator('.stat-value')).toHaveText('2');
  await expect(stat(page, 'Detenidos')).toContainText('1 sin señal');
  // The truck saved with an older label without plate still counts as busy: two idle trucks, not three.
  await expect(stat(page, 'Sin viaje').locator('.stat-value')).toHaveText('2');
  await expect(stat(page, 'Viajes hoy').locator('.stat-value')).toHaveText('4');
  await expect(stat(page, 'Viajes hoy')).toContainText('3 en curso');
  // The trip of 08:30 was sent to the trash in the old panel.
  await expect(page.locator('.trip-time')).toHaveText(['11:00', '10:00', '09:00', '06:00']);
  await expect(page.locator('.alert-line strong')).toHaveText(['SOA · GHI9012', 'Frenos · ABC1234', 'Cambio de aceite · DEF5678', 'Licencia de conducir · Ana Pereira']);
  await expect(page.locator('.alert-line').first()).toContainText('Venció el 12/10/2026');
  await expect(page.locator('.map-home .fm')).toHaveCount(5);
  await shot(page, 'inicio');

  // The session survives a reload.
  await page.reload();
  await expect(stat(page, 'En ruta').locator('.stat-value')).toHaveText('1');
});

test('el GPS en vivo filtra la flota y sigue a un camión con su recorrido', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'GPS en vivo');
  await expect(page.getByRole('heading', { name: 'GPS en vivo', level: 1 })).toBeVisible();
  const chip = (name: string) => page.locator('.chip', { hasText: name });
  await expect(chip('Todos')).toContainText('5');
  await expect(chip('En ruta')).toContainText('1');
  await expect(chip('Detenidos')).toContainText('2');
  await expect(chip('Sin viaje')).toContainText('2');
  await expect(page.getByRole('button', { name: /Mercedes Benz Actros · GHI9012 Carla Méndez · Sin señal/ })).toBeVisible();

  await page.getByRole('button', { name: /Volvo FH 460 · ABC1234/ }).click();
  const detail = page.locator('.unit-detail');
  await expect(detail).toContainText('Ana Pereira');
  await expect(detail).toContainText('78 km/h');
  await expect(detail).toContainText('152 km');
  // The reading without a fix is not counted nor drawn.
  await expect(detail.locator('dd').last()).toHaveText('12');
  // Three stretches: the trip was paused once and the signal was lost for five minutes.
  await expect(page.locator('path.fm-route')).toHaveCount(3);
  await expect(page).toHaveURL(/camion=trip%3A10000000-0000-4000-8000-00000000000a/);
  await shot(page, 'gps');

  await chip('Sin viaje').click();
  await expect(page.locator('.units > li')).toHaveCount(2);
});

test('las secciones que faltan dicen qué van a hacer y la sesión se cierra', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await expect(stat(page, 'En ruta')).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link')).toHaveCount(12);
  await open(page, 'Combustible');
  await expect(page.getByRole('heading', { name: 'Próximamente' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Abrir el panel actual/ })).toHaveAttribute('href', 'https://carlosdiegofc.github.io/AppTrFerreira/');
  await shot(page, 'proximamente');

  const menu = page.getByRole('button', { name: 'Abrir el menú' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.getByLabel('Correo')).toBeVisible();
});

test('una cuenta que solo lee la flota también entra', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Buen día, Socio');
  await expect(stat(page, 'En ruta').locator('.stat-value')).toHaveText('1');
});

test('modo oscuro', async ({ page }) => {
  test.skip(test.info().project.name !== 'escritorio', 'una captura alcanza');
  await page.emulateMedia({ colorScheme: 'dark' });
  await signIn(page, 'dueno@ejemplo.uy');
  await expect(stat(page, 'En ruta').locator('.stat-value')).toHaveText('1');
  await expect(page.locator('.map-home .fm')).toHaveCount(5);
  await shot(page, 'inicio-oscuro');
});

// ---------- Viajes ----------
// Last 30 days from the fixed day (15/10/2026): the five trips of the app of today and yesterday, the one deleted in the
// old panel and the one typed by hand three days ago.
const rows = (page: Page) => page.locator('.trip-rows > li');
const tab = (page: Page, name: string) => page.locator('.chip', { hasText: name });

test('Viajes lista los viajes del período por estado y los filtra', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Viajes');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Viajes');
  await expect(tab(page, 'Todos')).toContainText('6');
  await expect(tab(page, 'Pendientes')).toContainText('1');
  await expect(tab(page, 'En curso')).toContainText('3');
  await expect(tab(page, 'Completos')).toContainText('2');
  await expect(tab(page, 'Eliminados')).toContainText('1');
  await expect(rows(page)).toHaveCount(6);
  // Newest first; the trip of the app completed by the office shows what the office typed.
  await expect(rows(page).first()).toContainText('DEF5678');
  await expect(rows(page).nth(3)).toContainText('Paysandú – Salto');
  await expect(rows(page).nth(3)).toContainText('120 km');
  await expect(rows(page).last()).toContainText('Cargado a mano · Orden 24101');
  await shot(page, 'viajes');

  await tab(page, 'Pendientes').click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Falta: Origen, Destino');
  await expect(page).toHaveURL(/estado=pendientes/);

  await tab(page, 'Todos').click();
  await page.getByLabel('Buscar').fill('molino');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Molino San José');
  await page.getByLabel('Buscar').fill('');
  await page.getByLabel('Chofer').selectOption('Ana Pereira');
  await expect(rows(page)).toHaveCount(3);

  await page.getByLabel('Chofer').selectOption('');
  await tab(page, 'Eliminados').click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Eliminado');
});

test('el detalle de un viaje muestra la orden de carga, el recorrido, los remitos y el combustible', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Viajes');
  await rows(page).filter({ hasText: 'ABC1234' }).first().getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Viaje de Ana Pereira');
  const facts = page.locator('.order-facts');
  // What Ana typed on the phone: destination, client, cargo and kilos ("30.000").
  await expect(facts).toContainText('Puerto de Montevideo');
  await expect(facts).toContainText('Navios');
  await expect(facts).toContainText('30.000 kg');
  await expect(facts.locator('div', { hasText: 'Llegada' }).locator('dd')).toHaveText('En curso');
  await expect(page.locator('.trip-status')).toContainText('En curso');
  await expect(page.locator('.map-trip path.fm-route')).toHaveCount(3);
  await expect(page.locator('.route-facts div', { hasText: 'Puntos del recorrido' }).locator('dd')).toHaveText('12');

  const notes = page.locator('.card', { hasText: 'Remitos (2)' });
  await expect(notes).toContainText('Remito de salida 0001-00012345');
  await expect(notes).toContainText('Remito de llegada sin número');
  await notes.getByRole('button', { name: 'Ver foto' }).click();
  const dialog = page.getByRole('dialog', { name: 'Remito de salida 0001-00012345' });
  await expect(dialog.locator('img')).toBeVisible();
  await expect.poll(() => dialog.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await shot(page, 'viaje-foto');
  await dialog.getByRole('button', { name: 'Cerrar la foto' }).click();
  await expect(dialog).toBeHidden();

  const fuel = page.locator('.card', { hasText: 'Combustible en el viaje (1)' });
  // The office corrected the receipt: its litres and amount win.
  await expect(fuel).toContainText('182,5 L · $ 9.950');
  await fuel.getByRole('button', { name: 'Ver boleta' }).click();
  await expect(page.getByRole('dialog', { name: /Boleta/ }).locator('img')).toBeVisible();
  await page.keyboard.press('Escape');
  await shot(page, 'viaje');

  await page.getByRole('button', { name: 'Viajes' }).first().click();
  await expect(rows(page)).toHaveCount(6);
});

async function saved(download: Download): Promise<Buffer> {
  const file = await download.path();
  return readFileSync(file);
}
const unzipText = (data: Buffer, name: string) => strFromU8(unzipSync(new Uint8Array(data))[name] ?? new Uint8Array());

test('Viajes exporta la lista a Excel, PDF y Word, y un viaje a PDF', async ({ page }) => {
  test.skip(test.info().project.name !== 'escritorio', 'los archivos son los mismos en el celular');
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Viajes');
  await expect(rows(page)).toHaveCount(6);
  const download = async (label: string) => {
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('group', { name: 'Exportar la lista' }).getByRole('button', { name: label }).click()]);
    return file;
  };

  const excel = await download('Excel');
  expect(excel.suggestedFilename()).toBe('viajes_2026-09-16_a_2026-10-15.xlsx');
  const sheet = await saved(excel);
  const strings = unzipText(sheet, 'xl/sharedStrings.xml') + unzipText(sheet, 'xl/worksheets/sheet1.xml');
  expect(strings).toContain('Molino San José');
  expect(strings).toContain('Km facturables');

  const pdf = await download('PDF');
  expect(pdf.suggestedFilename()).toBe('viajes_2026-09-16_a_2026-10-15.pdf');
  const printed = (await saved(pdf)).toString('latin1');
  expect(printed.startsWith('%PDF')).toBe(true);
  expect(printed).toContain('Molino San Jos');

  const word = await download('Word');
  expect(word.suggestedFilename()).toBe('viajes_2026-09-16_a_2026-10-15.docx');
  expect(unzipText(await saved(word), 'word/document.xml')).toContain('Molino San José');

  await rows(page).filter({ hasText: 'Molino San José' }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Orden de carga 24129');
  const [order] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar PDF' }).click()]);
  expect(order.suggestedFilename()).toBe('viaje_2026-10-15_24129.pdf');
  expect((await saved(order)).toString('latin1')).toContain('Orden de carga 24129');
});
