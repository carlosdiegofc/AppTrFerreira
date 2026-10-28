// The notices the bell added on 28/10/2026: trips that look left open, receipts and trips to complete, and drivers with
// an older app. The seed has two drivers with an older app and none of the rest: the other reads are changed on their
// way, as the database would answer them. These tests only read.
import { expect, type Page, type Route, test } from '@playwright/test';
import { BASE, open, prepare, signIn } from './helpers';

test.beforeEach(async ({ page }) => prepare(page));

const BRUNO_TRIP = '10000000-0000-4000-8000-00000000000b';
const CARLA_RECEIPT = '40000000-0000-4000-8000-000000000004';

/** Changes the rows of a read of the table whose query matches, on their way to the page. */
async function change<T>(page: Page, table: string, when: (q: URLSearchParams) => boolean, edit: (rows: T[]) => T[]) {
  await page.route(
    (url) => url.pathname.endsWith(`/rest/v1/${table}`) && when(url.searchParams),
    async (route: Route) => {
      const response = await route.fetch();
      await route.fulfill({ response, json: edit((await response.json()) as T[]) });
    },
  );
}

test('la campana avisa los viajes abiertos, lo que falta completar y las apps viejas, y lleva a cada página', async ({ page }) => {
  // Bruno's trip started 15 hours ago, Carla's receipt of five days ago lost its amount, and the trips of the app lost theirs.
  await change<{ id: string; started_at: string }>(page, 'trf_driver_tracking_sessions', (q) => q.get('active') === 'eq.true', (rows) =>
    rows.map((r) => (r.id === BRUNO_TRIP ? { ...r, started_at: new Date(Date.parse(BASE) - 15 * 3_600_000).toISOString() } : r)),
  );
  await change<{ id: string; total: number | null }>(page, 'trf_driver_fuel_receipts', (q) => (q.get('recorded_at') ?? '').startsWith('gte.'), (rows) =>
    rows.map((r) => (r.id === CARLA_RECEIPT ? { ...r, total: null } : r)),
  );
  await change<{ amount: number | null }>(page, 'trf_panel_trips', (q) => q.get('source') === 'eq.app', (rows) => rows.map((r) => ({ ...r, amount: null })));
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Flota');
  const bell = page.getByRole('button', { name: /^Avisos/ });
  // The seven of the seed, Bruno's trip, the receipt and the trips without an amount.
  await expect(bell).toHaveAccessibleName('Avisos: 10');
  await bell.click();
  const notices = page.locator('#avisos');
  const line = (text: string | RegExp) => notices.locator('.alert-line', { hasText: text });
  await expect(line('DEF5678 · Bruno Díaz')).toContainText('En curso hace 15 horas: ¿quedó abierto?');
  await expect(line('DEF5678 · Bruno Díaz')).toContainText('Viaje abierto');
  await expect(line('1 boleta sin importe o sin litros')).toContainText('De los últimos 30 días: completalas en Combustible.');
  await expect(line(/viajes? con carga sin importe/)).toContainText('De los últimos 60 días: completá el importe para cobrarlos.');
  await expect(line('2 choferes con la app vieja')).toContainText('Bruno (0.17.0), Carla (0.17.0). Ya hay una más nueva: 0.17.1.');
  // Each one leads to where it is completed; the bell closes when the new page lands, and opens again from there.
  await line('1 boleta sin importe o sin litros').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Combustible');
  await expect(notices).toBeHidden();
  await bell.click();
  await line(/viajes? con carga sin importe/).click();
  await expect(page).toHaveURL(/#\/finanzas\/cobros$/);
  await expect(notices).toBeHidden();
  await bell.click();
  await line('DEF5678 · Bruno Díaz').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('GPS en vivo');
  await expect(page).toHaveURL(/camion=trip%3A10000000-0000-4000-8000-00000000000b/);
});

test('si una de esas lecturas falla, la campana lo dice y sigue con el resto', async ({ page }) => {
  await page.route((url) => url.pathname.endsWith('/rest/v1/trf_driver_fuel_receipts') && (url.searchParams.get('recorded_at') ?? '').startsWith('gte.'), (route) =>
    route.fulfill({ status: 500, json: { message: 'Falla de prueba' } }),
  );
  await signIn(page, 'dueno@ejemplo.uy');
  await open(page, 'Flota');
  const bell = page.getByRole('button', { name: /^Avisos/ });
  await expect(bell).toHaveAccessibleName('Avisos: 7');
  await bell.click();
  const note = page.locator('#avisos').getByText('No se pudieron leer los viajes, las boletas o los choferes: puede faltar algún aviso.');
  await expect(note).toBeVisible();
  await page.unroute((url) => url.pathname.endsWith('/rest/v1/trf_driver_fuel_receipts'));
});
