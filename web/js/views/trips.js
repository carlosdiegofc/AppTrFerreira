// Trips list: every app trip appears here by itself; the office completes, edits or deletes them.
import { describeError } from '../api.js';
import { loadTrips } from '../data.js';
import { countByStatus, filterTrips } from '../trips.js';
import { banner, clear, download, h, loading, plateBadge, statusPill } from '../ui.js';
import { formatDateTime, formatNumber, periodRange, rangeToIso, splitVehicle, toCsv } from '../util.js';
import { openTripForm } from './tripForm.js';

const KEY = 'trf-trips-filters';
const STATUS_TABS = [['all', 'Todos'], ['pendiente', 'Pendientes'], ['en_curso', 'En curso'], ['completo', 'Completos']];

function readFilters() {
  const base = { period: '30', ...periodRange('30'), q: '', status: 'all', vehicle: '', driver: '', bin: false };
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (!saved) return base;
    const merged = { ...base, ...saved };
    if (merged.period !== 'custom') Object.assign(merged, periodRange(merged.period));
    return merged;
  } catch {
    return base;
  }
}
function saveFilters(f) {
  try { sessionStorage.setItem(KEY, JSON.stringify(f)); } catch { /* not important */ }
}

export function knownValues(trips) {
  const drivers = [...new Set(trips.map((t) => t.driverName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const vehicles = [...new Set(trips.map((t) => t.vehicle).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  return { drivers, vehicles };
}

export function tripsView(root, ctx) {
  const filters = readFilters();
  let trips = [];
  let loadedAt = null;
  let loadingNow = false;
  let timer = null;

  const listEl = h('div', { class: 'trip-list' });
  const tabsEl = h('div', { class: 'tabs', role: 'tablist' });
  const infoEl = h('p', { class: 'muted small' });
  const messageEl = h('div');
  const vehicleSel = h('select', { 'aria-label': 'Camión' });
  const driverSel = h('select', { 'aria-label': 'Chofer' });
  const search = h('input', { type: 'search', placeholder: 'Buscar orden, cliente, lugar…', value: filters.q, 'aria-label': 'Buscar' });
  const periodSel = h('select', { 'aria-label': 'Período' },
    h('option', { value: '30' }, 'Últimos 30 días'), h('option', { value: 'month' }, 'Este mes'),
    h('option', { value: 'prev-month' }, 'Mes anterior'), h('option', { value: '90' }, 'Últimos 90 días'),
    h('option', { value: 'custom' }, 'Elegir fechas…'));
  periodSel.value = filters.period;
  const fromInput = h('input', { type: 'date', value: filters.from, 'aria-label': 'Desde' });
  const toInput = h('input', { type: 'date', value: filters.to, 'aria-label': 'Hasta' });
  const customBox = h('div', { class: 'row gap', hidden: filters.period !== 'custom' }, fromInput, h('span', null, 'a'), toInput);

  const fillSelect = (sel, values, all, current) => {
    sel.replaceChildren(h('option', { value: '' }, all), ...values.map((v) => h('option', { value: v }, v)));
    sel.value = values.includes(current) ? current : '';
  };

  const newTrip = () => openTripForm({
    trip: null, catalog: ctx.catalog, ...knownValues(trips),
    onSaved: (row) => { location.hash = '#/viaje/web:' + row.id; },
  });

  const exportCsv = () => {
    const rows = filterTrips(trips, filters);
    const csv = toCsv(rows, [
      { label: 'Salida', value: (t) => formatDateTime(t.departureAt) },
      { label: 'Llegada', value: (t) => (t.arrivalAt ? formatDateTime(t.arrivalAt) : '') },
      { label: 'Estado', value: (t) => t.status.label },
      { label: 'Orden de carga', value: (t) => t.orderNumber },
      { label: 'Chofer', value: (t) => t.driverName },
      { label: 'Camión', value: (t) => splitVehicle(t.vehicle).model || t.vehicle },
      { label: 'Matrícula', value: (t) => splitVehicle(t.vehicle).plate },
      { label: 'Cliente', value: (t) => t.client },
      { label: 'Producto', value: (t) => t.product },
      { label: 'Origen', value: (t) => t.originName },
      { label: 'Destino', value: (t) => t.destinationName },
      { label: 'Km GPS', value: (t) => (t.gpsKm === null ? null : Math.round(t.gpsKm * 10) / 10) },
      { label: 'Km facturables', value: (t) => t.billableKm },
      { label: 'Kilos', value: (t) => t.kg },
      { label: 'Importe', value: (t) => t.amount },
      { label: 'Moneda', value: (t) => (t.amount ? t.currency : '') },
      { label: 'Notas', value: (t) => t.notes },
      { label: 'Registro', value: (t) => (t.source === 'app' ? 'App GPS' : 'Cargado a mano') },
    ]);
    download(`viajes_${filters.from}_a_${filters.to}.csv`, csv, 'text/csv;charset=utf-8');
  };

  const row = (t) => {
    const route = (t.originName || t.destinationName)
      ? `${t.originName || '¿origen?'} → ${t.destinationName || '¿destino?'}`
      : 'Origen y destino por completar';
    const sub = [t.client, t.product].filter(Boolean).join(' · ') || 'Cliente y producto por completar';
    return h('a', { class: 'trip-row ' + t.status.code, href: '#/viaje/' + t.key, dataset: { key: t.key } },
      h('div', { class: 'c-date' }, h('strong', null, formatDateTime(t.departureAt)),
        h('small', null, t.source === 'app' ? 'App GPS' : 'Cargado a mano', t.orderNumber ? ` · Orden ${t.orderNumber}` : '')),
      h('div', { class: 'c-truck' }, plateBadge(t.vehicle, true), h('small', null, t.driverName || 'Chofer sin indicar')),
      h('div', { class: 'c-route' }, h('strong', null, route), h('small', null, sub)),
      h('div', { class: 'c-km' }, h('strong', null, t.billableKm ? `${formatNumber(t.billableKm, 0)} km` : t.gpsKm !== null ? `${formatNumber(t.gpsKm, 1)} km` : '—'),
        h('small', null, t.billableKm ? 'facturables' : t.gpsKm !== null ? 'GPS' : '')),
      h('div', { class: 'c-status' }, statusPill(t.status),
        t.status.missing.length && !t.deleted ? h('small', null, 'Falta: ' + t.status.missing.join(', ')) : null));
  };

  const render = () => {
    const counts = countByStatus(trips);
    clear(tabsEl,
      STATUS_TABS.map(([code, label]) => h('button', {
        type: 'button', role: 'tab', 'aria-selected': String(!filters.bin && filters.status === code),
        class: 'tab' + (!filters.bin && filters.status === code ? ' on' : ''),
        onclick: () => { filters.status = code; filters.bin = false; saveFilters(filters); render(); },
      }, `${label} (${counts[code] || 0})`)),
      h('button', {
        type: 'button', role: 'tab', 'aria-selected': String(filters.bin), class: 'tab bin' + (filters.bin ? ' on' : ''),
        onclick: () => { filters.bin = !filters.bin; saveFilters(filters); render(); },
      }, `Eliminados (${counts.eliminado})`));
    const { drivers, vehicles } = knownValues(trips);
    fillSelect(vehicleSel, vehicles, 'Todos los camiones', filters.vehicle);
    fillSelect(driverSel, drivers, 'Todos los choferes', filters.driver);
    const shown = filterTrips(trips, filters);
    clear(listEl, shown.length ? shown.map(row) : h('div', { class: 'empty' },
      filters.bin ? 'No hay viajes eliminados en este período.' : trips.length ? 'Ningún viaje coincide con el filtro.' : 'No hay viajes en este período.'));
    infoEl.textContent = loadedAt
      ? `${shown.length} de ${counts.all} viajes · actualizado ${loadedAt.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}`
      : '';
  };

  const reload = async (silent = false) => {
    if (loadingNow) return;
    const range = rangeToIso(filters.from, filters.to);
    if (!range) { clear(messageEl, banner('error', 'Revisá las fechas del período: la fecha "hasta" no puede ser anterior a "desde".')); return; }
    loadingNow = true;
    if (!silent) { clear(messageEl); clear(listEl, loading('Cargando viajes…')); }
    try {
      trips = await loadTrips(range);
      ctx.knownTrips = trips;
      loadedAt = new Date();
      clear(messageEl);
      render();
    } catch (e) {
      if (!silent || !trips.length) clear(listEl);
      clear(messageEl, banner('error', describeError(e), { label: 'Reintentar', run: () => reload() }));
    } finally {
      loadingNow = false;
    }
  };

  periodSel.addEventListener('change', () => {
    filters.period = periodSel.value;
    customBox.hidden = filters.period !== 'custom';
    if (filters.period !== 'custom') {
      Object.assign(filters, periodRange(filters.period));
      fromInput.value = filters.from;
      toInput.value = filters.to;
    }
    saveFilters(filters);
    reload();
  });
  for (const input of [fromInput, toInput]) {
    input.addEventListener('change', () => { filters.from = fromInput.value; filters.to = toInput.value; saveFilters(filters); reload(); });
  }
  search.addEventListener('input', () => { filters.q = search.value; saveFilters(filters); render(); });
  vehicleSel.addEventListener('change', () => { filters.vehicle = vehicleSel.value; saveFilters(filters); render(); });
  driverSel.addEventListener('change', () => { filters.driver = driverSel.value; saveFilters(filters); render(); });

  clear(root, h('section', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'Viajes'), h('p', { class: 'muted' }, 'Los viajes de la app aparecen solos. Completá los datos que falten.')),
      h('div', { class: 'row gap wrap' },
        h('button', { class: 'btn ghost', type: 'button', onclick: exportCsv }, 'Exportar a Excel'),
        h('button', { class: 'btn primary', type: 'button', onclick: newTrip }, '+ Nuevo viaje'))),
    h('div', { class: 'filters card' },
      h('div', { class: 'row gap wrap' }, periodSel, customBox, search, vehicleSel, driverSel)),
    tabsEl,
    h('div', { class: 'row between' }, infoEl, h('button', { class: 'btn small ghost', type: 'button', onclick: () => reload() }, 'Actualizar')),
    messageEl,
    listEl));

  reload();
  timer = setInterval(() => {
    if (!document.hidden && !document.querySelector('dialog[open]')) reload(true);
  }, 60000);
  return () => clearInterval(timer);
}
