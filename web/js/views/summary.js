// Monthly totals per truck: trips, kilometres, kilos, billing and fuel (per currency, never mixed).
import { describeError } from '../api.js';
import { loadFuel, loadTrips } from '../data.js';
import { fuelFromReceipt, summarize } from '../trips.js';
import { banner, clear, h, loading } from '../ui.js';
import { dayKey, formatMoney, formatNumber, rangeToIso } from '../util.js';

function months(count = 12, now = new Date()) {
  return Array.from({ length: count }, (_, i) => {
    const first = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    return { value: dayKey(first), label: first.toLocaleDateString('es-UY', { month: 'long', year: 'numeric' }), from: dayKey(first), to: dayKey(last) };
  });
}

// Litres per 100 km is only meaningful with enough kilometres in the month.
const MIN_KM_FOR_RATIO = 300;
const money = (pair) => [pair.UYU ? formatMoney(pair.UYU, 'UYU') : null, pair.USD ? formatMoney(pair.USD, 'USD') : null].filter(Boolean).join(' + ') || '—';

export function summaryView(root) {
  const options = months();
  const monthSel = h('select', { 'aria-label': 'Mes' }, options.map((o) => h('option', { value: o.value }, o.label)));
  const body = h('div');

  const reload = async () => {
    const m = options.find((o) => o.value === monthSel.value) || options[0];
    clear(body, loading('Calculando…'));
    try {
      const range = rangeToIso(m.from, m.to);
      const [trips, fuelRows] = await Promise.all([loadTrips(range), loadFuel(range)]);
      const s = summarize(trips, fuelRows.map(fuelFromReceipt));
      const pending = trips.filter((t) => !t.deleted && t.status.code === 'pendiente').length;
      clear(body,
        pending ? banner('warn', `${pending} viaje(s) de este mes todavía tienen datos por completar: los totales de facturación pueden estar incompletos.`, { label: 'Ver pendientes', run: () => { sessionStorage.setItem('trf-trips-filters', JSON.stringify({ period: 'custom', from: m.from, to: m.to, status: 'pendiente', bin: false })); location.hash = '#/viajes'; } }) : null,
        h('div', { class: 'facts' },
          [['Viajes', formatNumber(s.total.trips, 0)], ['Km GPS', formatNumber(s.total.gpsKm, 0)], ['Km facturables', formatNumber(s.total.billableKm, 0)],
            ['Kilos', formatNumber(s.total.kg, 0)], ['Facturado', money(s.total.billed)], ['Litros', formatNumber(s.total.liters, 0)], ['Combustible', money(s.total.fuel)],
            ['L/100 km', s.total.gpsKm >= MIN_KM_FOR_RATIO && s.total.liters ? formatNumber((s.total.liters / s.total.gpsKm) * 100, 1) : '—']]
            .map(([label, value]) => h('div', { class: 'fact' }, h('span', { class: 'label' }, label), h('strong', null, value)))),
        h('div', { class: 'card scroll' }, h('table', null,
          h('thead', null, h('tr', null, h('th', null, 'Camión'), ['Viajes', 'Km GPS', 'Km fact.', 'Kilos', 'Facturado', 'Litros', 'Combustible', 'L/100 km'].map((c) => h('th', { class: 'n' }, c)))),
          h('tbody', null, s.rows.length ? s.rows.map((r) => h('tr', null,
            h('td', null, r.vehicle),
            h('td', { class: 'n' }, String(r.trips)),
            h('td', { class: 'n' }, formatNumber(r.gpsKm, 0)),
            h('td', { class: 'n' }, formatNumber(r.billableKm, 0)),
            h('td', { class: 'n' }, formatNumber(r.kg, 0)),
            h('td', { class: 'n' }, money(r.billed)),
            h('td', { class: 'n' }, formatNumber(r.liters, 0)),
            h('td', { class: 'n' }, money(r.fuel)),
            h('td', { class: 'n' }, r.gpsKm >= MIN_KM_FOR_RATIO && r.liters ? formatNumber((r.liters / r.gpsKm) * 100, 1) : '—')))
            : h('tr', null, h('td', { colspan: 9, class: 'muted' }, 'Sin viajes ni combustible en este mes.'))))),
        h('p', { class: 'muted small' }, `Los viajes eliminados no se cuentan. Los importes en pesos y en dólares se muestran por separado. L/100 km se calcula con los litros cargados en el mes y los km GPS, solo si el camión hizo al menos ${MIN_KM_FOR_RATIO} km.`));
    } catch (e) {
      clear(body, banner('error', describeError(e), { label: 'Reintentar', run: reload }));
    }
  };

  monthSel.addEventListener('change', reload);
  clear(root, h('section', { class: 'page' },
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Resumen del mes'), h('p', { class: 'muted' }, 'Totales por camión.')), monthSel),
    body));
  reload();
}
