// Flota, as seed.sql leaves it (decision of 24/10/2026): the trucks of the catalog with their card, their trailer and
// what the other sections know of each, the urgent ones first; a truck's card; the trailers and the ones sold. Nothing
// here saves.
import { expect, type Page, test } from '@playwright/test';
import { open, prepare, shot, signIn, stat } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

const trucks = (page: Page) => page.getByRole('list', { name: 'Camiones' }).getByRole('listitem');
const card = (page: Page, title: string) => page.locator('.card', { has: page.getByRole('heading', { name: title, exact: true }) });

test('Flota lista los camiones del catálogo con su ficha, su acoplado y lo que se sabe de cada uno', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Flota');
  await expect(page.getByRole('heading', { name: 'Flota', level: 1 })).toBeVisible();
  const views = page.getByRole('group', { name: 'Vista' });
  await expect(views.getByRole('button', { name: /Camiones/ })).toContainText('5');
  await expect(views.getByRole('button', { name: /Acoplados/ })).toContainText('2');
  await expect(views.getByRole('button', { name: /De baja/ })).toContainText('1');
  await expect(stat(page, 'Camiones')).toContainText('1 con ficha');
  await expect(stat(page, 'En viaje ahora')).toContainText('3');
  // The Ford is low on fuel, the Mercedes has a paper expired and the Volvo its brakes service: they go first, then the
  // Scania with its oil change coming up, then the Iveco.
  await expect(stat(page, 'Para atender')).toContainText('4');
  await expect(trucks(page).locator('h2')).toHaveText(['Ford Cargo 1722 · JKL3456', 'Mercedes Benz Actros · GHI9012', 'Volvo FH 460 · ABC1234', 'Scania R450 · DEF5678', 'Iveco Stralis · MNO7890']);

  const ford = trucks(page).filter({ hasText: 'Ford Cargo 1722' });
  await expect(ford).toContainText('≈ 58 L · bajo');
  await expect(ford).toContainText('≈ 412.095 km');
  await expect(ford).toContainText('Próximo Cambio de aceite');
  await expect(ford).toContainText('Sin ficha');
  await expect(ford.getByRole('button', { name: 'Crear ficha' })).toBeVisible();
  const volvo = trucks(page).filter({ hasText: 'Volvo FH 460' });
  await expect(volvo).toContainText('En ruta Ana Pereira');
  await expect(volvo).toContainText('Semirremolque Randon · REM1001');
  await expect(volvo).toContainText('Vencido Frenos');
  await expect(volvo).toContainText('≈ 389 L');
  await expect(volvo).toContainText('1 viaje · 152 km');
  await expect(volvo.getByRole('link', { name: 'Ver ficha' })).toBeVisible();
  await expect(trucks(page).filter({ hasText: 'Mercedes Benz Actros' })).toContainText('1 papel vencido');
  await expect(trucks(page).filter({ hasText: 'Mercedes Benz Actros' })).toContainText('Sin señal Carla Méndez');
  const iveco = trucks(page).filter({ hasText: 'Iveco Stralis' });
  await expect(iveco).toContainText('Falta saber cuánto tiene');
  await expect(iveco).toContainText('Sin papeles cargados');
  await expect(iveco).toContainText('2 viajes · 132 km');
  await shot(page, 'flota');

  // The Volvo's photo opens big.
  await volvo.getByRole('button', { name: 'Ver la foto de Volvo FH 460 · ABC1234' }).click();
  const photo = page.getByRole('dialog', { name: 'Volvo FH 460 · ABC1234' });
  await expect(photo.locator('img')).toBeVisible();
  await photo.getByRole('button', { name: 'Cerrar la foto' }).click();
  await expect(photo).toBeHidden();

  // The trailers: the semi-trailer on the Volvo and the tanker free.
  await views.getByRole('button', { name: /Acoplados/ }).click();
  await expect(page).toHaveURL(/vista=acoplados/);
  const trailers = page.getByRole('list', { name: 'Acoplados' }).getByRole('listitem');
  await expect(trailers.locator('h2')).toHaveText(['Cisterna Facchini · CIS2002', 'Semirremolque Randon · REM1001']);
  await expect(trailers.nth(0)).toContainText('Facchini Cisterna 30 · 2016 · 30 m³');
  await expect(trailers.nth(0)).toContainText('Sin camión');
  await expect(trailers.nth(1)).toContainText('Volvo FH 460 · ABC1234 · desde el 01/03/2025');
  await shot(page, 'flota-acoplados');

  // The ones sold keep their card.
  await views.getByRole('button', { name: /De baja/ }).click();
  const gone = page.getByRole('list', { name: 'De baja' }).getByRole('listitem');
  await expect(gone).toHaveCount(1);
  await expect(gone).toContainText('Acoplado Pastrana · OLD0099');
  await expect(gone).toContainText('Desde el 05/03/2025 · Vendido');
});

test('la ficha del camión junta sus datos, su acoplado, cómo está, el mes, los services, los papeles y quién lo manejó', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Flota');
  await trucks(page).getByRole('link', { name: 'Volvo FH 460 · ABC1234' }).click();
  await expect(page.getByRole('heading', { name: 'Volvo FH 460 · ABC1234', level: 1 })).toBeVisible();
  await expect(page.locator('.page-sub')).toHaveText('Volvo FH 460 · 2018');

  const data = card(page, 'Datos');
  await expect(data).toContainText('Marca y modeloVolvo FH 460');
  await expect(data).toContainText('Chasis' + 'YV2RT40A0JB000001');
  await expect(data).toContainText('MotorD13K-000001');
  await expect(data).toContainText('Capacidad de carga30.000 kg');
  await expect(data).toContainText('Tractor con cabina dormitorio.');

  const trailer = card(page, 'Acoplado');
  await expect(trailer.getByRole('link', { name: 'Semirremolque Randon · REM1001' })).toBeVisible();
  await expect(trailer).toContainText('Desde el 01/03/2025 · 28.000 kg');
  const before = trailer.getByRole('list', { name: 'Acoplados que llevó antes' }).getByRole('listitem');
  await expect(before).toHaveCount(1);
  await expect(before).toContainText('Acoplado Pastrana · OLD0099');
  await expect(before).toContainText('Del 10/01/2023 al 28/02/2025 · Lo llevó hasta que se vendió.');

  const now = card(page, 'Ahora');
  await expect(now).toContainText('En ruta');
  await expect(now).toContainText('Ana Pereira');
  await expect(now).toContainText('≈ 389 L');
  await expect(now).toContainText('Se estiman con el kilometraje de un service hecho');
  const month = card(page, 'Actividad de octubre');
  await expect(month).toContainText('Viajes1');
  await expect(month).toContainText('152 km');
  await expect(month).toContainText('183 L');
  await expect(month.getByRole('link', { name: 'Ver sus viajes' })).toHaveAttribute('href', /\/viajes\?periodo=mes&camion=Volvo%20FH%20460%20%C2%B7%20ABC1234$/);
  const services = card(page, 'Services');
  await expect(services.getByRole('listitem').filter({ hasText: 'Frenos' })).toContainText('Vencido');
  await expect(services.getByRole('listitem').filter({ hasText: 'Cambio de filtros' })).toContainText('Pendiente');
  await expect(card(page, 'Papeles').getByRole('listitem').filter({ hasText: 'Habilitación MTOP' })).toContainText('Vigente');
  const drivers = page.getByRole('table', { name: 'Choferes por mes' }).getByRole('row').filter({ hasText: ' de 2026' });
  await expect(drivers).toHaveCount(1);
  await expect(drivers).toContainText('Octubre de 2026');
  await expect(drivers).toContainText('Ana Pereira (1 viaje, 152 km)');
  await shot(page, 'flota-camion');

  // The trailer's card: its data, the truck it goes on and its papers.
  await trailer.getByRole('link', { name: 'Semirremolque Randon · REM1001' }).click();
  await expect(page.getByRole('heading', { name: 'Semirremolque Randon · REM1001', level: 1 })).toBeVisible();
  await expect(card(page, 'Datos')).toContainText('TipoSemirremolque');
  await expect(card(page, 'Datos')).toContainText('Capacidad de carga28.000 kg');
  await expect(card(page, 'Camión').getByRole('link', { name: 'Volvo FH 460 · ABC1234' })).toBeVisible();
  await expect(card(page, 'Camión')).toContainText('Desde el 01/03/2025');
  await expect(card(page, 'Papeles')).toContainText('Todavía no tiene papeles.');
  await shot(page, 'flota-acoplado');
});

test('si no se puede leer el último viaje de cada camión, lo dice en vez de darlo por sabido', async ({ page }) => {
  // The live list reads the newest finished trips at once; the last trip of each truck, further back, pages with an offset.
  await page.route('**/rest/v1/trf_driver_tracking_sessions*', (route) => {
    const url = route.request().url();
    return url.includes('arrival_lat') && url.includes('offset=') ? route.fulfill({ status: 500, json: { message: 'Falla de prueba' } }) : route.fallback();
  });
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Flota');
  await expect(page.getByRole('alert')).toContainText('No se pudieron leer los últimos viajes de cada camión: lo que depende de eso se ve con «—».');
  await expect(trucks(page)).toHaveCount(5);
  await trucks(page).getByRole('link', { name: 'Iveco Stralis · MNO7890' }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudieron leer los últimos viajes de cada camión');
});

test('un camión sin ficha la ofrece, y los acoplados se eligen para sus papeles en Documentación', async ({ page }) => {
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Flota');
  await trucks(page).getByRole('link', { name: 'Iveco Stralis · MNO7890' }).click();
  await expect(page.getByRole('heading', { name: 'Iveco Stralis · MNO7890', level: 1 })).toBeVisible();
  await expect(card(page, 'Datos')).toContainText('Todavía no tiene ficha.');
  await expect(page.getByRole('button', { name: 'Crear ficha' })).toBeVisible();
  await expect(card(page, 'Acoplado')).toContainText('No lleva acoplado.');
  await expect(page.getByRole('table', { name: 'Choferes por mes' })).toContainText('Ana Pereira (2 viajes, 132 km)');

  await open(page, 'Documentación');
  await page.getByRole('button', { name: 'Nuevo documento' }).click();
  const form = page.getByRole('dialog', { name: 'Nuevo documento' });
  const select = form.getByLabel('Camión');
  await expect(select.locator('optgroup[label="Acoplados"] option')).toHaveText(['Cisterna Facchini · CIS2002', 'Semirremolque Randon · REM1001']);
  await expect(select.locator('optgroup[label="Camiones"] option')).toContainText(['Ford Cargo 1722 · JKL3456']);
  await form.getByRole('button', { name: 'Cancelar' }).click();
});
