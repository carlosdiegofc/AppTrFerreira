// Choferes, as seed.sql leaves it (decision of 22/10/2026): the cards with this month's work, papers and salary, the app
// drivers without a card, and a driver's card with the salary month by month. Nothing here saves.
import { expect, test } from '@playwright/test';
import { open, prepare, shot, signIn } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

test('Choferes lista las fichas con su mes, sus papeles y su sueldo, y los de la app sin ficha', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Choferes');
  await expect(page.getByRole('heading', { name: 'Choferes', level: 1 })).toBeVisible();
  const views = page.getByRole('group', { name: 'Vista' });
  await expect(views.getByRole('button', { name: /Con ficha/ })).toContainText('3');
  await expect(views.getByRole('button', { name: /Sin ficha/ })).toContainText('2');
  await expect(views.getByRole('button', { name: /Ya no trabajan/ })).toContainText('1');
  // What is left to pay this month, of the salaries loaded: Ana's.
  await expect(page.locator('.stat', { hasText: 'Falta pagar de octubre' })).toContainText('$ 35.000');

  const list = page.getByRole('list', { name: 'Choferes' });
  const ana = list.getByRole('listitem').filter({ hasText: 'Ana Pereira' });
  await expect(ana).toContainText('En viaje');
  await expect(ana).toContainText('Libreta por vencer');
  await expect(ana).toContainText('Falta $ 35.000');
  const bruno = list.getByRole('listitem').filter({ hasText: 'Bruno Díaz' });
  await expect(bruno).toContainText('Sin sueldo cargado');
  const eduardo = list.getByRole('listitem').filter({ hasText: 'Eduardo Núñez' });
  await expect(eduardo).toContainText('Sin cuenta de la app');
  await expect(eduardo).toContainText('Sin sueldo ni pagos');
  await expect(list.getByRole('listitem').filter({ hasText: 'Ramón Sosa' })).toHaveCount(0);
  await shot(page, 'choferes');

  // The app drivers without a card, to create it.
  await views.getByRole('button', { name: /Sin ficha/ }).click();
  await expect(page).toHaveURL(/vista=sin-ficha/);
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list.getByRole('listitem').filter({ hasText: 'Carla Méndez' }).getByRole('button', { name: 'Crear ficha' })).toBeVisible();
  await expect(list.getByRole('listitem').filter({ hasText: 'Diego Silva' })).toBeVisible();
  await views.getByRole('button', { name: /Ya no trabajan/ }).click();
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('Ramón Sosa');
});

test('la ficha muestra los datos, la libreta, el mes y el sueldo mes a mes con cada pago', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Choferes');
  await page.getByRole('list', { name: 'Choferes' }).getByRole('link', { name: 'Ana Pereira' }).click();
  await expect(page.getByRole('heading', { name: 'Ana Pereira', level: 1 })).toBeVisible();
  const data = page.locator('.card', { has: page.getByRole('heading', { name: 'Datos' }) });
  await expect(data).toContainText('099 111 222');
  await expect(data).toContainText('1.111.111-1');
  await expect(data).toContainText('1 año y 7 meses');
  await expect(data).toContainText('Categoría E');
  await expect(data).toContainText('Vence el 25/10/2026');
  await expect(data).toContainText('Transferencia · BROU · cuenta 001122334-00001');
  await expect(page.locator('.card', { has: page.getByRole('heading', { name: 'Papeles' }) })).toContainText('Licencia de conducir');

  const months = page.getByRole('table', { name: 'Sueldo por mes' });
  const october = months.getByRole('row').filter({ hasText: 'Octubre de 2026' });
  await expect(october).toContainText('$ 45.000');
  await expect(october).toContainText('$ 10.000');
  await expect(october).toContainText('Falta $ 35.000');
  await expect(october).toContainText('Aparte del sueldo: Viático $ 3.500');
  const september = months.getByRole('row').filter({ hasText: 'Setiembre de 2026' });
  await expect(september).toContainText('Al día');
  await expect(september).toContainText('Transferencia BROU');
  // Only the months since her first salary or payment (the column titles are hidden on a phone).
  await expect(months.getByRole('row').filter({ hasText: / de 20\d\d/ })).toHaveCount(2);
  await expect(page.getByRole('group', { name: 'Año' })).toHaveCount(0);
  await shot(page, 'chofer-ficha');

  // The links to her trips and her papers.
  await expect(page.getByRole('link', { name: 'Ver sus viajes' })).toHaveAttribute('href', /chofer=Ana%20Pereira/);
  await expect(page.getByRole('link', { name: 'Ir a Documentación' })).toHaveAttribute('href', /de=driver%3A00000000-0000-4000-8000-000000000011/);
});

test('una ficha que no existe lo dice', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Choferes');
  await page.goto('./#/choferes/70000000-0000-4000-8000-0000000000ff');
  await expect(page.getByText('No encontramos esa ficha')).toBeVisible();
});
