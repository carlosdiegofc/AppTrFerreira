// The panel in a real browser against PostgREST and the local copy of the database structure, with invented data
// (tests/e2e/db/seed.sql). These tests only read: the ones that save are in edicion.spec.ts and run after them.
import { readFileSync } from 'node:fs';
import { type Download, expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { open, prepare, rows, shot, signIn, stat, tab } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

test('rechaza una contraseña incorrecta', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy', 'otra-clave');
  await expect(page.getByRole('alert')).toHaveText('El usuario o la contraseña no son correctos.');
});

test('una cuenta de chofer no entra al panel', async ({ page }) => {
  await signIn(page, 'chofer1@ejemplo.uy');
  await expect(page.getByRole('heading', { name: 'Esta cuenta no tiene acceso' })).toBeVisible();
  await page.getByRole('button', { name: 'Ingresar con otra cuenta' }).click();
  await expect(page.getByLabel('Nombre de usuario o correo')).toBeVisible();
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

  // The phone sends a new reading: within a few seconds the panel shows it, without touching anything.
  await page.route('**/rest/v1/trf_driver_locations*', async (route) => {
    const response = await route.fetch();
    const live = (await response.json()) as { driver_id: string; speed_kmh: number }[];
    await route.fulfill({ response, json: live.map((r) => (r.driver_id === '00000000-0000-4000-8000-000000000011' ? { ...r, speed_kmh: 91 } : r)) });
  });
  await expect(detail).toContainText('91 km/h');
  await page.unroute('**/rest/v1/trf_driver_locations*');

  await chip('Sin viaje').click();
  await expect(page.locator('.units > li')).toHaveCount(2);
});

test('el GPS en vivo dice qué choferes tienen la app abierta y dónde está el que no viaja', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'GPS en vivo');
  const people = page.locator('.gps-people');
  const driver = (name: string) => people.locator('.people > li', { hasText: name });
  await expect(people.locator('.people > li')).toHaveCount(4);
  // On a trip first, then active with the app open; the trip says where the truck is.
  await expect(people.locator('.people > li').first()).toContainText('Ana Pereira');
  await expect(driver('Ana Pereira')).toContainText('En viaje · app 0.17.1');
  await expect(driver('Bruno Díaz')).toContainText('En viaje · app 0.17.0 (hay una más nueva: 0.17.1)');
  await expect(driver('Diego Silva')).toContainText('Activo hace 2 min · sin viaje · app 0.17.1');
  await expect(people).toContainText('Las versiones anteriores a la 0.17.0 no avisan.');
  // Diego's phone shows on the map apart from his truck, which stays where his last trip ended.
  await expect(page.locator('.leaflet-marker-icon[title="Diego Silva · con la app abierta, sin viaje"]')).toHaveCount(1);
  await expect(page.locator('.leaflet-marker-icon[title^="Ford Cargo 1722 · JKL3456"]')).toHaveCount(1);
  await driver('Diego Silva').getByRole('button').click();
  const detail = page.locator('.unit-detail');
  await expect(detail).toContainText('Ford Cargo 1722 · JKL3456');
  await expect(detail).toContainText('Activo, sin viaje');
  await expect(detail).toContainText('hace 2 min · ±12 m');
  await expect(page).toHaveURL(/chofer=00000000-0000-4000-8000-000000000014/);
  await shot(page, 'gps-choferes');
});

test('al volver a un camión después de mirar a un chofer, el mapa muestra todo el recorrido otra vez', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'GPS en vivo');
  const lines = page.locator('.map-live path.fm-route:not(.fm-tail)');
  // How wide the route is drawn: the same once the map frames it again.
  const width = () =>
    lines.evaluateAll((paths) => {
      const boxes = paths.map((p) => p.getBoundingClientRect());
      return Math.max(...boxes.map((b) => b.right)) - Math.min(...boxes.map((b) => b.left));
    });
  const truck = page.getByRole('button', { name: /Volvo FH 460 · ABC1234/ });
  await truck.click();
  await expect(lines).toHaveCount(3);
  const whole = await width();
  // Diego has the app open and no trip: his phone shows, without a route. The owner zooms in around him.
  await page.locator('.gps-people .people > li', { hasText: 'Diego Silva' }).getByRole('button').click();
  await expect(lines).toHaveCount(0);
  for (let i = 0; i < 3; i++) await page.locator('.map-live .leaflet-control-zoom-in').click();
  await truck.click();
  await expect(lines).toHaveCount(3);
  await expect.poll(async () => Math.abs((await width()) - whole)).toBeLessThan(2);
});

test('si falla la actualización del recorrido en vivo, el GPS lo dice', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'GPS en vivo');
  await page.getByRole('button', { name: /Volvo FH 460 · ABC1234/ }).click();
  const detail = page.locator('.unit-detail');
  await expect(detail.locator('dd').last()).toHaveText('12');
  let fail = true;
  await page.route('**/rest/v1/trf_driver_location_history*', (route) => (fail ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"falla de prueba"}' }) : route.fallback()));
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(detail.getByRole('alert')).toContainText('No se pudo actualizar el recorrido: se ve el último que se leyó.');
  await expect(detail.locator('dd').last()).toHaveText('12');
  fail = false;
  await detail.getByRole('button', { name: 'Reintentar' }).click();
  await expect(detail.getByRole('alert')).toBeHidden();
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
  await expect(page.getByLabel('Nombre de usuario o correo')).toBeVisible();
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
  // A search that leaves out the trip in the trash says so, instead of "no trips deleted".
  await page.getByLabel('Buscar').fill('molino');
  await expect(page.getByText('Ningún viaje eliminado coincide con el filtro')).toBeVisible();
  await page.getByLabel('Buscar').fill('');

  // A truck chosen in a period without its trips stays chosen: the list says there is nothing, not "Todos".
  await tab(page, 'Todos').click();
  await page.getByLabel('Camión').selectOption('Volvo FH 460 · ABC1234');
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel('Período').selectOption('Mes anterior');
  await expect(page.getByText('No hay viajes en este período')).toBeVisible();
  await expect(page.getByLabel('Camión')).toHaveValue('Volvo FH 460 · ABC1234');
  await page.getByLabel('Buscar').fill('molino');
  // The side menu opens the list without filters, the search box included.
  await open(page, 'Viajes');
  await expect(page.getByLabel('Buscar')).toHaveValue('');
  await expect(page.getByLabel('Camión')).toHaveValue('');
  await expect(rows(page)).toHaveCount(6);
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

  // A finished trip: the arrival the GPS measured and the destination the office declared are told apart.
  await rows(page).filter({ hasText: 'Molino San José' }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Orden de carga 24129');
  await expect(page.locator('.map-trip path.fm-end')).toHaveCount(1);
  await expect(page.locator('.map-trip path.fm-declared')).toHaveCount(1);
  await expect(page.locator('.map-legend')).toContainText('Medido por el GPS');
  await expect(page.locator('.map-legend')).toContainText('Origen y destino declarados por la oficina o el chofer');
});

test('si falla una actualización, la lista y el viaje siguen a la vista con un aviso', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Viajes');
  await expect(rows(page)).toHaveCount(6);
  let fail = false;
  await page.route('**/rest/v1/trf_driver_tracking_sessions*', (route) => (fail ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"falla de prueba"}' }) : route.fallback()));
  fail = true;
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo actualizar: se ve lo último que se leyó.');
  await expect(rows(page)).toHaveCount(6);

  fail = false;
  await rows(page).filter({ hasText: 'Molino San José' }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Orden de carga 24129');
  fail = true;
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo actualizar: se ve lo último que se leyó.');
  await expect(page.locator('.order-facts')).toContainText('Molino San José');
  fail = false;
  await page.getByRole('alert').getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('alert')).toBeHidden();
});

test('si no se puede leer el catálogo de camiones, Viajes lo dice', async ({ page }) => {
  await page.route('**/rest/v1/trf_mobile_catalog*', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"falla de prueba"}' }));
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Viajes');
  await expect(page.getByRole('alert').filter({ hasText: 'No se pudo leer el catálogo de camiones' })).toBeVisible();
  // The trips are still there, each with the truck label it was saved with.
  await expect(rows(page)).toHaveCount(6);
});

test('si no se puede leer el recorrido, el viaje lo dice y deja reintentar', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Viajes');
  let fail = true;
  await page.route('**/rest/v1/trf_driver_location_history*', (route) => (fail ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"falla de prueba"}' }) : route.fallback()));
  await rows(page).filter({ hasText: 'ABC1234' }).first().getByRole('link').click();
  const card = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Recorrido' }) });
  await expect(card.getByRole('alert')).toContainText('No se pudo leer el recorrido del GPS.');
  await expect(card.locator('.route-facts div', { hasText: 'Puntos del recorrido' }).locator('dd')).toHaveText('—');
  fail = false;
  await card.getByRole('button', { name: 'Reintentar' }).click();
  await expect(card.locator('.route-facts div', { hasText: 'Puntos del recorrido' }).locator('dd')).toHaveText('12');
  await expect(card.getByRole('alert')).toBeHidden();
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

  // The trash can be exported too, but its trips never add up.
  await tab(page, 'Eliminados').click();
  await expect(rows(page)).toHaveCount(1);
  expect(unzipText(await saved(await download('Word')), 'word/document.xml')).toContain('Totales: 1 viaje eliminado, que no se suma');
  await tab(page, 'Todos').click();

  await rows(page).filter({ hasText: 'Molino San José' }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Orden de carga 24129');
  const [order] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar PDF' }).click()]);
  expect(order.suggestedFilename()).toBe('viaje_2026-10-15_24129.pdf');
  expect((await saved(order)).toString('latin1')).toContain('Orden de carga 24129');
});
