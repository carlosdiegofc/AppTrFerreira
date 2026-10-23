import { expect, test } from '@playwright/test';
import { open, prepare, shot, signIn } from './helpers';
test.beforeEach(async ({ page }) => prepare(page));
test('punto, tarifa, cuenta individual y medición del tanque', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await open(page, 'GPS');
  await page.getByRole('button', { name: 'Peajes, balanzas y radares', exact: true }).click();
  await page.getByRole('button', { name: 'Ingresar coordenadas' }).click();
  let form = page.getByRole('dialog');
  await form.getByLabel('Nombre', { exact: true }).fill('Peaje de ensayo');
  await form.getByLabel('Latitud').fill('-34');
  await form.getByLabel('Longitud').fill('-56');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.locator('.road-point').filter({ hasText: 'Peaje de ensayo' })).toBeVisible();
  await page.locator('.units button').filter({ hasText: 'ABC1234' }).click();
  await expect(page.getByRole('link', { name: 'Google Maps', exact: true })).toHaveAttribute('href', /maps\/search/);
  await page.getByRole('button', { name: 'Recarga / ajuste' }).click();
  form = page.getByRole('dialog');
  await form.getByLabel('Importe en UYU').fill('20000');
  await form.getByLabel('Motivo / comprobante').fill('Recarga de prueba');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.locator('.road-truck h3').first()).toContainText('20.000');
  await page.getByText('Tarifas de peajes', { exact: true }).click();
  await page
    .locator('.road-truck .road-point')
    .filter({ hasText: 'Peaje de ensayo' })
    .getByRole('button', { name: 'Cambiar precio' })
    .click();
  await page.getByRole('dialog').getByLabel('Precio UYU').fill('250');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('.road-truck .road-point').filter({ hasText: 'Peaje de ensayo' })).toContainText('250');
  // The same tank as in Combustible: measured with 40 litres, under its alert of 80.
  await page.getByRole('button', { name: 'Medir el tanque' }).click();
  form = page.getByRole('dialog');
  await form.getByRole('radio', { name: 'Tiene otra cantidad' }).check();
  await form.getByLabel('Litros que tiene').fill('40');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.locator('.road-truck')).toContainText('Combustible bajo');
  await page.getByRole('button', { name: 'Mis puntos', exact: true }).click();
  await expect(page.locator('.road-controls')).not.toContainText('Peaje de ensayo');
  await shot(page, 'gps-control-ruta');
  await page.locator('.units button').filter({ hasText: 'DEF5678' }).click();
  await expect(page.locator('.road-truck h3').first()).not.toContainText('20.000');
  await page.setViewportSize({width:393,height:851});
  await page.getByRole('button',{name:'Peajes, balanzas y radares',exact:true}).click();
  const point = page.locator('.road-controls .road-point').filter({hasText:'Peaje de ensayo'});
  await point.getByRole('button',{name:'Editar',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.getByRole('dialog').evaluate(el => el.getBoundingClientRect().width)).toBeLessThan(393);
  await shot(page,'gps-punto-celular');
  await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
  await point.getByRole('button',{name:'Archivar',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Archivar',exact:true}).click();
  await expect(point).toHaveCount(0);
});
