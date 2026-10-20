// Saving papers in a real browser: a truck's paper with its photo (a real one, drawn by the browser), a driver's paper
// with its PDF (a file that is not a PDF is refused), taking a file off, deleting a paper with its file, and two people
// changing the same paper at once. Saving changes the test data, so this file runs after the read-only tests (project
// "edicion" in playwright.config.ts), in this order.
import { expect, type Page, test } from '@playwright/test';
import { open, prepare, shot, signIn } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

const group = (page: Page, owner: string) => page.locator('.paper-group', { has: page.locator('.card-title', { hasText: owner }) });
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

/** A real JPEG drawn by the browser, like the photo of a paper. */
async function paperPhoto(page: Page): Promise<Buffer> {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 600;
    const g = canvas.getContext('2d') as CanvasRenderingContext2D;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 900, 600);
    g.fillStyle = '#123';
    g.font = '44px sans-serif';
    g.fillText('SOA · MNO7890', 60, 120);
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1] as string;
  });
  return Buffer.from(data, 'base64');
}

/** The storage requests of the page: uploads and deletes of paper files. */
function storage(page: Page) {
  const seen: { uploads: string[]; deletes: string[] } = { uploads: [], deletes: [] };
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (r.method() === 'POST' && url.pathname.includes('/storage/v1/object/trf-documents/')) seen.uploads.push(decodeURIComponent(url.pathname.split('/trf-documents/')[1] ?? ''));
    if (r.method() === 'DELETE' && url.pathname.endsWith('/storage/v1/object/trf-documents')) seen.deletes.push(...((r.postDataJSON() as { prefixes: string[] }).prefixes ?? []));
  });
  return seen;
}

test('un papel de un camión con su foto', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await open(page, 'Documentación');
  const seen = storage(page);
  await page.getByRole('button', { name: 'Nuevo documento' }).click();
  const form = page.getByRole('dialog', { name: 'Nuevo documento' });
  await expect(form.getByRole('radio', { name: 'De un camión' })).toHaveAttribute('aria-checked', 'true');
  await form.getByLabel('Camión').selectOption('Iveco Stralis · MNO7890');
  await form.getByLabel('Tipo de documento').selectOption('SOA / Seguro');
  await form.getByLabel('Vencimiento').fill('2026-11-05');
  await form.getByLabel('Archivo del documento').setInputFiles({ name: 'soa.jpg', mimeType: 'image/jpeg', buffer: await paperPhoto(page) });
  const preview = form.getByRole('img', { name: 'Foto elegida del documento' });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await shot(page, 'documentacion-nuevo');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();

  await expect(form).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Documento cargado con su archivo.');
  await expect(group(page, 'MNO7890')).toContainText('Vence el 05/11/2026 · en 21 días');
  // The photo went to the folder of its paper.
  expect(seen.uploads).toHaveLength(1);
  expect(seen.uploads[0]).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);
  await group(page, 'MNO7890').getByRole('button', { name: 'Ver foto' }).click();
  await expect(page.getByRole('dialog', { name: 'SOA / Seguro · Iveco Stralis · MNO7890' }).locator('img')).toBeVisible();
});

test('un papel de un chofer con su PDF, que tiene que ser un PDF de verdad', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Documentación');
  await page.getByRole('button', { name: 'Nuevo documento' }).click();
  const form = page.getByRole('dialog', { name: 'Nuevo documento' });
  await form.getByRole('radio', { name: 'De un chofer' }).click();
  await form.getByLabel('Chofer').selectOption({ label: 'Carla Méndez' });
  await form.getByLabel('Tipo de documento').selectOption('Carné de salud');
  await form.getByLabel('Archivo del documento').setInputFiles({ name: 'carne.pdf', mimeType: 'application/pdf', buffer: Buffer.from('hola') });
  await expect(form).toContainText('Ese archivo no es un PDF que se pueda abrir.');
  await form.getByLabel('Archivo del documento').setInputFiles({ name: 'carne.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(form).toContainText('PDF listo: carne.pdf');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Documento cargado con su archivo.');
  await expect(group(page, 'Carla Méndez')).toContainText('Sin fecha de vencimiento');
  await group(page, 'Carla Méndez').getByRole('button', { name: 'Ver PDF' }).click();
  const link = page.getByRole('dialog', { name: 'Carné de salud · Carla Méndez' }).getByRole('link', { name: 'Abrir el PDF' });
  const answer = await page.request.get((await link.getAttribute('href')) as string);
  expect(answer.headers()['content-type']).toBe('application/pdf');
});

test('si se corta el alta de un papel y se cambia el archivo, el archivo nuevo no queda', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await open(page, 'Documentación');
  const seen = storage(page);
  // The first paper saved reaches the database, but its answer is lost.
  let cut = true;
  await page.route('**/rest/v1/trf_documents*', async (route) => {
    if (route.request().method() !== 'POST' || !cut) return route.fallback();
    cut = false;
    await route.fetch();
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Nuevo documento' }).click();
  const form = page.getByRole('dialog', { name: 'Nuevo documento' });
  await form.getByLabel('Camión').selectOption('Mercedes Benz Actros · GHI9012');
  await form.getByLabel('Tipo de documento').selectOption('Patente');
  await form.getByLabel('Archivo del documento').setInputFiles({ name: 'patente.jpg', mimeType: 'image/jpeg', buffer: await paperPhoto(page) });
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Sin conexión con el servidor');
  // Another file, tried again: the paper was saved with the first one, and the second goes.
  await form.getByLabel('Archivo del documento').setInputFiles({ name: 'patente.pdf', mimeType: 'application/pdf', buffer: PDF });
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('alert')).toContainText('Ese documento ya se había guardado en el intento anterior');
  expect(seen.uploads).toHaveLength(2);
  await expect.poll(() => seen.deletes).toEqual([seen.uploads[1]]);
  await expect(group(page, 'GHI9012').locator('.paper-row', { hasText: 'Patente' }).getByRole('button', { name: 'Ver foto' })).toBeVisible();
});

test('quitar el archivo de un papel y borrar un papel con el suyo', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await open(page, 'Documentación');
  const seen = storage(page);
  await group(page, 'Ana Pereira').getByRole('button', { name: /Licencia de conducir/ }).click();
  const form = page.getByRole('dialog', { name: 'Editar documento' });
  await expect(form).toContainText('Tiene una foto.');
  await form.getByRole('button', { name: 'Quitar el archivo' }).click();
  await expect(form).toContainText('El archivo se borra al guardar.');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Documento guardado, sin archivo.');
  await expect(group(page, 'Ana Pereira')).toContainText('Sin archivo');
  await expect.poll(() => seen.deletes).toEqual(['50000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001.jpg']);

  await group(page, 'Bruno Díaz').getByRole('button', { name: /Carné de salud/ }).click();
  await form.getByRole('button', { name: 'Eliminar' }).click();
  const confirm = page.getByRole('dialog', { name: '¿Eliminar este documento?' });
  await expect(confirm).toContainText('Se borra para siempre, con su archivo, también en la app.');
  await confirm.getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByRole('status')).toContainText('Documento eliminado.');
  await expect(group(page, 'Bruno Díaz')).toHaveCount(0);
  await expect.poll(() => seen.deletes).toContain('50000000-0000-4000-8000-000000000004/60000000-0000-4000-8000-000000000004.jpg');
});

test('si dos personas cambian el mismo papel a la vez, la segunda no pisa a la primera', async ({ browser }) => {
  const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
  for (const p of [a, b]) {
    await prepare(p);
    await signIn(p, 'dueno@ejemplo.uy');
    await open(p, 'Documentación');
    await group(p, 'GHI9012').getByRole('button', { name: /SOA/ }).click();
  }
  const formA = a.getByRole('dialog', { name: 'Editar documento' });
  const formB = b.getByRole('dialog', { name: 'Editar documento' });
  await formA.getByLabel('Vencimiento').fill('2027-10-12');
  await formA.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(a.getByRole('status')).toContainText('Documento guardado.');

  // B also replaces the PDF: its save is refused, and the new PDF goes; the one the paper has stays.
  const seen = storage(b);
  await formB.getByLabel('Notas').fill('Póliza 999');
  await formB.getByLabel('Archivo del documento').setInputFiles({ name: 'soa-nuevo.pdf', mimeType: 'application/pdf', buffer: PDF });
  await formB.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(b.getByRole('alert')).toContainText('Otra persona cambió o borró ese documento');
  // B reads it again: A's date, and not B's notes.
  await expect(group(b, 'GHI9012')).toContainText('Vence el 12/10/2027');
  await expect(group(b, 'GHI9012')).not.toContainText('Póliza 999');
  expect(seen.uploads).toHaveLength(1);
  await expect.poll(() => seen.deletes).toEqual(seen.uploads);
  await group(b, 'GHI9012').getByRole('button', { name: 'Ver PDF' }).click();
  await expect(b.getByRole('dialog', { name: /^SOA/ }).getByRole('link', { name: 'Abrir el PDF' })).toBeVisible();
  await Promise.all([a.close(), b.close()]);
});

test('si se corta la respuesta al cambiar el archivo, el reintento lo da por guardado y borra el anterior', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await open(page, 'Documentación');
  const seen = storage(page);
  // The first change of the paper reaches the database, but its answer is lost.
  let cut = true;
  await page.route('**/rest/v1/trf_documents*', async (route) => {
    if (route.request().method() !== 'PATCH' || !cut) return route.fallback();
    cut = false;
    await route.fetch();
    await route.abort('failed');
  });
  // The Iveco's SOA, loaded above with a photo: a PDF takes its place.
  await group(page, 'MNO7890').getByRole('button', { name: /SOA/ }).click();
  const form = page.getByRole('dialog', { name: 'Editar documento' });
  await expect(form).toContainText('Tiene una foto.');
  await form.getByLabel('Archivo del documento').setInputFiles({ name: 'soa.pdf', mimeType: 'application/pdf', buffer: PDF });
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Sin conexión con el servidor');
  // Tried again: the paper already has the PDF, so it is saved, the PDF stays and the photo it replaced goes.
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Documento guardado.');
  const pdf = seen.uploads[0] as string;
  expect(new Set(seen.uploads)).toEqual(new Set([pdf]));
  await expect.poll(() => seen.deletes).toHaveLength(1);
  expect(seen.deletes[0]).not.toBe(pdf);
  await group(page, 'MNO7890').getByRole('button', { name: 'Ver PDF' }).click();
  await expect(page.getByRole('dialog', { name: /^SOA/ }).getByRole('link', { name: 'Abrir el PDF' })).toBeVisible();
});
