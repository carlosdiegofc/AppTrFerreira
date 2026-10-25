// Saving in Flota in a real browser: a truck's card with its photo, a trailer hitched, changed and annulled, a new
// trailer with its own plate that is sold, two people changing the same card at once, and saves whose answer is cut.
// Saving changes the test data, so this file runs after the read-only tests (project "edicion" in playwright.config.ts),
// in this order.
import { expect, type Page, test } from '@playwright/test';
import { open, prepare, shot, signIn } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

const trucks = (page: Page) => page.getByRole('list', { name: 'Camiones' }).getByRole('listitem');
const card = (page: Page, title: string) => page.locator('.card', { has: page.getByRole('heading', { name: title, exact: true }) });

/** A real JPEG drawn by the browser, like the photo of a truck. */
async function truckPhoto(page: Page): Promise<Buffer> {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 600;
    const g = canvas.getContext('2d') as CanvasRenderingContext2D;
    g.fillStyle = '#d8e4f0';
    g.fillRect(0, 0, 900, 600);
    g.fillStyle = '#1f4e8c';
    g.fillRect(120, 220, 520, 200);
    g.fillRect(640, 280, 160, 140);
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1] as string;
  });
  return Buffer.from(data, 'base64');
}

/** The first request of a method to a path reaches the database, but its answer never comes back. */
async function cutFirst(page: Page, path: string, method = 'POST') {
  let cut = true;
  await page.route(`**/rest/v1/${path}*`, async (route) => {
    if (route.request().method() !== method || !cut) return route.fallback();
    cut = false;
    await route.fetch();
    await route.abort('failed');
  });
}

test('se crea la ficha de un camión con su foto, y su acoplado se engancha, se cambia y se anula', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Flota');
  await trucks(page).filter({ hasText: 'Scania R450' }).getByRole('button', { name: 'Crear ficha' }).click();
  const form = page.getByRole('dialog', { name: 'Ficha de Scania R450 · DEF5678' });
  // The brand and the model start from the catalog's name.
  await expect(form.getByLabel('Marca')).toHaveValue('Scania');
  await expect(form.getByLabel('Modelo')).toHaveValue('R450');
  await form.getByLabel('Año').fill('2031');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toContainText('Escribí un año entre 1950 y 2027.');
  await form.getByLabel('Año').fill('2020');
  await form.getByLabel('Número de chasis').fill('9bsr4x200l0000001');
  await form.getByLabel('Número de motor').fill('DC13 0001');
  await form.getByLabel('Capacidad de carga').fill('32.000');
  await form.getByLabel('Foto').setInputFiles({ name: 'scania.jpg', mimeType: 'image/jpeg', buffer: await truckPhoto(page) });
  await expect(form).toContainText('Foto lista');
  await shot(page, 'flota-nueva-ficha');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toBeHidden();
  // The new card opens, with its photo.
  await expect(page.getByRole('heading', { name: 'Scania R450 · DEF5678', level: 1 })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Ficha de Scania R450 · DEF5678 creada.');
  const data = card(page, 'Datos');
  await expect(data).toContainText('Año2020');
  await expect(data).toContainText('Chasis9BSR4X200L0000001');
  await expect(data).toContainText('MotorDC13 0001');
  await expect(data).toContainText('Capacidad de carga32.000 kg');
  await expect(data.getByRole('button', { name: 'Ver la foto de Scania R450 · DEF5678' }).locator('img')).toBeVisible();

  // The free tanker goes on it today.
  const trailer = card(page, 'Acoplado');
  await trailer.getByRole('button', { name: 'Enganchar' }).click();
  const hitch = page.getByRole('dialog', { name: 'Enganchar un acoplado al Scania R450 · DEF5678' });
  await hitch.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(hitch).toContainText('Elegí el acoplado.');
  await hitch.getByLabel('Acoplado').selectOption({ label: 'Cisterna Facchini · CIS2002' });
  await expect(hitch.getByLabel('Desde el')).toHaveValue('2026-10-15');
  await hitch.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Cisterna Facchini · CIS2002 enganchado al Scania R450 · DEF5678 desde el 15/10/2026.');
  await expect(trailer.getByRole('link', { name: 'Cisterna Facchini · CIS2002' })).toBeVisible();
  await expect(trailer).toContainText('Desde el 15/10/2026 · 30 m³');

  // The semi-trailer of the Volvo cannot replace it from the same day the tanker went on.
  await trailer.getByRole('button', { name: 'Cambiar' }).click();
  const change = page.getByRole('dialog', { name: 'Cambiar el acoplado del Scania R450 · DEF5678' });
  await expect(change).toContainText('Ahora lleva Cisterna Facchini · CIS2002 (desde el 15/10/2026)');
  await change.getByLabel('Acoplado').selectOption({ label: 'Semirremolque Randon · REM1001 · en el Volvo FH 460 · ABC1234' });
  await expect(change).toContainText('Va en el Volvo FH 460 · ABC1234 desde el 01/03/2025: deja de ir en ese camión desde el día anterior.');
  await change.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(change).toContainText('Tiene que ser posterior al 15/10/2026, cuando enganchó el que lleva ahora.');
  await change.getByRole('button', { name: 'Cancelar' }).click();
  await change.getByRole('button', { name: 'Salir sin guardar' }).click();
  await expect(change).toBeHidden();

  // The tanker was a mistake: annulled, it stays saved but no longer counts.
  await trailer.getByRole('button', { name: 'Anular el enganche de Cisterna Facchini · CIS2002, desde el 15/10/2026' }).click();
  const annul = page.getByRole('dialog', { name: '¿Anular este enganche?' });
  await expect(annul).toContainText('Cisterna Facchini · CIS2002 en el Scania R450 · DEF5678, desde el 15/10/2026.');
  await annul.getByRole('button', { name: 'Anular' }).click();
  await expect(page.getByRole('status')).toContainText('Enganche anulado: queda guardado, pero ya no cuenta.');
  await expect(trailer).toContainText('No lleva acoplado.');

  // The Volvo's semi-trailer goes on it since the 10th: the Volvo keeps it until the 9th.
  await trailer.getByRole('button', { name: 'Enganchar' }).click();
  await hitch.getByLabel('Acoplado').selectOption({ label: 'Semirremolque Randon · REM1001 · en el Volvo FH 460 · ABC1234' });
  await hitch.getByLabel('Desde el').fill('2026-10-10');
  await hitch.getByLabel('Nota').fill('Pasa al Scania');
  await hitch.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Semirremolque Randon · REM1001 enganchado al Scania R450 · DEF5678 desde el 10/10/2026.');
  await expect(trailer).toContainText('Desde el 10/10/2026 · 28.000 kg · Pasa al Scania');
  await shot(page, 'flota-enganche');

  await open(page, 'Flota');
  await expect(trucks(page).filter({ hasText: 'Scania R450' })).toContainText('Semirremolque Randon · REM1001');
  await expect(trucks(page).filter({ hasText: 'Volvo FH 460' })).toContainText('Sin acoplado');
  await trucks(page).getByRole('link', { name: 'Volvo FH 460 · ABC1234' }).click();
  const volvo = card(page, 'Acoplado');
  await expect(volvo).toContainText('No lleva acoplado.');
  const before = volvo.getByRole('list', { name: 'Acoplados que llevó antes' }).getByRole('listitem');
  await expect(before).toHaveCount(2);
  await expect(before.nth(0)).toContainText('Semirremolque Randon · REM1001');
  await expect(before.nth(0)).toContainText('Del 01/03/2025 al 09/10/2026');
  await expect(before.nth(1)).toContainText('Acoplado Pastrana · OLD0099');
});

test('un acoplado nuevo lleva su propia matrícula, se da de baja y queda con su historial', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Flota');
  await page.getByRole('button', { name: 'Nuevo acoplado' }).click();
  const form = page.getByRole('dialog', { name: 'Nuevo acoplado' });
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toContainText('Escribí la matrícula.');
  // The Volvo has that plate.
  await form.getByLabel('Matrícula').fill('abc 1234');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toContainText('Ya hay un camión o un acoplado con esa matrícula.');
  await form.getByLabel('Matrícula').fill('vol-5005');
  await form.getByLabel('Tipo').fill('Volcadora');
  await form.getByLabel('Marca').fill('Randon');
  await form.getByLabel('Capacidad de carga').fill('20');
  await form.getByLabel('En', { exact: true }).selectOption({ label: 'Metros cúbicos (m³)' });
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Volcadora Randon · VOL5005', level: 1 })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Acoplado VOL5005 cargado.');
  await expect(card(page, 'Datos')).toContainText('Capacidad de carga20 m³');
  await expect(card(page, 'Camión')).toContainText('No va en ningún camión.');

  // It goes on the Iveco since the 12th.
  await open(page, 'Flota');
  await trucks(page).getByRole('link', { name: 'Iveco Stralis · MNO7890' }).click();
  await card(page, 'Acoplado').getByRole('button', { name: 'Enganchar' }).click();
  const hitch = page.getByRole('dialog', { name: 'Enganchar un acoplado al Iveco Stralis · MNO7890' });
  await hitch.getByLabel('Acoplado').selectOption({ label: 'Volcadora Randon · VOL5005' });
  await hitch.getByLabel('Desde el').fill('2026-10-12');
  await hitch.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Volcadora Randon · VOL5005 enganchado al Iveco Stralis · MNO7890 desde el 12/10/2026.');
  await card(page, 'Acoplado').getByRole('link', { name: 'Volcadora Randon · VOL5005' }).click();
  await expect(page.getByRole('heading', { name: 'Volcadora Randon · VOL5005', level: 1 })).toBeVisible();

  // Sold: it stops going on the Iveco from that day, and the card stays, out of the trailers in use.
  await page.getByRole('button', { name: 'Editar ficha' }).click();
  const edit = page.getByRole('dialog', { name: 'Acoplado VOL5005' });
  await edit.getByLabel('Se vendió o dejó de usarse (la ficha queda guardada, con su historial)').check();
  await expect(edit.getByLabel('Desde el')).toHaveValue('2026-10-15');
  await expect(edit).toContainText('Va en el Iveco Stralis · MNO7890 desde el 12/10/2026: queda desenganchado desde este día.');
  await edit.getByText('queda desenganchado desde este día').scrollIntoViewIfNeeded();
  await shot(page, 'flota-baja');
  await edit.getByLabel('Desde el').fill('2026-10-12');
  await edit.getByLabel('Motivo').fill('Vendido');
  await edit.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(edit).toContainText('Tiene que ser posterior al 12/10/2026, cuando se enganchó. Si ese enganche fue un error, anulalo.');
  await edit.getByLabel('Desde el').fill('2026-10-15');
  await edit.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Ficha guardada. Quedó desenganchado desde el 15/10/2026.');
  await expect(page.locator('.page-sub')).toContainText('Dado de baja el 15/10/2026');
  await expect(card(page, 'Datos')).toContainText('Se dio de baja el 15/10/2026 (vendido)');
  const truck = card(page, 'Camión');
  await expect(truck).toContainText('Se dio de baja: ya no va en ningún camión.');
  await expect(truck.getByRole('list', { name: 'Camiones en los que fue antes' })).toContainText('Iveco Stralis · MNO7890Del 12/10/2026 al 14/10/2026');
  await page.getByRole('button', { name: 'Flota' }).click();
  await expect(card(page, 'Acoplado')).toContainText('No lleva acoplado.');
  await expect(card(page, 'Acoplado').getByRole('list', { name: 'Acoplados que llevó antes' })).toContainText('Volcadora Randon · VOL5005');

  await open(page, 'Flota');
  const views = page.getByRole('group', { name: 'Vista' });
  await views.getByRole('button', { name: /De baja/ }).click();
  const gone = page.getByRole('list', { name: 'De baja' }).getByRole('listitem');
  await expect(gone.filter({ hasText: 'Volcadora Randon · VOL5005' })).toContainText('Desde el 15/10/2026 · Vendido');
  await views.getByRole('button', { name: /Acoplados/ }).click();
  await expect(page.getByRole('list', { name: 'Acoplados' })).not.toContainText('VOL5005');
});

test('si dos personas cambian la misma ficha a la vez, la segunda no pisa a la primera', async ({ browser }) => {
  const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
  for (const p of [a, b]) {
    await prepare(p);
    await signIn(p, 'dueno@ejemplo.uy');
    await open(p, 'Flota');
    await trucks(p).getByRole('link', { name: 'Volvo FH 460 · ABC1234' }).click();
    await p.getByRole('button', { name: 'Editar ficha' }).click();
  }
  const formA = a.getByRole('dialog', { name: 'Ficha de Volvo FH 460 · ABC1234' });
  const formB = b.getByRole('dialog', { name: 'Ficha de Volvo FH 460 · ABC1234' });
  await formA.getByLabel('Notas').fill('Cubiertas nuevas en octubre.');
  await formA.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(a.getByRole('status')).toContainText('Ficha guardada.');

  await formB.getByLabel('Año').fill('2019');
  await formB.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(b.getByRole('alert')).toContainText('Otra persona lo cambió mientras lo tenías abierto');
  // B sees A's notes and the year as it was.
  await expect(card(b, 'Datos')).toContainText('Cubiertas nuevas en octubre.');
  await expect(card(b, 'Datos')).toContainText('Año2018');
  await Promise.all([a.close(), b.close()]);
});

test('una ficha y un enganche cuya respuesta se corta se guardan una sola vez', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Flota');
  await cutFirst(page, 'trf_fleet_units');
  await cutFirst(page, 'rpc/trf_fleet_hitch');
  await trucks(page).filter({ hasText: 'Ford Cargo 1722' }).getByRole('button', { name: 'Crear ficha' }).click();
  const form = page.getByRole('dialog', { name: 'Ficha de Ford Cargo 1722 · JKL3456' });
  await form.getByLabel('Año').fill('2012');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Sin conexión con el servidor.');
  // Trying again finds the card saved the first time.
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ford Cargo 1722 · JKL3456', level: 1 })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Ficha de Ford Cargo 1722 · JKL3456 creada.');
  await expect(card(page, 'Datos')).toContainText('Año2012');

  const trailer = card(page, 'Acoplado');
  await trailer.getByRole('button', { name: 'Enganchar' }).click();
  const hitch = page.getByRole('dialog', { name: 'Enganchar un acoplado al Ford Cargo 1722 · JKL3456' });
  await hitch.getByLabel('Acoplado').selectOption({ label: 'Cisterna Facchini · CIS2002' });
  await hitch.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(hitch.getByRole('alert')).toContainText('Sin conexión con el servidor.');
  // Trying again with another day finds the hitch of the first try, and says so instead of the day typed now.
  await hitch.getByLabel('Desde el').fill('2026-10-14');
  await hitch.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Ese enganche ya se había guardado en el intento anterior, con lo que tenía entonces');
  await expect(trailer.getByRole('link', { name: 'Cisterna Facchini · CIS2002' })).toBeVisible();
  await expect(trailer).toContainText('Desde el 15/10/2026');
  await expect(trailer.getByRole('list', { name: 'Acoplados que llevó antes' })).toHaveCount(0);

  // One card and one hitch: the list says so.
  await open(page, 'Flota');
  await expect(page.locator('.stat', { hasText: 'Camiones' })).toContainText('3 con ficha');
  await expect(trucks(page).filter({ hasText: 'Ford Cargo 1722' })).toContainText('Cisterna Facchini · CIS2002');
});
