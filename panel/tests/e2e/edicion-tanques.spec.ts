// Saving tanks in a real browser: a truck's tank and consumption, a measurement, a load marked «Tanque lleno» from the
// receipt's correction, and a new receipt typed with its time and a full tank. Saving changes the test data, so this
// file runs after the read-only tests (project "edicion" in playwright.config.ts), in this order.
import { expect, test } from '@playwright/test';
import { open, prepare, shot, signIn } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

test('se carga el tanque de un camión en km por litro y se mide lleno', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Combustible');
  await page.getByRole('group', { name: 'Vista' }).getByRole('button', { name: /Tanques/ }).click();
  const scania = page.getByRole('list', { name: 'Tanques' }).getByRole('listitem').filter({ hasText: 'Scania R450 · DEF5678' });
  await scania.getByRole('button', { name: 'Configurar tanque' }).click();
  const form = page.getByRole('dialog', { name: 'Tanque de Scania R450 · DEF5678' });
  await form.getByLabel('Le entran (litros)').fill('500');
  // 30 km per litre is not a truck's.
  await form.getByLabel('Kilómetros por litro').fill('30');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toContainText('Entre 0,5 y 20 km por litro: un camión suele hacer entre 2 y 4.');
  await form.getByLabel('Kilómetros por litro').fill('2,5');
  await expect(form).toContainText('Vacío: avisa con el 20 % del tanque, 100 L.');
  await shot(page, 'combustible-tanque-config');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Tanque de Scania R450 · DEF5678 guardado.');
  await expect(scania).toContainText('Le entran 500 L · 2,5 km por litro · avisa con 100 L');
  await expect(scania).toContainText('Falta saber cuánto tiene');

  // Full now: Bruno's trip so far and his load before are inside the measurement.
  await scania.getByRole('button', { name: 'Medir el tanque' }).click();
  const measure = page.getByRole('dialog', { name: 'Medir el tanque de Scania R450 · DEF5678' });
  await measure.getByRole('radio', { name: 'Tiene otra cantidad' }).check();
  await measure.getByLabel('Litros que tiene').fill('600');
  await measure.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(measure).toContainText('No le entran más de 500 litros.');
  await measure.getByRole('radio', { name: /Está lleno/ }).check();
  await measure.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Tanque de Scania R450 · DEF5678: lleno desde ahora.');
  await expect(scania).toContainText('≈ 500 L');
  await expect(scania).toContainText('100 % del tanque · rinde ≈ 1.250 km');
});

test('una carga marcada «Tanque lleno» al corregir la boleta arranca el tanque desde lleno', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Combustible');
  await page.getByRole('group', { name: 'Vista' }).getByRole('button', { name: /Boletas/ }).click();
  await page.getByLabel('Período').selectOption({ label: 'Últimos 30 días' });
  // Ana's load of twenty days ago, in the Iveco.
  await page.getByRole('list', { name: 'Boletas' }).getByRole('listitem').filter({ hasText: 'Iveco Stralis · MNO7890' }).getByRole('button', { name: /Boleta del/ }).click();
  const form = page.getByRole('dialog', { name: 'Corregir boleta' });
  await expect(form).toContainText('Tanque lleno: no se dijo');
  await form.getByRole('checkbox', { name: 'Llenó el tanque' }).check();
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Boleta corregida.');

  await page.getByRole('group', { name: 'Vista' }).getByRole('button', { name: /Tanques/ }).click();
  // Full since then: the Iveco's trip of 132 km yesterday, at 3,2 km per litre.
  const iveco = page.getByRole('list', { name: 'Tanques' }).getByRole('listitem').filter({ hasText: 'Iveco Stralis · MNO7890' });
  await expect(iveco).toContainText('≈ 359 L');
  await expect(iveco).toContainText('Desde el tanque lleno del 25/09/2026 a las 12:00 en Ancap Ruta 5 km 32: 132 km y 0 L cargados.');
});

test('una boleta cargada en el panel con el tanque lleno cuenta los viajes desde la hora de la boleta', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Combustible');
  await page.getByRole('button', { name: 'Nueva boleta' }).click();
  const form = page.getByRole('dialog', { name: 'Nueva boleta' });
  await expect(form.getByLabel('Hora de la boleta')).toHaveValue('12:00');
  await form.getByLabel('Estación', { exact: true }).selectOption({ label: 'Ancap Ruta 5 km 32' });
  await form.getByLabel('Camión').fill('Ford Cargo 1722 · JKL3456');
  await form.getByLabel('Litros').fill('210');
  await form.getByLabel('Importe').fill('12.000');
  await form.getByRole('checkbox', { name: 'Llenó el tanque' }).check();
  await form.getByLabel('Hora de la boleta').fill('12:30');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(form).toContainText('La hora no puede ser posterior a ahora.');
  // Loaded at 05:30, before Diego's trip of 95 km this morning: that trip comes after the full tank.
  await form.getByLabel('Hora de la boleta').fill('05:30');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Boleta cargada.');

  await page.getByRole('group', { name: 'Vista' }).getByRole('button', { name: /Tanques/ }).click();
  const ford = page.getByRole('list', { name: 'Tanques' }).getByRole('listitem').filter({ hasText: 'Ford Cargo 1722 · JKL3456' });
  await expect(ford).toContainText('≈ 268 L');
  await expect(ford).toContainText('Desde el tanque lleno del 15/10/2026 a las 05:30 en Ancap Ruta 5 km 32: 95 km y 0 L cargados.');
  await expect(ford).not.toContainText('Combustible bajo');
});
