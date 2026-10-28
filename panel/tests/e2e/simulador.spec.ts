// The freight simulator, in Gastos y finanzas: the cost of a freight and its price with the margin on top, with the
// consumption of the chosen truck and the price of the last receipt. It saves nothing. Read only: the seed's data.
import { expect, type Page, test } from '@playwright/test';
import { open, prepare, shot, signIn } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

async function openSimulador(page: Page) {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Gastos y finanzas');
  await page.getByRole('navigation', { name: 'Partes de Gastos y finanzas' }).getByRole('link', { name: 'Simulador' }).click();
  await expect(page).toHaveURL(/\/finanzas\/simulador$/);
}

test('calcula el costo y el precio de un flete, con el margen sobre el costo', async ({ page }) => {
  await openSimulador(page);
  const result = page.getByRole('region', { name: 'Precio del flete' });
  await expect(result).toContainText('Para calcularlo, escribí los kilómetros, el consumo y el precio del gasoil.');

  // The Ford brings the consumption of its tank in Combustible; the price, the last receipt in pesos.
  await page.getByLabel('Camión').selectOption({ label: 'Ford Cargo 1722 · JKL3456' });
  await expect(page.getByLabel('Consumo')).toHaveValue('3');
  await expect(page.getByText('Trae su consumo: 3 km por litro, el de su tanque en Combustible.')).toBeVisible();
  await page.getByLabel('Kilómetros con carga').fill('300');
  await page.getByLabel('Kilómetros de vuelta').fill('300');
  await expect(result).toContainText('Para calcularlo, escribí el precio del gasoil.');
  await expect(page.locator('.hint', { hasText: 'La última boleta en pesos' })).toContainText('$ 54,52 el litro, del 15/10/2026 en Ancap Ruta 5 km 32.');
  await page.getByRole('button', { name: 'Usar ese' }).click();
  await expect(page.getByLabel('Precio del gasoil')).toHaveValue('54,52');
  await page.getByLabel('Peajes de la ruta').fill('1.800');
  await page.getByLabel('Lo que se le paga al chofer').fill('4.500');
  await page.getByLabel('Margen').fill('20');

  // 600 km at 3 km per litre: 200 litres at $ 54,52.
  await expect(result.locator('.sim-price strong')).toHaveText('$ 20.644,80');
  await expect(result).toContainText('$ 68,82 por kilómetro con carga');
  const line = (name: RegExp) => result.getByRole('row').filter({ has: page.getByRole('rowheader', { name }) });
  await expect(line(/^Combustible/)).toContainText('200 litros para 600 km');
  await expect(line(/^Combustible/)).toContainText('$ 10.904');
  await expect(line(/^Costo/)).toContainText('$ 17.204');
  await expect(line(/^Costo/)).toContainText('$ 28,67 por kilómetro recorrido');
  await expect(line(/^Margen de 20 %/)).toContainText('$ 3.440,80');
  await expect(line(/^Precio/)).toContainText('$ 20.644,80');
  await shot(page, 'simulador');

  // A wrong number says so, and the result waits for it.
  await page.getByLabel('Margen').fill('-5');
  await expect(page.getByText('No puede ser negativo.')).toBeVisible();
  await expect(result).toContainText('Revisá los datos marcados.');

  await page.getByRole('button', { name: 'Empezar de nuevo' }).click();
  await expect(page.getByLabel('Kilómetros con carga')).toHaveValue('');
  await expect(page.getByLabel('Camión')).toHaveValue('');
  await expect(result).toContainText('Para calcularlo, escribí los kilómetros, el consumo y el precio del gasoil.');
});

test('un camión sin consumo no se queda con el del camión anterior, pero sí con el escrito a mano', async ({ page }) => {
  await openSimulador(page);
  const truck = page.getByLabel('Camión');
  const consumption = page.getByLabel('Consumo');
  await truck.selectOption({ label: 'Ford Cargo 1722 · JKL3456' });
  await expect(consumption).toHaveValue('3');
  // The Scania has no tank in Combustible yet: the Ford's consumption goes away with the Ford.
  await truck.selectOption({ label: 'Scania R450 · DEF5678' });
  await expect(consumption).toHaveValue('');
  await expect(page.getByText('Todavía no tiene un consumo: escribilo abajo, o cargalo en Combustible, en «Tanques».')).toBeVisible();
  // One typed by hand stays.
  await consumption.fill('2,8');
  await truck.selectOption({ label: 'Mercedes Benz Actros · GHI9012' });
  await expect(consumption).toHaveValue('2,8');
});

test('el precio del gasoil que ofrece no sale de una boleta con fecha posterior a hoy', async ({ page }) => {
  // The browser two days before the seed: the receipts of 15/10 are dated after «today», like a receipt with a wrong date.
  await page.clock.setFixedTime(new Date('2026-10-13T15:00:00Z'));
  await openSimulador(page);
  // Diego's of 13/10, in pesos: 300 litres for $ 16.500.
  await expect(page.locator('.hint', { hasText: 'La última boleta en pesos' })).toContainText('$ 55 el litro, del 13/10/2026');
  await page.getByRole('button', { name: 'Usar ese' }).click();
  await expect(page.getByLabel('Precio del gasoil')).toHaveValue('55');
});
