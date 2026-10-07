// "Completar datos" / "Editar" / "Nuevo viaje" form.
import { describeError } from '../api.js';
import { placeName, saveTrip, searchPlaces } from '../data.js';
import { formValues, LIMITS, validateTripForm } from '../trips.js';
import { banner, confirmDialog, h, openModal, toast } from '../ui.js';
import { formatDateTime, formatNumber, parseNumber, toLocalInput } from '../util.js';

let lastSearchAt = 0;

function catalogVehicles(catalog) {
  const list = Array.isArray(catalog?.equipos) ? catalog.equipos : [];
  return list.map((e) => [e?.tipo, e?.matriculaCamion].filter((x) => x && String(x).trim()).join(' · ')).filter(Boolean);
}
const strings = (v) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : x?.nombre)).filter(Boolean) : []);

/**
 * Opens the form. trip = null → new manual trip.
 * onSaved(row) runs after a successful save; onConflict() when someone else changed the trip meanwhile.
 */
export function openTripForm({ trip = null, catalog = {}, drivers = [], vehicles = [], onSaved, onConflict }) {
  const mode = trip && trip.source === 'app' ? 'app' : 'manual';
  const initial = formValues(trip);
  if (!trip) initial.departure_at = new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
  const coords = { origin: initial.origin, destination: initial.destination };
  const inputs = {};
  const errorsEl = {};

  const datalist = (id, values) => h('datalist', { id }, [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')).map((v) => h('option', { value: v })));
  const clientCargoes = () => {
    const entry = (Array.isArray(catalog?.clientesDetalle) ? catalog.clientesDetalle : [])
      .find((c) => String(c?.nombre || '').toLowerCase() === String(inputs.client?.value || '').trim().toLowerCase());
    return strings(entry?.cargas);
  };
  const lists = h('div', { hidden: true },
    datalist('dl-clients', strings(catalog?.clientes)),
    datalist('dl-products', [...strings(catalog?.tiposCarga), 'Retorno vacío']),
    datalist('dl-vehicles', [...catalogVehicles(catalog), ...vehicles]),
    datalist('dl-drivers', drivers));

  const field = (name, label, control, { hint, wide } = {}) => {
    inputs[name] = control;
    errorsEl[name] = h('p', { class: 'field-error', id: `err-${name}`, 'aria-live': 'polite' });
    control.id = `f-${name}`;
    control.setAttribute('aria-describedby', `err-${name}`);
    // An old error message disappears as soon as the field is edited.
    control.addEventListener('input', () => { errorsEl[name].textContent = ''; control.classList.remove('invalid'); });
    return h('div', { class: 'field' + (wide ? ' wide' : '') },
      h('label', { for: `f-${name}` }, label), control, hint ? h('p', { class: 'hint' }, hint) : null, errorsEl[name]);
  };
  const textInput = (name, list) => h('input', { type: 'text', value: initial[name] ?? '', maxlength: LIMITS[name], list, autocomplete: 'off' });
  const numberInput = (name, unit, decimals) => {
    const start = initial[name] === null || initial[name] === undefined ? '' : Number(initial[name]).toLocaleString('es-UY', { maximumFractionDigits: decimals });
    const input = h('input', { type: 'text', inputmode: 'decimal', value: start, autocomplete: 'off' });
    const preview = h('p', { class: 'hint' });
    const update = () => {
      const r = parseNumber(input.value);
      preview.textContent = r.ok ? (r.value === null ? '' : `Se guarda: ${r.value.toLocaleString('es-UY', { maximumFractionDigits: decimals })} ${unit}`.trim()) : r.error;
      preview.classList.toggle('bad', !r.ok);
    };
    input.addEventListener('input', update);
    update();
    input.preview = preview;
    return input;
  };

  // --- place (name + optional map point) -------------------------------------------------------
  const placeField = (prefix, label, gpsPoint, gpsLabel) => {
    const nameKey = prefix + '_name';
    const input = textInput(nameKey);
    const chip = h('div', { class: 'coords' });
    const results = h('div', { class: 'place-results' });
    const renderChip = () => {
      const c = coords[prefix];
      chip.replaceChildren(...(c ? [
        h('span', null, `📍 Ubicación marcada en el mapa (${c[0].toFixed(4)}, ${c[1].toFixed(4)})`),
        h('button', { class: 'link', type: 'button', onclick: () => { coords[prefix] = null; renderChip(); } }, 'Quitar'),
      ] : [h('span', { class: 'muted' }, 'Sin ubicación en el mapa (opcional, sirve para la ruta sugerida).')]));
    };
    const search = async () => {
      const q = input.value.trim();
      if (q.length < 3) { results.replaceChildren(h('p', { class: 'hint bad' }, 'Escribí al menos 3 letras del lugar.')); return; }
      const wait = 1100 - (Date.now() - lastSearchAt);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastSearchAt = Date.now();
      results.replaceChildren(h('p', { class: 'hint' }, 'Buscando…'));
      try {
        const found = await searchPlaces(q);
        results.replaceChildren(...(found.length ? found.map((p) => h('button', {
          class: 'place-option', type: 'button',
          onclick: () => {
            coords[prefix] = [p.lat, p.lng];
            if (!input.value.trim() || input.value.trim().length < 3) input.value = p.short;
            results.replaceChildren();
            renderChip();
          },
        }, p.label)) : [h('p', { class: 'hint' }, 'No se encontró. Probá con el nombre de la ciudad.')]));
      } catch {
        results.replaceChildren(h('p', { class: 'hint bad' }, 'La búsqueda en el mapa no responde ahora. Podés guardar igual con el nombre escrito.'));
      }
    };
    const fromGps = async () => {
      coords[prefix] = gpsPoint;
      renderChip();
      if (input.value.trim()) return;
      try {
        const name = await placeName(gpsPoint[0], gpsPoint[1]);
        if (name && !input.value.trim()) input.value = name;
      } catch {
        toast('Se marcó la ubicación GPS, pero no se pudo obtener el nombre del lugar. Escribilo a mano.', 'warn');
      }
    };
    renderChip();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
    const node = field(nameKey, label, input, { wide: true });
    node.append(h('div', { class: 'row gap' },
      h('button', { class: 'btn small ghost', type: 'button', onclick: search }, 'Buscar en el mapa'),
      gpsPoint ? h('button', { class: 'btn small ghost', type: 'button', onclick: fromGps }, gpsLabel) : null),
    chip, results);
    return node;
  };

  // --- layout -----------------------------------------------------------------------------------
  const gpsInfo = mode === 'app' ? h('div', { class: 'gps-facts' },
    h('strong', null, 'Datos del GPS (los registra la app y no se editan)'),
    h('span', null, `Chofer: ${trip.driverName || '—'}`),
    h('span', null, `Salida: ${formatDateTime(trip.departureAt)}`),
    h('span', null, `Llegada: ${trip.arrivalAt ? formatDateTime(trip.arrivalAt) : 'en curso'}`),
    h('span', null, `Recorrido GPS: ${formatNumber(trip.gpsKm, 1)} km`)) : null;

  const kgInput = numberInput('kg', 'kg', 1);
  const kmInput = numberInput('billable_km', 'km', 1);
  const amountInput = numberInput('amount', '', 2);
  const currency = h('select', null, h('option', { value: 'UYU' }, 'Pesos ($)'), h('option', { value: 'USD' }, 'Dólares (US$)'));
  currency.value = initial.currency;
  const notes = h('textarea', { rows: 3, maxlength: LIMITS.notes }, initial.notes || '');
  const departure = h('input', { type: 'datetime-local', value: toLocalInput(initial.departure_at) });
  const arrival = h('input', { type: 'datetime-local', value: toLocalInput(initial.arrival_at) });
  const product = textInput('product', 'dl-products');

  const formError = h('div');
  const form = h('form', { class: 'trip-form', novalidate: true },
    lists, gpsInfo, formError,
    h('fieldset', null, h('legend', null, 'Carga'),
      h('div', { class: 'grid2' },
        field('order_number', 'Orden de carga', textInput('order_number')),
        field('client', 'Cliente', textInput('client', 'dl-clients')),
        field('product', 'Producto', product),
        field('kg', 'Kilos', kgInput, { hint: '' }))),
    h('fieldset', null, h('legend', null, 'Recorrido'),
      h('div', { class: 'grid2' },
        placeField('origin', 'Origen', mode === 'app' ? trip.gpsStart : null, 'Usar inicio GPS'),
        placeField('destination', 'Destino', mode === 'app' ? (trip.gpsEnd || null) : null, 'Usar llegada GPS'),
        mode === 'manual' ? field('departure_at', 'Salida', departure) : null,
        mode === 'manual' ? field('arrival_at', 'Llegada', arrival, { hint: 'Opcional' }) : null,
        field('billable_km', 'Km facturables', kmInput, { hint: mode === 'app' ? `GPS: ${formatNumber(trip.gpsKm, 1)} km` : '' }))),
    h('fieldset', null, h('legend', null, 'Camión y chofer'),
      h('div', { class: 'grid2' },
        field('vehicle', 'Camión', textInput('vehicle', 'dl-vehicles'), { hint: mode === 'app' ? `En la app: ${trip.appVehicle || 'sin camión'}` : 'Ej.: Ford Cargo 1722 · ITP2187' }),
        mode === 'manual' ? field('driver_name', 'Chofer', textInput('driver_name', 'dl-drivers')) : null)),
    h('fieldset', null, h('legend', null, 'Facturación'),
      h('div', { class: 'grid2' },
        field('amount', 'Importe', amountInput),
        field('currency', 'Moneda', currency))),
    field('notes', 'Notas', notes, { wide: true }));

  // number previews go right under their inputs
  for (const input of [kgInput, kmInput, amountInput]) input.after(input.preview);
  const allProducts = [...new Set([...strings(catalog?.tiposCarga), 'Retorno vacío'])];
  inputs.client.addEventListener('change', () => {
    const cargoes = clientCargoes();
    form.querySelector('#dl-products').replaceChildren(...(cargoes.length ? cargoes : allProducts).map((v) => h('option', { value: v })));
  });

  const read = () => ({
    order_number: inputs.order_number.value, client: inputs.client.value, product: inputs.product.value,
    origin_name: inputs.origin_name.value, origin: coords.origin, destination_name: inputs.destination_name.value, destination: coords.destination,
    vehicle: inputs.vehicle.value, driver_name: inputs.driver_name ? inputs.driver_name.value : '',
    departure_at: departure.value, arrival_at: arrival.value,
    billable_km: kmInput.value, kg: kgInput.value, amount: amountInput.value, currency: currency.value, notes: notes.value,
  });
  const snapshot = JSON.stringify(read());
  const dirty = () => JSON.stringify(read()) !== snapshot;

  const saveLabel = mode === 'app' && !trip.panelId ? 'Guardar datos' : 'Guardar';
  const saveBtn = h('button', { class: 'btn primary', type: 'submit' }, saveLabel);
  const cancelBtn = h('button', { class: 'btn ghost', type: 'button' }, 'Cancelar');
  form.append(h('div', { class: 'form-actions' }, cancelBtn, saveBtn));

  const modal = openModal({
    title: !trip ? 'Nuevo viaje' : trip.panelId ? 'Editar viaje' : 'Completar datos del viaje',
    body: form,
    wide: true,
    onRequestClose: async () => !dirty() || confirmDialog({
      title: '¿Salir sin guardar?', message: 'Hay cambios que no se guardaron. Si salís, se pierden.', confirmLabel: 'Salir sin guardar', cancelLabel: 'Seguir editando', danger: true,
    }),
  });
  cancelBtn.addEventListener('click', modal.request);

  let saving = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return;
    formError.replaceChildren();
    const result = validateTripForm(read(), mode);
    for (const [name, el] of Object.entries(errorsEl)) {
      el.textContent = result.errors[name] || '';
      inputs[name]?.classList.toggle('invalid', Boolean(result.errors[name]));
    }
    if (!result.ok) {
      formError.replaceChildren(banner('error', 'Revisá los campos marcados en rojo.'));
      const first = Object.keys(result.errors).map((n) => inputs[n]).find(Boolean);
      first?.focus();
      return;
    }
    if (trip?.panelId && !dirty()) { modal.close(); toast('No había cambios para guardar.'); return; }
    saving = true;
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    saveBtn.textContent = 'Guardando…';
    try {
      const row = await saveTrip(trip, result.payload);
      modal.close();
      toast(trip ? 'Viaje guardado.' : 'Viaje creado.');
      onSaved?.(row);
    } catch (err) {
      if (err?.conflict) {
        modal.close();
        toast(describeError(err), 'error');
        onConflict?.();
        return;
      }
      formError.replaceChildren(banner('error', describeError(err)));
      saving = false;
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
      saveBtn.textContent = saveLabel;
    }
  });
  (inputs.order_number || form.querySelector('input')).focus();
  return modal;
}
