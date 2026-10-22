// Saving in Choferes in a real browser: a card for an app driver, its salary, a payment that is corrected and annulled,
// a card marked as no longer working, and two people changing the same card at once. Saving changes the test data, so
// this file runs after the read-only tests (project "edicion" in playwright.config.ts), in this order.
import { expect, test } from '@playwright/test';
import { open, prepare, shot, signIn } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

test('se crea la ficha de un chofer de la app, con su sueldo y sus pagos, que se corrigen y se anulan', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Choferes');
  await page.getByRole('group', { name: 'Vista' }).getByRole('button', { name: /Sin ficha/ }).click();
  await page.getByRole('list', { name: 'Choferes' }).getByRole('listitem').filter({ hasText: 'Carla Méndez' }).getByRole('button', { name: 'Crear ficha' }).click();

  const card = page.getByRole('dialog', { name: 'Nueva ficha' });
  await expect(card.getByLabel('Nombre y apellido')).toHaveValue('Carla Méndez');
  await expect(card.getByLabel('Cuenta de la app')).toHaveValue('00000000-0000-4000-8000-000000000013');
  await card.getByLabel('Fecha de ingreso').fill('2026-10-16');
  await card.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(card).toContainText('La fecha de ingreso no puede ser posterior a hoy.');
  await card.getByLabel('Fecha de ingreso').fill('2025-03-01');
  await card.getByLabel('Teléfono').fill('097 555 666');
  await card.getByLabel('Cédula').fill('3.333.333-3');
  await card.getByLabel('Categoría de la libreta').fill('e');
  await card.getByLabel('Cómo se le paga').selectOption({ label: 'Transferencia' });
  await card.getByLabel('Banco').fill('Itaú');
  await card.getByLabel('Número de cuenta').fill('1234567');
  await shot(page, 'chofer-nueva-ficha');
  await card.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(card).toBeHidden();
  // The new card opens.
  await expect(page.getByRole('heading', { name: 'Carla Méndez', level: 1 })).toBeVisible();
  const data = page.locator('.card', { has: page.getByRole('heading', { name: 'Datos' }) });
  await expect(data).toContainText('Categoría E');
  await expect(data).toContainText('Transferencia · Itaú · cuenta 1234567');
  await expect(data).toContainText('1 año y 7 meses');

  // The salary, from this month.
  await page.getByRole('button', { name: 'Cargar sueldo' }).click();
  const salary = page.getByRole('dialog', { name: 'Sueldo de Carla Méndez' });
  await expect(salary.getByLabel('Desde el mes')).toHaveValue('2026-10');
  await salary.getByLabel('Sueldo por mes').fill('40.000');
  await expect(salary).toContainText('Se guarda: 40.000');
  await salary.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Sueldo guardado desde octubre de 2026.');
  const months = page.getByRole('table', { name: 'Sueldo por mes' });
  const october = months.getByRole('row').filter({ hasText: 'Octubre de 2026' });
  await expect(october).toContainText('Falta $ 40.000');

  // An advance: it is subtracted from the month; a future date is refused.
  await page.getByRole('button', { name: 'Registrar pago' }).click();
  const payment = page.getByRole('dialog', { name: 'Pago a Carla Méndez' });
  await expect(payment.getByLabel('Forma de pago')).toHaveValue('transferencia');
  await expect(payment.getByLabel('Qué es')).toHaveValue('adelanto');
  await payment.getByLabel('Fecha del pago').fill('2026-10-20');
  await payment.getByLabel('Importe').fill('15.000');
  await payment.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(payment).toContainText('La fecha no puede ser posterior a hoy.');
  await payment.getByLabel('Fecha del pago').fill('2026-10-14');
  await shot(page, 'chofer-pago');
  await payment.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Adelanto registrado para octubre de 2026.');
  await expect(october).toContainText('Falta $ 25.000');
  await expect(october).toContainText('14/10/2026 · Adelanto · $ 15.000');

  // A viático goes apart: it does not change what is left of the salary.
  await page.getByRole('button', { name: 'Registrar pago' }).click();
  await payment.getByLabel('Qué es').selectOption({ label: 'Viático' });
  await expect(payment).toContainText('Se muestra aparte: no se resta del sueldo.');
  await payment.getByLabel('Importe').fill('2.000');
  await payment.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Viático registrado para octubre de 2026.');
  await expect(october).toContainText('Falta $ 25.000');
  await expect(october).toContainText('Aparte del sueldo: Viático $ 2.000');

  // Corrected, and then annulled: nothing is deleted.
  await october.getByRole('button', { name: /Corregir adelanto del 14\/10\/2026/ }).click();
  const fix = page.getByRole('dialog', { name: 'Corregir pago' });
  await fix.getByLabel('Importe').fill('20000');
  await fix.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Pago corregido.');
  await expect(october).toContainText('Falta $ 20.000');
  await october.getByRole('button', { name: /Corregir adelanto del 14\/10\/2026/ }).click();
  await fix.getByRole('button', { name: 'Anular pago' }).click();
  const confirm = page.getByRole('dialog', { name: '¿Anular este pago?' });
  await expect(confirm).toContainText('No se borra');
  await confirm.getByRole('button', { name: 'Anular pago' }).click();
  await expect(page.getByRole('status')).toContainText('Pago anulado: ya no cuenta en el mes.');
  await expect(october).toContainText('Falta $ 40.000');
  await expect(october.getByRole('button', { name: /Corregir adelanto/ })).toHaveCount(0);
  await shot(page, 'chofer-sueldo');

  // Back in the list, Carla has her card and what is left of her month.
  await open(page, 'Choferes');
  await expect(page.getByRole('list', { name: 'Choferes' }).getByRole('listitem').filter({ hasText: 'Carla Méndez' })).toContainText('Falta $ 40.000');
  await expect(page.locator('.stat', { hasText: 'Falta pagar de octubre' })).toContainText('$ 75.000');
});

test('una ficha se marca como que ya no trabaja, y queda con sus pagos', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Choferes');
  await page.getByRole('list', { name: 'Choferes' }).getByRole('link', { name: 'Bruno Díaz' }).click();
  await page.getByRole('button', { name: 'Editar ficha' }).click();
  const card = page.getByRole('dialog', { name: 'Ficha de Bruno Díaz' });
  await card.getByLabel('Ya no trabaja en la empresa (la ficha queda guardada, con sus pagos)').check();
  await card.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Ficha guardada.');
  await expect(page.getByText('Ya no trabaja en la empresa: su ficha y sus pagos quedan guardados.')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Sueldo por mes' })).toContainText('Adelanto en dólares US$ 100');
  await open(page, 'Choferes');
  await page.getByRole('group', { name: 'Vista' }).getByRole('button', { name: /Ya no trabajan/ }).click();
  await expect(page.getByRole('list', { name: 'Choferes' })).toContainText('Bruno Díaz');
});

test('si dos personas cambian la misma ficha a la vez, la segunda no pisa a la primera', async ({ browser }) => {
  const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
  for (const p of [a, b]) {
    await prepare(p);
    await signIn(p, 'dueno@ejemplo.uy');
    await open(p, 'Choferes');
    await p.getByRole('list', { name: 'Choferes' }).getByRole('link', { name: 'Eduardo Núñez' }).click();
    await p.getByRole('button', { name: 'Editar ficha' }).click();
  }
  const formA = a.getByRole('dialog', { name: 'Ficha de Eduardo Núñez' });
  const formB = b.getByRole('dialog', { name: 'Ficha de Eduardo Núñez' });
  await formA.getByLabel('Teléfono').fill('091 000 111');
  await formA.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(a.getByRole('status')).toContainText('Ficha guardada.');

  await formB.getByLabel('Teléfono').fill('092 999 888');
  await formB.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(b.getByRole('alert')).toContainText('Otra persona lo cambió mientras lo tenías abierto');
  // B sees A's phone, not its own.
  await expect(b.locator('.card', { has: b.getByRole('heading', { name: 'Datos' }) })).toContainText('091 000 111');
  await Promise.all([a.close(), b.close()]);
});
