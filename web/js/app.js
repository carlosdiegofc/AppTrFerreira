// Start-up: login, administrator check, top menu and navigation between screens.
import { currentUser, describeError, hasSession, isSetupMissing, login, logout, onSessionChange } from './api.js';
import { PANEL_VERSION } from './config.js';
import { isPanelAdmin, loadCatalog } from './data.js';
import { parseTripKey } from './trips.js';
import { banner, clear, h, loading } from './ui.js';
import { fleetView } from './views/fleet.js';
import { fuelView } from './views/fuel.js';
import { summaryView } from './views/summary.js';
import { tripView } from './views/trip.js';
import { tripsView } from './views/trips.js';

const app = document.getElementById('app');
const ctx = { catalog: {}, knownTrips: [] };
let cleanup = null;
let ready = false;

const NAV = [['viajes', '#/viajes', 'Viajes'], ['seguimiento', '#/seguimiento', 'Seguimiento GPS'], ['combustible', '#/combustible', 'Combustible'], ['resumen', '#/resumen', 'Resumen']];
const ROUTES = [
  { re: /^#\/viajes$/, nav: 'viajes', view: (root) => tripsView(root, ctx) },
  {
    re: /^#\/viaje\/(.+)$/, nav: 'viajes',
    view: (root, m) => {
      const key = parseTripKey(decodeURIComponent(m[1]));
      if (!key) { clear(root, h('section', { class: 'page' }, banner('error', 'La dirección del viaje no es válida.'), h('a', { href: '#/viajes' }, 'Volver a Viajes'))); return null; }
      return tripView(root, ctx, key);
    },
  },
  { re: /^#\/seguimiento$/, nav: 'seguimiento', view: (root) => fleetView(root) },
  { re: /^#\/combustible$/, nav: 'combustible', view: (root) => fuelView(root) },
  { re: /^#\/resumen$/, nav: 'resumen', view: (root) => summaryView(root) },
];

function brand() {
  return h('div', { class: 'brand' }, h('img', { src: 'logo.png', alt: 'TR Ferreira', width: 150, height: 21 }), h('span', null, 'PANEL'));
}

function stopView() {
  if (cleanup) {
    try { cleanup(); } catch { /* a broken screen must not block navigation */ }
    cleanup = null;
  }
  document.querySelectorAll('dialog').forEach((d) => d.remove());
}

function renderShell() {
  const nav = h('nav', { class: 'nav', 'aria-label': 'Secciones' }, NAV.map(([id, href, label]) => h('a', { href, dataset: { nav: id } }, label)));
  clear(app,
    h('header', { class: 'topbar' }, brand(), nav,
      h('div', { class: 'user' }, h('span', { class: 'email' }, currentUser()?.email || ''),
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => { stopView(); ready = false; logout(); } }, 'Salir'))),
    h('main', { id: 'view', tabindex: '-1' }),
    h('footer', { class: 'foot' }, `Panel TR Ferreira · v${PANEL_VERSION}`));
}

let lastHash = '';
function route() {
  if (!ready) return;
  // Browser "back" while a trip form is open: stay here and let the form ask about unsaved changes.
  const openForm = document.querySelector('dialog[open] form.trip-form');
  if (openForm && lastHash && location.hash !== lastHash) {
    history.replaceState(null, '', lastHash);
    openForm.closest('dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
    return;
  }
  lastHash = location.hash;
  const hash = location.hash || '#/viajes';
  const r = ROUTES.find((x) => x.re.test(hash));
  if (!r) { location.replace('#/viajes'); return; }
  stopView();
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.nav === r.nav));
  const view = document.getElementById('view');
  view.replaceChildren();
  try {
    cleanup = r.view(view, hash.match(r.re)) || null;
  } catch (e) {
    console.error(e);
    clear(view, h('section', { class: 'page' }, banner('error', 'Esta pantalla tuvo un problema. Recargá la página.')));
  }
  window.scrollTo(0, 0);
}

function centered(...children) {
  stopView();
  ready = false;
  clear(app, h('div', { class: 'center' }, h('div', { class: 'card login' }, brand(), ...children)));
}

function showLogin(message = '') {
  const email = h('input', { type: 'email', id: 'email', autocomplete: 'username', required: true });
  const pass = h('input', { type: 'password', id: 'pass', autocomplete: 'current-password', required: true });
  const msg = h('p', { class: 'form-msg', role: 'status' }, message);
  const submit = h('button', { class: 'btn primary block', type: 'submit' }, 'Ingresar');
  const form = h('form', { novalidate: true },
    h('label', { for: 'email' }, 'Correo electrónico'), email,
    h('label', { for: 'pass' }, 'Contraseña'), pass, msg, submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!email.value.trim() || !pass.value) { msg.textContent = 'Completá correo y contraseña.'; return; }
    submit.disabled = true;
    msg.textContent = 'Ingresando…';
    try {
      await login(email.value.trim().toLowerCase(), pass.value);
      pass.value = '';
      start();
    } catch (err) {
      msg.textContent = err?.status === 400 ? 'Correo o contraseña incorrectos.' : describeError(err);
      submit.disabled = false;
    }
  });
  centered(h('h1', null, 'Ingresá al panel'), h('p', { class: 'muted' }, 'Con tu cuenta de administrador de TR Ferreira.'), form);
  email.focus();
}

function showNoAccess() {
  centered(
    h('h1', null, 'Sin acceso al panel'),
    h('p', null, `La cuenta ${currentUser()?.email || ''} no está habilitada como administradora del panel.`),
    h('p', { class: 'muted' }, 'Para habilitarla, agregá su correo en la lista de administradores del archivo web/sql/001_panel_web.sql y volvé a ejecutarlo en Supabase.'),
    h('button', { class: 'btn primary block', type: 'button', onclick: () => { logout(); } }, 'Ingresar con otra cuenta'));
}

function showSetup() {
  centered(
    h('h1', null, 'Falta instalar el panel'),
    h('p', null, 'La base de datos todavía no tiene las tablas del panel.'),
    h('ol', { class: 'steps' },
      h('li', null, 'Entrá a Supabase → SQL Editor → New query.'),
      h('li', null, 'Pegá el contenido del archivo web/sql/001_panel_web.sql (agregá tu correo en la lista de administradores).'),
      h('li', null, 'Tocá Run y revisá que el informe diga OK.')),
    h('button', { class: 'btn primary block', type: 'button', onclick: () => start() }, 'Ya lo ejecuté, reintentar'),
    h('button', { class: 'btn ghost block', type: 'button', onclick: () => logout() }, 'Salir'));
}

async function start() {
  if (!hasSession()) { showLogin(); return; }
  centered(loading('Verificando acceso…'));
  let admin;
  try {
    admin = await isPanelAdmin();
  } catch (e) {
    if (isSetupMissing(e)) { showSetup(); return; }
    if (e?.status === 401) { showLogin('Tu sesión venció. Volvé a ingresar.'); return; }
    centered(banner('error', describeError(e)), h('button', { class: 'btn primary block', type: 'button', onclick: () => start() }, 'Reintentar'));
    return;
  }
  if (admin !== true) { showNoAccess(); return; }
  renderShell();
  ready = true;
  loadCatalog().then((c) => { ctx.catalog = c; });
  route();
}

onSessionChange((s) => {
  if (!s) showLogin(ready ? 'Tu sesión terminó. Volvé a ingresar.' : '');
});
window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', (e) => {
  if (document.querySelector('dialog[open] form.trip-form')) { e.preventDefault(); e.returnValue = ''; }
});
start();
