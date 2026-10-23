// Choferes, as seed.sql leaves it (decision of 22/10/2026): the cards with this month's work, papers and salary, the app
// drivers without a card, and a driver's card with the salary month by month. Nothing here saves.
import { expect, test } from '@playwright/test';
import { open, prepare, rows, shot, signIn } from './helpers';

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
  // He stopped working before this month: this month has no salary for him, and his card stops in his last month.
  await expect(list.getByRole('listitem')).not.toContainText('Falta');
  await list.getByRole('link', { name: 'Ramón Sosa' }).click();
  await expect(page.locator('.card', { has: page.getByRole('heading', { name: 'Datos' }) })).toContainText('31/08/2026');
  await expect(page.getByText('Dejó de trabajar el 31/08/2026: los meses siguientes no llevan sueldo.')).toBeVisible();
  // His last salary, not a current one.
  await expect(page.locator('.card', { has: page.getByRole('heading', { name: 'Sueldo' }) })).toContainText('Último sueldo$ 30.000 desde julio de 2026');
  // His settlement, for September, shows without a salary in that month.
  const months = page.getByRole('table', { name: 'Sueldo por mes' }).getByRole('row').filter({ hasText: / de 20\d\d/ });
  await expect(months).toHaveCount(3);
  await expect(months.nth(0)).toContainText('Setiembre de 2026');
  await expect(months.nth(0)).toContainText('Después del egreso');
  await expect(months.nth(0)).toContainText('Liquidación');
  await expect(months.nth(0)).not.toContainText('Falta');
  await expect(months.nth(1)).toContainText('Agosto de 2026');
  await expect(months.nth(1)).toContainText('Falta $ 30.000');
  // More than a month later he cannot be marked as working again: his salary would count the months without work.
  await page.getByRole('button', { name: 'Editar ficha' }).click();
  const card = page.getByRole('dialog', { name: 'Ficha de Ramón Sosa' });
  await expect(card.getByLabel('Ya no trabaja en la empresa (la ficha queda guardada, con sus pagos)')).toBeDisabled();
  await expect(card).toContainText('Dejó de trabajar el 31/08/2026. Si vuelve, creá una ficha nueva');
  await card.getByRole('button', { name: 'Cancelar' }).click();
  // A new salary for him starts in his last month, and not after it: those months have no salary.
  await page.getByRole('button', { name: 'Cambiar sueldo' }).click();
  const salary = page.getByRole('dialog', { name: 'Sueldo de Ramón Sosa' });
  await expect(salary.getByLabel('Desde el mes')).toHaveValue('2026-08');
  await salary.getByLabel('Sueldo por mes').fill('31.000');
  await salary.getByLabel('Desde el mes').fill('2026-09');
  await salary.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(salary).toContainText('Dejó de trabajar en agosto de 2026: el sueldo tiene que empezar ese mes o antes.');
  await salary.getByRole('button', { name: 'Cancelar' }).click();
  await salary.getByRole('button', { name: 'Salir sin guardar' }).click();
  await expect(salary).toBeHidden();
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

  await expect(page.getByRole('link', { name: 'Ir a Documentación' })).toHaveAttribute('href', /de=driver%3A00000000-0000-4000-8000-000000000011/);

  // Her trips of the month as the card counts them: her account's, and the one typed in the panel with her name.
  await page.getByRole('link', { name: 'Ver sus viajes' }).click();
  await expect(page).toHaveURL(/periodo=mes/);
  await expect(page).toHaveURL(/cuenta=00000000-0000-4000-8000-000000000011/);
  await expect(page.getByLabel('Chofer')).toHaveValue('ficha');
  await expect(page.getByLabel('Chofer').locator('option:checked')).toHaveText('Ana Pereira (ficha)');
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).last()).toContainText('Cargado a mano · Orden 24101');
  // Another driver in the list leaves the card's filter.
  await page.getByLabel('Chofer').selectOption('Bruno Díaz');
  await expect(page).not.toHaveURL(/cuenta=/);
  await expect(rows(page)).toHaveCount(1);
});

test('si no se pueden leer los papeles, lo dice y no los da por al día', async ({ page }) => {
  await page.route('**/rest/v1/trf_documents*', (route) => route.fulfill({ status: 500, json: { message: 'Falla de prueba' } }));
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Choferes');
  const note = page.getByRole('alert');
  await expect(note).toContainText('los papeles');
  await expect(note).toContainText('lo que depende de eso se ve con «—»');
  const list = page.getByRole('list', { name: 'Choferes' });
  const ana = list.getByRole('listitem').filter({ hasText: 'Ana Pereira' });
  // The trips and the salary were read; the papers were not.
  await expect(ana).toContainText('3 viajes');
  await expect(ana).toContainText('Falta $ 35.000');
  await expect(ana).not.toContainText('Libreta por vencer');
  await expect(list.getByRole('listitem').filter({ hasText: 'Eduardo Núñez' })).not.toContainText('Al día');

  await list.getByRole('link', { name: 'Ana Pereira' }).click();
  await expect(page.locator('.card', { has: page.getByRole('heading', { name: 'Papeles' }) })).toContainText('No se pudieron leer los papeles.');
  const data = page.locator('.card', { has: page.getByRole('heading', { name: 'Datos' }) });
  await expect(data).toContainText('Categoría E');
  await expect(data).not.toContainText('sin cargar en Documentación');

  // The list of app accounts also reads the papers: the card says it, and so does the form, instead of offering none.
  const accounts = page.getByRole('alert').filter({ hasText: 'cuentas de la app' });
  await expect(accounts).toHaveText(/No se pudo leer la lista de cuentas de la app: se ve con «—», y al editar la ficha no se puede elegir otra cuenta\./);
  const account = data.locator('dl > div').filter({ has: page.locator('dt', { hasText: 'Cuenta de la app' }) }).locator('dd');
  await expect(account).toHaveText('—');
  await page.getByRole('button', { name: 'Editar ficha' }).click();
  const form = page.getByRole('dialog', { name: 'Ficha de Ana Pereira' });
  await expect(form).toContainText('No se pudo leer la lista de cuentas de la app');
  await form.getByRole('button', { name: 'Cancelar' }).click();
  await page.unroute('**/rest/v1/trf_documents*');
  await accounts.getByRole('button', { name: 'Reintentar' }).click();
  await expect(accounts).toHaveCount(0);
  await expect(account).toHaveText('Ana Pereira');
});

test('si una lectura deja de responder después de leerse, avisa que se ve lo último que se leyó', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Choferes');
  const list = page.getByRole('list', { name: 'Choferes' });
  const ana = list.getByRole('listitem').filter({ hasText: 'Ana Pereira' });
  await expect(ana).toContainText('Libreta por vencer');

  // The papers stop answering: «Actualizar» keeps what was read, and says so.
  await page.route('**/rest/v1/trf_documents*', (route) => route.fulfill({ status: 500, json: { message: 'Falla de prueba' } }));
  await page.getByRole('button', { name: 'Actualizar' }).click();
  const note = page.getByRole('alert').filter({ hasText: 'No se pudo actualizar' });
  await expect(note).toHaveText(/No se pudo actualizar: los choferes de la app y los papeles\. Se ve lo último que se leyó\./);
  await expect(ana).toContainText('Libreta por vencer');

  // The card says it too, and «Reintentar» reads them again once they answer.
  await list.getByRole('link', { name: 'Ana Pereira' }).click();
  const cardNote = page.getByRole('alert').filter({ hasText: 'No se pudo actualizar' });
  await expect(cardNote).toHaveText(/No se pudo actualizar: la lista de cuentas de la app y los papeles\. Se ve lo último que se leyó\./);
  await page.unroute('**/rest/v1/trf_documents*');
  await cardNote.getByRole('button', { name: 'Reintentar' }).click();
  await expect(cardNote).toHaveCount(0);
});

test('una ficha que no existe lo dice', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Choferes');
  await page.goto('./#/choferes/70000000-0000-4000-8000-0000000000ff');
  await expect(page.getByText('No encontramos esa ficha')).toBeVisible();
});
