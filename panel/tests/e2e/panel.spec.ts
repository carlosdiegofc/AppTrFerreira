// The panel in a real browser against PostgREST and the local copy of the database structure, with invented data
// (tests/e2e/db/seed.sql). The browser clock is fixed at the seed's base instant: 15/10/2026 at noon in Uruguay.
import { mkdirSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

const BASE = process.env.PANEL_E2E_BASE ?? '2026-10-15T15:00:00Z';
const SHOTS = 'tests/e2e/shots';
// 1×1 grey PNG: map tiles are never fetched from OpenStreetMap during the tests.
const TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN89+7dfwAJ6QPbJ1DSWgAAAABJRU5ErkJggg==', 'base64');

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(BASE));
  await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ contentType: 'image/png', body: TILE }));
});

async function signIn(page: Page, email: string, password = 'clave-de-prueba') {
  await page.goto('./');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

/** Opens a section from the side menu, which on phones sits behind the menu button. */
async function open(page: Page, section: string) {
  await expect(page.locator('main#contenido')).toBeVisible();
  const menu = page.getByRole('button', { name: 'Abrir el menú' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation').getByRole('link', { name: new RegExp(`^${section}`) }).click();
}

const stat = (page: Page, label: string) => page.locator('.stat', { hasText: label });
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png`, fullPage: true });

test('rechaza una contraseña incorrecta', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy', 'otra-clave');
  await expect(page.getByRole('alert')).toHaveText('El correo o la contraseña no son correctos.');
});

test('una cuenta de chofer no entra al panel', async ({ page }) => {
  await signIn(page, 'chofer1@ejemplo.uy');
  await expect(page.getByRole('heading', { name: 'Esta cuenta no tiene acceso' })).toBeVisible();
  await page.getByRole('button', { name: 'Ingresar con otra cuenta' }).click();
  await expect(page.getByLabel('Correo')).toBeVisible();
});

test('un administrador que no está en la lista del panel tampoco entra', async ({ page }) => {
  await signIn(page, 'admin@ejemplo.uy');
  await expect(page.getByRole('heading', { name: 'Esta cuenta no tiene acceso' })).toBeVisible();
});

test('el inicio muestra la flota, los viajes de hoy y lo que hay que tener en cuenta', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Buen día, Dueño');
  await expect(stat(page, 'En ruta').locator('.stat-value')).toHaveText('1');
  await expect(stat(page, 'Detenidos').locator('.stat-value')).toHaveText('2');
  await expect(stat(page, 'Detenidos')).toContainText('1 sin señal');
  // The truck saved with an older label without plate still counts as busy: two idle trucks, not three.
  await expect(stat(page, 'Sin viaje').locator('.stat-value')).toHaveText('2');
  await expect(stat(page, 'Viajes hoy').locator('.stat-value')).toHaveText('4');
  await expect(stat(page, 'Viajes hoy')).toContainText('3 en curso');
  // The trip of 08:30 was sent to the trash in the old panel.
  await expect(page.locator('.trip-time')).toHaveText(['11:00', '10:00', '09:00', '06:00']);
  await expect(page.locator('.alert-line strong')).toHaveText(['SOA · GHI9012', 'Frenos · ABC1234', 'Cambio de aceite · DEF5678', 'Licencia de conducir · Ana Pereira']);
  await expect(page.locator('.alert-line').first()).toContainText('Venció el 12/10/2026');
  await expect(page.locator('.map-home .fm')).toHaveCount(5);
  await shot(page, 'inicio');

  // The session survives a reload.
  await page.reload();
  await expect(stat(page, 'En ruta').locator('.stat-value')).toHaveText('1');
});

test('el GPS en vivo filtra la flota y sigue a un camión con su recorrido', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'GPS en vivo');
  await expect(page.getByRole('heading', { name: 'GPS en vivo', level: 1 })).toBeVisible();
  const chip = (name: string) => page.locator('.chip', { hasText: name });
  await expect(chip('Todos')).toContainText('5');
  await expect(chip('En ruta')).toContainText('1');
  await expect(chip('Detenidos')).toContainText('2');
  await expect(chip('Sin viaje')).toContainText('2');
  await expect(page.getByRole('button', { name: /Mercedes Benz Actros · GHI9012 Carla Méndez · Sin señal/ })).toBeVisible();

  await page.getByRole('button', { name: /Volvo FH 460 · ABC1234/ }).click();
  const detail = page.locator('.unit-detail');
  await expect(detail).toContainText('Ana Pereira');
  await expect(detail).toContainText('78 km/h');
  await expect(detail).toContainText('152 km');
  // The reading without a fix is not counted nor drawn.
  await expect(detail.locator('dd').last()).toHaveText('12');
  // Three stretches: the trip was paused once and the signal was lost for five minutes.
  await expect(page.locator('path.fm-route')).toHaveCount(3);
  await expect(page).toHaveURL(/camion=trip%3A10000000-0000-4000-8000-00000000000a/);
  await shot(page, 'gps');

  await chip('Sin viaje').click();
  await expect(page.locator('.units > li')).toHaveCount(2);
});

test('las secciones que faltan dicen qué van a hacer y la sesión se cierra', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await expect(stat(page, 'En ruta')).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link')).toHaveCount(12);
  await open(page, 'Viajes');
  await expect(page.getByRole('heading', { name: 'Próximamente' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Abrir el panel actual/ })).toHaveAttribute('href', 'https://carlosdiegofc.github.io/AppTrFerreira/');
  await shot(page, 'proximamente');

  const menu = page.getByRole('button', { name: 'Abrir el menú' });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page.getByLabel('Correo')).toBeVisible();
});

test('una cuenta que solo lee la flota también entra', async ({ page }) => {
  await signIn(page, 'lectura@ejemplo.uy');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Buen día, Socio');
  await expect(stat(page, 'En ruta').locator('.stat-value')).toHaveText('1');
});

test('modo oscuro', async ({ page }) => {
  test.skip(test.info().project.name !== 'escritorio', 'una captura alcanza');
  await page.emulateMedia({ colorScheme: 'dark' });
  await signIn(page, 'dueno@ejemplo.uy');
  await expect(stat(page, 'En ruta').locator('.stat-value')).toHaveText('1');
  await expect(page.locator('.map-home .fm')).toHaveCount(5);
  await shot(page, 'inicio-oscuro');
});
