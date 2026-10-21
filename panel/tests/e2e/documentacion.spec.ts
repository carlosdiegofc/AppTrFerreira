// Documentación with the invented data of db/seed.sql: the papers of trucks and drivers grouped by whose they are, their
// state, the filters, and their files (a photo and a PDF), private and opened with a link that expires.
import { expect, type Page, test } from '@playwright/test';
import { open, prepare, shot, signIn, stat } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

const groups = (page: Page) => page.locator('.paper-group');
const group = (page: Page, owner: string) => page.locator('.paper-group', { has: page.locator('.card-title', { hasText: owner }) });
const chip = (page: Page, name: string) => page.locator('.list-bar .chip', { hasText: name });

test('los papeles de camiones y choferes, con su estado y su archivo', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await open(page, 'Documentación');
  await expect(page.getByRole('heading', { name: 'Documentación' })).toBeVisible();

  await expect(stat(page, 'Vencidos').locator('.stat-value')).toHaveText('1');
  await expect(stat(page, 'Por vencer').locator('.stat-value')).toHaveText('1');
  await expect(stat(page, 'Vigentes').locator('.stat-value')).toHaveText('2');
  await expect(stat(page, 'Sin archivo').locator('.stat-value')).toHaveText('2');

  // The trucks first, then the drivers.
  await expect(groups(page).locator('.card-title')).toHaveText(['Mercedes Benz Actros · GHI9012', 'Scania R450 · DEF5678', 'Volvo FH 460 · ABC1234', 'Ana Pereira', 'Bruno Díaz']);
  await expect(group(page, 'GHI9012')).toContainText('Venció el 12/10/2026 · hace 3 días');
  await expect(group(page, 'GHI9012').locator('.pill')).toHaveText('Vencido');
  await expect(group(page, 'DEF5678')).toContainText('Sin fecha de vencimiento');
  await expect(group(page, 'DEF5678')).toContainText('Sin archivo');
  await expect(group(page, 'Ana Pereira')).toContainText('Vence el 25/10/2026 · en 10 días');
  await expect(group(page, 'Ana Pereira')).toContainText('Categoría E');
  await expect(group(page, 'Ana Pereira').locator('.pill')).toHaveText('Por vencer');
  await expect(group(page, 'Volvo FH 460').locator('.pill')).toHaveText('Vigente');
  await shot(page, 'documentacion');

  // The photo of Ana's licence, and the SOA's PDF in its own tab.
  await group(page, 'Ana Pereira').getByRole('button', { name: 'Ver foto' }).click();
  const photo = page.getByRole('dialog', { name: 'Licencia de conducir · Ana Pereira' });
  await expect(photo.locator('img')).toBeVisible();
  await photo.getByRole('button', { name: 'Cerrar la foto' }).click();
  // While the link of the PDF arrives, the dialog never shows the one of the photo opened before, not even for a moment.
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { shownLinks: string[] }).shownLinks = seen;
    new MutationObserver(() => {
      for (const a of document.querySelectorAll('.photo-dialog a')) seen.push(a.getAttribute('href') ?? '');
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['href'] });
  });
  await group(page, 'GHI9012').getByRole('button', { name: 'Ver PDF' }).click();
  const pdf = page.getByRole('dialog', { name: 'SOA · Mercedes Benz Actros · GHI9012' });
  const link = pdf.getByRole('link', { name: 'Abrir el PDF' });
  await expect(link).toHaveAttribute('target', '_blank');
  const answer = await page.request.get((await link.getAttribute('href')) as string);
  expect(answer.headers()['content-type']).toBe('application/pdf');
  const shown = await page.evaluate(() => (window as unknown as { shownLinks: string[] }).shownLinks);
  expect(shown.length).toBeGreaterThan(0);
  expect(shown.filter((href) => !href.includes('.pdf'))).toEqual([]);
  await pdf.getByRole('button', { name: 'Cerrar' }).click();

  // Filters: drivers only, by state, whose, and words; they stay in the address.
  await chip(page, 'Choferes').click();
  await expect(groups(page).locator('.card-title')).toHaveText(['Ana Pereira', 'Bruno Díaz']);
  await chip(page, 'Todos').click();
  await page.getByLabel('Estado').selectOption({ label: 'Vencidos' });
  await expect(groups(page).locator('.card-title')).toHaveText(['Mercedes Benz Actros · GHI9012']);
  await page.getByLabel('Estado').selectOption({ label: 'Todos los estados' });
  await group(page, 'Volvo FH 460').getByRole('button', { name: 'Ver solo este camión' }).click();
  await expect(groups(page)).toHaveCount(1);
  await page.reload();
  await expect(page.getByLabel('De quién')).toHaveValue('vehicle:Volvo FH 460 · ABC1234');
  await page.getByLabel('De quién').selectOption({ label: 'Todos' });
  await page.getByLabel('Buscar').fill('carne');
  await expect(groups(page).locator('.card-title')).toHaveText(['Bruno Díaz']);
});

test('los avisos de Inicio llevan a su sección', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await page.locator('.alert-line', { hasText: 'Cambio de aceite · JKL3456' }).click();
  await expect(page.getByRole('heading', { name: 'Mantenimiento' })).toBeVisible();
  await open(page, 'Inicio');
  await page.locator('.alert-line', { hasText: 'SOA · GHI9012' }).click();
  await expect(page.getByRole('heading', { name: 'Documentación' })).toBeVisible();
});
