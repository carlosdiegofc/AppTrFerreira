// End-to-end test of the panel in a real browser (Chromium via Playwright) against PostgREST + the test database.
// Prerequisites: local PostgreSQL + PostgREST running (see README in this folder). TEST ONLY.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PASSWORD, PNG, USERS, authTtl, signJwt, startServer, stats } from './server.mjs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = process.env.SHOTS_DIR || path.join(HERE, 'shots');
mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://127.0.0.1:' + (process.env.PANEL_PORT || 8790) + '/';
const SUPABASE = 'https://jpwtsffatezwnfhunqrz.supabase.co';
const T1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const T2 = 'aaaaaaaa-0000-0000-0000-000000000002';

const sql = (query) => execFileSync('psql', ['-X', '-tA', '-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', process.env.PGDATABASE_TEST || 'trf', '-c', query]).toString().trim();
const resetDb = () => execFileSync('bash', [path.join(HERE, 'reset-db.sh')], { stdio: 'pipe' });

const results = [];
let currentStep = '';
async function step(name, fn) {
  currentStep = name;
  try {
    await fn();
    results.push(['ok', name]);
    console.log('  ✔', name);
  } catch (e) {
    results.push(['FAIL', name, e]);
    try { await globalThis.__page?.screenshot({ path: path.join(SHOTS, `FALLA-${results.length}.png`), fullPage: true }); } catch { /* no page */ }
    console.log('  ✘', name, '\n     ', e.message.split('\n').slice(0, 6).join('\n      '));
  }
}

// HTTP errors the tests provoke on purpose (wrong password, revoked session). Any other failed request is a bug.
const EXPECTED_HTTP_ERRORS = [/\/auth\/v1\/token\?grant_type=(password|refresh_token)$/];
async function wire(page, errors) {
  page.on('pageerror', (e) => errors.push(`[${currentStep}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(`[${currentStep}] console: ${m.text()}`); });
  page.on('response', (r) => {
    const provoked = currentStep.startsWith('aviso claro si falta instalar') && r.status() === 404 && /\/rpc\/trf_is_panel_admin$/.test(r.url());
    if (r.status() >= 400 && !provoked && !EXPECTED_HTTP_ERRORS.some((re) => re.test(r.url()))) errors.push(`[${currentStep}] http ${r.status()}: ${r.request().method()} ${r.url()}`);
  });
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE)) return route.continue();
    if (url.startsWith(SUPABASE)) {
      const local = BASE + 'sb' + url.slice(SUPABASE.length);
      const r = await route.fetch({ url: local });
      return route.fulfill({ response: r });
    }
    if (url.includes('tile.openstreetmap.org') || url.includes('arcgisonline.com')) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (url.includes('nominatim.openstreetmap.org/search')) {
      const q = new URL(url).searchParams.get('q') || '';
      const places = { pay: ['Paysandú, Uruguay', 'Paysandú', '-32.317', '-58.081'], mon: ['Montevideo, Uruguay', 'Montevideo', '-34.901', '-56.164'] };
      const hit = places[q.toLowerCase().slice(0, 3)];
      return route.fulfill({ json: hit ? [{ display_name: hit[0], name: hit[1], lat: hit[2], lon: hit[3] }] : [] });
    }
    if (url.includes('nominatim.openstreetmap.org/reverse')) return route.fulfill({ json: { address: { town: 'Young', state: 'Río Negro' } } });
    if (url.includes('router.project-osrm.org')) {
      return route.fulfill({ json: { routes: [{ distance: 371000, duration: 17100, geometry: { coordinates: [[-58.081, -32.317], [-57.2, -33.4], [-56.164, -34.901]] } }] } });
    }
    return route.abort();
  });
}

async function login(page, email, password = PASSWORD) {
  await page.goto(BASE);
  await page.fill('#email', email);
  await page.fill('#pass', password);
  await page.click('form button[type=submit]');
}

const text = (page, sel) => page.locator(sel).first().innerText();

// After the database is recreated PostgREST reconnects and reloads its schema: wait until it answers.
async function waitForApi() {
  const token = signJwt(USERS['luis@trferreira.com'], 'luis@trferreira.com');
  const url = (process.env.POSTGREST_URL || 'http://127.0.0.1:3300') + '/trf_panel_trips?select=id&limit=1';
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error('PostgREST did not answer at ' + url);
}

(async () => {
  resetDb();
  await waitForApi();
  const server = await startServer();
  const browser = await playwright.chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-UY', timezoneId: 'America/Montevideo', acceptDownloads: true });
  const page = await context.newPage();
  globalThis.__page = page;
  await wire(page, errors);

  console.log('Panel web · prueba de punta a punta');

  await step('rechaza una contraseña incorrecta', async () => {
    await login(page, 'luis@trferreira.com', 'mala');
    await page.waitForFunction(() => /incorrectos/.test(document.querySelector('.form-msg')?.textContent || ''));
  });

  await step('un chofer no puede entrar al panel', async () => {
    await login(page, 'hugo@trferreira.com');
    await page.waitForSelector('text=Sin acceso al panel');
    await page.screenshot({ path: path.join(SHOTS, 'sin-acceso.png') });
    await page.click('text=Ingresar con otra cuenta');
    await page.waitForSelector('#email');
  });

  await step('el administrador entra y ve los viajes de la app sin hacer nada', async () => {
    await login(page, 'luis@trferreira.com');
    await page.waitForSelector('.trip-row');
    const tabs = await page.locator('.tab').allInnerTexts();
    assert.deepEqual(tabs, ['Todos (4)', 'Pendientes (1)', 'En curso (1)', 'Completos (2)', 'Eliminados (1)']);
    const t1 = page.locator(`.trip-row[data-key="app:${T1}"]`);
    assert.match(await t1.innerText(), /Falta: Origen/);
    assert.match(await t1.innerText(), /Navios · Soja/);
    assert.match(await t1.innerText(), /184,2 km/);
    await page.screenshot({ path: path.join(SHOTS, 'viajes.png'), fullPage: true });
  });

  await step('filtros y búsqueda', async () => {
    await page.click('text=Pendientes (1)');
    assert.equal(await page.locator('.trip-row').count(), 1);
    await page.click('text=Todos (4)');
    await page.fill('input[type=search]', 'paysandu');
    assert.equal(await page.locator('.trip-row').count(), 1);
    await page.fill('input[type=search]', '');
    await page.click('text=Eliminados (1)');
    assert.equal(await page.locator('.trip-row').count(), 1);
    await page.click('text=Eliminados (1)');
    assert.equal(await page.locator('.trip-row').count(), 4);
  });

  await step('exporta los viajes a Excel (CSV)', async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('text=Exportar a Excel')]);
    const content = readFileSync(await download.path(), 'utf8');
    assert.ok(content.startsWith('﻿Salida;Llegada;Estado;Orden de carga;Chofer;Camión;Matrícula'));
    assert.match(content, /ITP2187/);
    assert.equal(content.trim().split('\r\n').length, 5);
  });

  await step('el detalle muestra la orden de carga y el recorrido real en el mapa', async () => {
    await page.click(`.trip-row[data-key="app:${T1}"]`);
    await page.waitForSelector('.trip-head h1');
    assert.equal(await text(page, '.trip-head h1'), 'Immer Sampayo');
    assert.equal(await text(page, '.trip-head .plate .num'), 'ITP2187');
    assert.match(await text(page, '.order-card'), /Soja/);
    assert.match(await text(page, '.order-card'), /NAVIOS \(N\. PALMIRA\)/i);
    await page.waitForFunction(() => /puntos GPS/.test(document.querySelector('.map-info')?.textContent || ''));
    assert.match(await text(page, '.map-info'), /320 puntos GPS/);
    assert.ok(await page.locator('.leaflet-overlay-pane path').count() >= 1, 'route line drawn');
    assert.equal(await page.locator('.leaflet-marker-pane .map-pin').count(), 2);
    assert.match(await text(page, '.page'), /Remitos \(2\)/);
    assert.match(await text(page, '.page'), /Ancap Young/);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, 'detalle-viaje.png'), fullPage: true });
  });

  await step('abre la foto de un remito', async () => {
    await page.click('text=Ver foto');
    await page.waitForSelector('dialog img.photo');
    await page.click('dialog .modal-head button');
  });

  await step('completar datos: valida antes de guardar', async () => {
    await page.click('text=Completar datos');
    await page.waitForSelector('form.trip-form');
    assert.equal(await page.inputValue('#f-kg'), '30.000');
    await page.fill('#f-kg', '-5');
    await page.fill('#f-billable_km', '9.000');
    await page.click('form.trip-form button[type=submit]');
    await page.waitForSelector('#err-kg:has-text("No puede ser negativo")');
    assert.match(await text(page, '#err-billable_km'), /supera 5\.000/);
    assert.equal(sql(`select count(*) from trf_panel_trips where app_trip_id = '${T1}'`), '0');
  });

  await step('completar datos: guarda y el viaje queda completo', async () => {
    await page.fill('#f-kg', '30.000');
    await page.fill('#f-billable_km', '184');
    assert.equal(await page.locator('#err-kg').innerText(), '', 'old error cleared after editing');
    assert.equal(await page.locator('#f-billable_km.invalid').count(), 0);
    await page.fill('#f-order_number', '24129');
    await page.click('text=Usar inicio GPS');
    await page.waitForFunction(() => document.querySelector('#f-origin_name').value === 'Young, Río Negro');
    await page.fill('#f-origin_name', 'Santa Cecilia (Young)');
    await page.fill('#f-amount', '41.000,50');
    assert.match(await text(page, 'form.trip-form'), /Se guarda: 41\.000,5/);
    await page.screenshot({ path: path.join(SHOTS, 'formulario.png'), fullPage: true });
    await page.click('form.trip-form button[type=submit]');
    await page.waitForSelector('.toast.show:has-text("Viaje guardado")');
    await page.waitForSelector('.pill.completo');
    assert.match(await text(page, '.order-card'), /24129/);
    assert.match(await text(page, '.facts'), /\$ 41\.000,50/);
    const row = sql(`select source, app_trip_id, kg, billable_km, amount, origin_name, created_by, departure_at = (select started_at from trf_driver_tracking_sessions where id = '${T1}') from trf_panel_trips where app_trip_id = '${T1}'`);
    assert.equal(row, `app|${T1}|30000.0|184.0|41000.50|Santa Cecilia (Young)|11111111-1111-1111-1111-111111111111|t`);
  });

  await step('cerrar con cambios sin guardar pide confirmación', async () => {
    await page.click('text=Editar datos');
    await page.fill('#f-notes', 'cambio sin guardar');
    await page.keyboard.press('Escape');
    await page.waitForSelector('text=¿Salir sin guardar?');
    await page.click('dialog >> button:has-text("Seguir editando")');
    assert.equal(await page.inputValue('#f-notes'), 'cambio sin guardar');
    await page.goBack();
    await page.waitForSelector('text=¿Salir sin guardar?');
    await page.click('dialog >> button:has-text("Seguir editando")');
    assert.equal(await page.inputValue('#f-notes'), 'cambio sin guardar', 'browser back keeps the form');
    assert.match(page.url(), /#\/viaje\/app:/);
    await page.click('form.trip-form >> text=Cancelar');
    await page.click('dialog >> button:has-text("Salir sin guardar")');
    await page.waitForSelector('form.trip-form', { state: 'detached' });
  });

  await step('si otra persona editó el viaje, no se pisan los datos', async () => {
    await page.click('text=Editar datos');
    sql(`update trf_panel_trips set notes = 'Editado por otra persona' where app_trip_id = '${T1}'`);
    await page.fill('#f-client', 'Otro cliente');
    await page.click('form.trip-form button[type=submit]');
    await page.waitForSelector('.toast.show:has-text("Otra persona modificó este viaje")');
    await page.waitForSelector('text=Editado por otra persona');
    assert.equal(sql(`select client from trf_panel_trips where app_trip_id = '${T1}'`), 'Navios');
  });

  await step('eliminar envía a la papelera y se puede restaurar', async () => {
    await page.click('button:has-text("Eliminar")');
    await page.click('dialog >> button:has-text("Eliminar")');
    await page.waitForSelector('text=Este viaje está en "Eliminados"');
    assert.equal(sql(`select count(*) from trf_driver_tracking_sessions where id = '${T1}'`), '1', 'the GPS trip itself is never deleted');
    await page.click('a.back');
    await page.waitForSelector('.trip-row');
    assert.deepEqual(await page.locator('.tab').allInnerTexts(), ['Todos (3)', 'Pendientes (0)', 'En curso (1)', 'Completos (2)', 'Eliminados (2)']);
    await page.click('text=Eliminados (2)');
    await page.click(`.trip-row[data-key="app:${T1}"]`);
    await page.click('text=Restaurar viaje');
    await page.waitForSelector('.pill.completo');
    await page.click('a.back');
    await page.waitForSelector('.tab.on');
    assert.equal(await page.locator('.tab.on').innerText(), 'Eliminados (1)');
    await page.click('text=Eliminados (1)');
    assert.equal(await page.locator('.tab.on').innerText(), 'Todos (4)');
  });

  let manualId = null;
  await step('crear un viaje a mano con validaciones y ruta sugerida', async () => {
    await page.click('text=+ Nuevo viaje');
    await page.waitForSelector('form.trip-form');
    await page.click('form.trip-form button[type=submit]');
    await page.waitForSelector('#err-vehicle:has-text("Indicá el camión")');
    await page.fill('#f-vehicle', 'Leyland · ABC1234');
    await page.fill('#f-driver_name', 'Luis Ferreira');
    await page.fill('#f-client', 'COOPAR');
    await page.fill('#f-product', 'Trigo');
    await page.fill('#f-origin_name', 'Paysandú');
    await page.locator('#f-origin_name').press('Enter');
    await page.click('.place-option:has-text("Paysandú, Uruguay")');
    await page.fill('#f-destination_name', 'Montevideo');
    await page.locator('.field:has(#f-destination_name) button:has-text("Buscar en el mapa")').click();
    await page.click('.place-option:has-text("Montevideo, Uruguay")');
    const dep = await page.inputValue('#f-departure_at');
    await page.fill('#f-arrival_at', '2000-01-01T10:00');
    await page.click('form.trip-form button[type=submit]');
    await page.waitForSelector('#err-arrival_at:has-text("antes de la salida")');
    await page.fill('#f-arrival_at', '');
    await page.click('form.trip-form button[type=submit]');
    await page.waitForURL(/#\/viaje\/web:/);
    manualId = page.url().split('web:')[1];
    await page.waitForFunction(() => /Ruta sugerida: 371 km/.test(document.querySelector('.map-info')?.textContent || ''));
    assert.equal(await text(page, '#trip-km'), '≈ 371 km');
    assert.match(await text(page, '.trip-head .plate .num'), /ABC1234/);
    assert.equal(sql(`select source || '|' || origin_lat || '|' || destination_lng || '|' || (departure_at is not null) from trf_panel_trips where id = '${manualId}'`), 'manual|-32.317|-56.164|true');
    assert.ok(dep.length === 16);
    await page.screenshot({ path: path.join(SHOTS, 'viaje-manual.png'), fullPage: true });
  });

  await step('un viaje en curso se ve en vivo', async () => {
    await page.goto(BASE + `#/viaje/app:${T2}`);
    await page.waitForSelector('text=Recorrido en vivo');
    await page.waitForFunction(() => /140 puntos GPS/.test(document.querySelector('.map-info')?.textContent || ''));
    assert.match(await text(page, '.page'), /En vivo · se actualiza cada 30 s/);
  });

  await step('seguimiento GPS de la flota', async () => {
    await page.click('nav >> text=Seguimiento GPS');
    await page.waitForSelector('.fleet-card');
    assert.equal(await page.locator('.fleet-card').count(), 2);
    assert.match(await text(page, '.fleet-card.ok'), /Hugo Silva/);
    assert.match(await text(page, '.fleet-card.off'), /Sin viaje activo/);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, 'seguimiento.png'), fullPage: true });
    await page.click('.fleet-card.ok >> text=Ver viaje');
    await page.waitForSelector('text=Recorrido en vivo');
  });

  await step('combustible (las boletas archivadas no aparecen)', async () => {
    await page.click('nav >> text=Combustible');
    await page.waitForSelector('tbody tr td');
    await page.selectOption('select[aria-label="Período"]', '30');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2);
    assert.equal(await page.locator('tbody tr').count(), 2);
    assert.doesNotMatch(await text(page, 'table'), /Archivada/);
  });

  await step('resumen del mes por camión', async () => {
    await page.click('nav >> text=Resumen');
    await page.waitForSelector('tbody tr td');
    const month = sql(`select to_char(started_at at time zone 'America/Montevideo', 'YYYY-MM-01') from trf_driver_tracking_sessions where id = '${T1}'`);
    await page.selectOption('select[aria-label="Mes"]', month);
    await page.waitForFunction(() => /ITP2187/.test(document.querySelector('table')?.textContent || ''));
    const body = await text(page, '.page');
    assert.match(body, /ITP2187/);
    assert.match(body, /\$ 9\.500/);
    await page.screenshot({ path: path.join(SHOTS, 'resumen.png'), fullPage: true });
  });

  await step('la sesión se renueva sola cuando vence', async () => {
    const before = stats.refreshes;
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('trf-panel-session'));
      s.expires_at = Math.floor(Date.now() / 1000) - 5;
      localStorage.setItem('trf-panel-session', JSON.stringify(s));
    });
    await page.reload();
    await page.waitForSelector('nav');
    await page.click('nav >> text=Viajes');
    await page.waitForSelector('.trip-row');
    assert.ok(stats.refreshes > before);
  });

  await step('si la sesión ya no es válida vuelve al ingreso con aviso', async () => {
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('trf-panel-session'));
      s.expires_at = 0;
      s.refresh_token = 'revocado';
      localStorage.setItem('trf-panel-session', JSON.stringify(s));
    });
    await page.reload();
    await page.waitForSelector('#email');
  });

  await step('aviso claro si falta instalar el panel en la base', async () => {
    sql(`alter function trf_is_panel_admin() rename to trf_is_panel_admin_x; notify pgrst, 'reload schema'`);
    await page.waitForTimeout(1500);
    await login(page, 'luis@trferreira.com');
    await page.waitForSelector('text=Falta instalar el panel');
    sql(`alter function trf_is_panel_admin_x() rename to trf_is_panel_admin; notify pgrst, 'reload schema'`);
    await page.waitForTimeout(1500);
    await page.click('text=Ya lo ejecuté, reintentar');
    await page.waitForSelector('.trip-row');
  });

  await step('celular: lista, detalle y formulario se adaptan', async () => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-UY', timezoneId: 'America/Montevideo', isMobile: true, hasTouch: true });
    const p2 = await phone.newPage();
    await wire(p2, errors);
    await login(p2, 'luis@trferreira.com');
    await p2.waitForSelector('.trip-row');
    const overflow = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, 'no horizontal scroll, got ' + overflow);
    await p2.screenshot({ path: path.join(SHOTS, 'celular-viajes.png'), fullPage: true });
    await p2.click(`.trip-row[data-key="app:${T1}"]`);
    await p2.waitForFunction(() => /puntos GPS/.test(document.querySelector('.map-info')?.textContent || ''));
    await p2.waitForTimeout(300);
    await p2.screenshot({ path: path.join(SHOTS, 'celular-detalle.png'), fullPage: true });
    await p2.click('text=Editar datos');
    await p2.waitForSelector('form.trip-form');
    await p2.screenshot({ path: path.join(SHOTS, 'celular-formulario.png') });
    await phone.close();
  });

  await step('el texto que escriben los choferes nunca se ejecuta como código', async () => {
    const evil = '<img src=x onerror="window.__hacked=1">';
    sql(`update trf_driver_tracking_sessions set driver_name = '${evil}', vehicle = '${evil} · ITP2187' where id = '${T1}';
         update trf_driver_locations set driver_name = '${evil}' where driver_id = '22222222-2222-2222-2222-222222222222';
         update trf_trip_details set data = data || '{"destino": "<b>NEGRITA</b>"}' where trip_id = '${T1}';
         update trf_panel_trips set destination_name = null, vehicle = null where app_trip_id = '${T1}'`);
    for (const route of [`#/viaje/app:${T1}`, '#/viajes', '#/seguimiento']) {
      await page.goto(BASE + route);
      await page.waitForSelector(route === '#/viajes' ? '.trip-row' : route === '#/seguimiento' ? '.fleet-card' : '.map-info span');
      await page.waitForTimeout(400);
      assert.equal(await page.locator('img[src="x"], b:has-text("NEGRITA")').count(), 0, route);
    }
    await page.goto(BASE + '#/seguimiento');
    await page.waitForSelector('.fleet-card');
    await page.hover('.leaflet-marker-icon[title*="onerror"]');
    await page.waitForSelector('.leaflet-tooltip:has-text("Sin camión"), .leaflet-tooltip:has-text("ITP2187"), .leaflet-tooltip img');
    assert.equal(await page.locator('.leaflet-tooltip img').count(), 0, 'tooltip renders text, not HTML');
    assert.match(await text(page, '.leaflet-tooltip'), /onerror/);
    assert.equal(await page.evaluate(() => window.__hacked), undefined);
    await page.goto(BASE + `#/viaje/app:${T1}`);
    await page.waitForSelector('.trip-head h1');
    assert.equal(await text(page, '.trip-head h1'), evil);
    assert.match(await text(page, '.order-card'), /<B>NEGRITA<\/B>/);
  });

  await step('sin errores en la consola del navegador', async () => {
    assert.deepEqual(errors, []);
  });

  await browser.close();
  server.close();
  authTtl.seconds = 3600;
  const failed = results.filter((r) => r[0] !== 'ok');
  console.log(`\n${results.length - failed.length}/${results.length} pruebas correctas · capturas en ${SHOTS}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
