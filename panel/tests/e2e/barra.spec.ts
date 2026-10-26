// The frame of every page (design of 26/10/2026): the bar on top with the account, the search and the bell of the
// notices, and the menu of icons. With the invented data of db/seed.sql; these tests only read.
import { expect, type Page, test } from '@playwright/test';
import { open, prepare, shot, signIn } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

const onPhone = () => test.info().project.name === 'celular';

/** The search box: on a phone it opens from its button. */
async function search(page: Page) {
  await expect(page.locator('main#contenido')).toBeVisible();
  if (onPhone()) await page.getByRole('button', { name: 'Abrir la búsqueda' }).click();
  const box = page.getByRole('combobox', { name: 'Búsqueda en el panel' });
  await box.click();
  return box;
}
const options = (page: Page) => page.getByRole('listbox', { name: 'Resultados' }).getByRole('option');

test('el buscador lleva a una sección, a un camión, a un chofer o a buscar el texto en Viajes', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  let box = await search(page);
  // Empty, it offers the twelve sections.
  await expect(options(page)).toHaveCount(12);
  await box.fill('docu');
  await expect(options(page)).toHaveText([/^Documentación/, /«docu» en Viajes/, /«docu» en Gastos y finanzas/]);
  await shot(page, 'buscador');
  await options(page).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Documentación');

  // A plate written with a space finds the truck; Enter opens the first one.
  box = await search(page);
  await box.fill('abc 1234');
  await expect(options(page).first()).toContainText('Volvo FH 460 · ABC1234');
  await expect(options(page).first()).toContainText('Con Semirremolque Randon · REM1001');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Volvo FH 460 · ABC1234');
  await expect(box).toHaveValue('');

  // A driver's card without the accent, and the trailers that left too.
  box = await search(page);
  await box.fill('nunez');
  await expect(options(page).first()).toContainText('Eduardo Núñez');
  await box.fill('pastrana');
  await expect(options(page).first()).toContainText('Acoplado Pastrana · OLD0099');
  await expect(options(page).first()).toContainText('De baja');

  // The arrows move to the search of the text in Viajes, over the last 90 days.
  await box.fill('molino');
  await expect(options(page)).toHaveText([/«molino» en Viajes/, /«molino» en Gastos y finanzas/]);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Viajes');
  await expect(page).toHaveURL(/periodo=90&buscar=molino/);
  await expect(page.locator('.trip-rows > li')).toHaveCount(1);
  await expect(page.locator('.trip-rows > li').first()).toContainText('Molino San José');

  // Esc empties the box first, and then closes it.
  box = await search(page);
  await box.fill('xyz');
  await expect(page.getByRole('listbox', { name: 'Resultados' })).toContainText('No hay camiones, acoplados, choferes ni secciones con «xyz».');
  await page.keyboard.press('Escape');
  await expect(box).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox', { name: 'Resultados' })).toBeHidden();
});

test('la campana cuenta los avisos de Inicio en cualquier sección y lleva a cada uno', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Viajes');
  const bell = page.getByRole('button', { name: /^Avisos/ });
  // The Ford low on fuel, two things expired and three close: the same six of Inicio.
  await expect(bell).toHaveAccessibleName('Avisos: 6');
  await expect(bell.locator('.badge')).toHaveText('6');
  await bell.click();
  const notices = page.locator('#avisos');
  await expect(notices.getByRole('heading')).toHaveText('Para tener en cuenta');
  await expect(notices.locator('.alert-line')).toHaveCount(6);
  await expect(notices.locator('.alert-line').first()).toContainText('Ford Cargo 1722 · JKL3456');
  await expect(notices.locator('.alert-line').first()).toContainText('Combustible bajo');
  await shot(page, 'avisos');
  // Esc closes it and goes back to the bell.
  await page.keyboard.press('Escape');
  await expect(notices).toBeHidden();
  await expect(bell).toBeFocused();
  await bell.click();
  await notices.locator('.alert-line', { hasText: 'SOA · GHI9012' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Documentación');
  await expect(notices).toBeHidden();
});

test('la cuenta de la barra tiene el tema y «Salir»', async ({ page }) => {
  test.skip(onPhone(), 'en el celular están en el menú, como antes');
  await signIn(page, 'dueno@ejemplo.uy');
  const account = page.getByRole('button', { name: 'Tu cuenta: Dueño de Prueba' });
  await expect(account.locator('.avatar')).toHaveText('DP');
  await account.click();
  const menu = page.locator('#cuenta');
  await expect(menu).toContainText('dueno@ejemplo.uy');
  await menu.getByRole('button', { name: 'Oscuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await shot(page, 'cuenta-oscuro');
  // A click outside closes it; the choice stays.
  await page.getByRole('heading', { level: 1 }).click();
  await expect(menu).toBeHidden();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await account.click();
  await menu.getByRole('button', { name: 'Como la computadora' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
});

test('el menú de íconos dice el nombre de cada sección y marca la abierta', async ({ page }) => {
  test.skip(onPhone(), 'en el celular el menú tiene los nombres a la vista');
  await signIn(page, 'dueno@ejemplo.uy');
  const nav = page.getByRole('navigation');
  await expect(nav.getByRole('link')).toHaveCount(12);
  const fleet = nav.getByRole('link', { name: 'Flota' });
  await expect(fleet.locator('.side-label')).toHaveCSS('opacity', '0');
  await fleet.hover();
  await expect(fleet.locator('.side-label')).toHaveCSS('opacity', '1');
  await fleet.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Flota');
  await expect(fleet).toHaveClass(/is-active/);
  // The sections still to come say so in their name too.
  await expect(nav.getByRole('link', { name: /^Asistente IA/ })).toHaveAccessibleName(/^Asistente IA ?Pronto$/);
});
