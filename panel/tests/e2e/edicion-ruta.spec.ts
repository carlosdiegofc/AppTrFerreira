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

test('mis puntos van solo con su nombre, y cada punto del mapa con la insignia de lo que es', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await open(page, 'GPS');
  await page.getByRole('button', { name: 'Mis puntos', exact: true }).click();
  await page.getByRole('button', { name: 'Ingresar coordenadas' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Nombre', { exact: true }).fill('Depósito de ensayo');
  await form.getByLabel('Latitud').fill('-34.5');
  await form.getByLabel('Longitud').fill('-56.3');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toBeHidden();
  // In the list and on the map, the name alone, with its flag.
  const point = page.locator('.road-controls .road-point').filter({ hasText: 'Depósito de ensayo' });
  await expect(point.getByRole('button').first()).toHaveText('Depósito de ensayo');
  await expect(point.locator('.point-dot.road-place .road-badge')).toHaveCount(1);
  await point.getByRole('button').first().click();
  const map = page.locator('.gps-map .fleet-map');
  const marker = map.locator('.road-marker.road-place[title="Depósito de ensayo"]');
  await expect(marker.locator('.road-badge')).toHaveCount(1);
  await expect(marker.locator('span')).toHaveText('Depósito de ensayo');
  // Tolls, scales and radars carry theirs too.
  await page.getByRole('button', { name: 'Peajes, balanzas y radares', exact: true }).click();
  for (const kind of ['toll', 'scale', 'radar']) await expect(map.locator(`.road-marker.road-${kind} .road-badge`).first()).toBeAttached();
  await expect(page.locator('.chips .point-dot')).toHaveCount(3);
  await shot(page, 'gps-insignias');
  // The point of the test goes to the archive again.
  await page.getByRole('button', { name: 'Mis puntos', exact: true }).click();
  await point.getByRole('button', { name: 'Archivar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archivar', exact: true }).click();
  await expect(point).toHaveCount(0);
});
