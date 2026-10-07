// Fuel receipts sent by the drivers (read only; corrections made in panel_data are shown).
import { describeError, signedUrl } from '../api.js';
import { loadFuel } from '../data.js';
import { fuelFromReceipt } from '../trips.js';
import { banner, clear, download, h, loading, openModal } from '../ui.js';
import { formatDate, formatMoney, formatNumber, periodRange, rangeToIso, toCsv } from '../util.js';

export function fuelView(root) {
  let period = 'month';
  let range = periodRange(period);
  let rows = [];
  const tableBody = h('tbody');
  const totalsEl = h('div', { class: 'facts' });
  const messageEl = h('div');
  const vehicleSel = h('select', { 'aria-label': 'Camión' });
  const periodSel = h('select', { 'aria-label': 'Período' },
    h('option', { value: 'month' }, 'Este mes'), h('option', { value: 'prev-month' }, 'Mes anterior'),
    h('option', { value: '30' }, 'Últimos 30 días'), h('option', { value: '90' }, 'Últimos 90 días'));

  const photo = (path) => {
    const body = h('div', { class: 'photo-box' }, loading('Abriendo boleta…'));
    openModal({ title: 'Boleta de combustible', body, wide: true });
    signedUrl('trf-fuel-receipts', path)
      .then((url) => clear(body, h('img', { src: url, alt: 'Boleta de combustible', class: 'photo' })))
      .catch((e) => clear(body, banner('error', e?.status === 400 || e?.status === 404 ? 'La foto todavía no llegó al servidor o no tenés permiso para verla.' : describeError(e))));
  };

  const shown = () => rows.filter((f) => !vehicleSel.value || (f.vehicle || '') === vehicleSel.value);

  const render = () => {
    const list = shown();
    clear(tableBody, list.length ? list.map((f) => h('tr', null,
      h('td', null, formatDate(f.date)),
      h('td', null, f.vehicle || 'Sin camión'),
      h('td', null, f.driverName || '—'),
      h('td', null, f.station || 'Por completar'),
      h('td', { class: 'n' }, f.liters !== null ? formatNumber(f.liters, 1) : '—'),
      h('td', { class: 'n' }, f.total !== null ? formatMoney(f.total, f.currency) : '—'),
      h('td', null, f.tripId ? h('a', { href: '#/viaje/app:' + f.tripId }, 'Ver viaje') : h('span', { class: 'muted' }, 'Fuera de viaje')),
      h('td', null, f.objectPath ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => photo(f.objectPath) }, 'Boleta') : null)))
      : h('tr', null, h('td', { colspan: 8, class: 'muted' }, 'No hay cargas de combustible en este período.')));
    const liters = list.reduce((a, f) => a + (f.liters || 0), 0);
    const uyu = list.filter((f) => f.currency === 'UYU').reduce((a, f) => a + (f.total || 0), 0);
    const usd = list.filter((f) => f.currency === 'USD').reduce((a, f) => a + (f.total || 0), 0);
    clear(totalsEl,
      h('div', { class: 'fact' }, h('span', { class: 'label' }, 'Cargas'), h('strong', null, String(list.length))),
      h('div', { class: 'fact' }, h('span', { class: 'label' }, 'Litros'), h('strong', null, formatNumber(liters, 1))),
      h('div', { class: 'fact' }, h('span', { class: 'label' }, 'Gasto en pesos'), h('strong', null, formatMoney(uyu, 'UYU'))),
      usd ? h('div', { class: 'fact' }, h('span', { class: 'label' }, 'Gasto en dólares'), h('strong', null, formatMoney(usd, 'USD'))) : null);
  };

  const reload = async () => {
    clear(messageEl);
    clear(tableBody, h('tr', null, h('td', { colspan: 8 }, loading('Cargando combustible…'))));
    try {
      rows = (await loadFuel(rangeToIso(range.from, range.to))).map(fuelFromReceipt);
    } catch (e) {
      clear(tableBody);
      clear(messageEl, banner('error', describeError(e), { label: 'Reintentar', run: reload }));
      return;
    }
    const vehicles = [...new Set(rows.map((f) => f.vehicle).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    const current = vehicleSel.value;
    vehicleSel.replaceChildren(h('option', { value: '' }, 'Todos los camiones'), ...vehicles.map((v) => h('option', { value: v }, v)));
    vehicleSel.value = vehicles.includes(current) ? current : '';
    render();
  };

  const exportCsv = () => download(`combustible_${range.from}_a_${range.to}.csv`, toCsv(shown(), [
    { label: 'Fecha', value: (f) => formatDate(f.date) },
    { label: 'Camión', value: (f) => f.vehicle },
    { label: 'Chofer', value: (f) => f.driverName },
    { label: 'Estación', value: (f) => f.station },
    { label: 'Litros', value: (f) => f.liters },
    { label: 'Total', value: (f) => f.total },
    { label: 'Moneda', value: (f) => f.currency },
    { label: 'Viaje', value: (f) => (f.tripId ? 'Sí' : 'Fuera de viaje') },
  ]), 'text/csv;charset=utf-8');

  periodSel.addEventListener('change', () => { period = periodSel.value; range = periodRange(period); reload(); });
  vehicleSel.addEventListener('change', render);

  clear(root, h('section', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'Combustible'), h('p', { class: 'muted' }, 'Cargas enviadas por los choferes desde la app.')),
      h('button', { class: 'btn ghost', type: 'button', onclick: exportCsv }, 'Exportar a Excel')),
    h('div', { class: 'filters card' }, h('div', { class: 'row gap wrap' }, periodSel, vehicleSel)),
    messageEl, totalsEl,
    h('div', { class: 'card scroll' }, h('table', null,
      h('thead', null, h('tr', null, ['Fecha', 'Camión', 'Chofer', 'Estación'].map((c) => h('th', null, c)),
        h('th', { class: 'n' }, 'Litros'), h('th', { class: 'n' }, 'Total'), h('th', null, 'Viaje'), h('th', null, ''))),
      tableBody))));
  reload();
}
