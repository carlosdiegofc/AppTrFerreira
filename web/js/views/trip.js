// Trip detail: load-order style header, the real GPS route on a map, delivery notes and fuel.
import { describeError, signedUrl } from '../api.js';
import { loadRoute, loadTrip, roadRoute, setDeleted } from '../data.js';
import * as maps from '../map.js';
import { fuelFromReceipt, routeSegments, routeStats } from '../trips.js';
import { banner, clear, confirmDialog, h, icon, loading, openModal, plateBadge, statusPill, toast } from '../ui.js';
import { distanceMeters, formatDateTime, formatDuration, formatMoney, formatNumber } from '../util.js';
import { openTripForm } from './tripForm.js';
import { knownValues } from './trips.js';

const LIVE_MS = 30000;

function photoModal(bucket, path, title) {
  const body = h('div', { class: 'photo-box' }, loading('Abriendo foto…'));
  openModal({ title, body, wide: true });
  signedUrl(bucket, path)
    .then((url) => clear(body, h('img', { src: url, alt: title, class: 'photo' }), h('p', null, h('a', { href: url, target: '_blank', rel: 'noopener' }, 'Abrir en otra pestaña'))))
    .catch((e) => clear(body, banner('error', e?.status === 400 || e?.status === 404 ? 'La foto todavía no llegó al servidor o no tenés permiso para verla.' : describeError(e))));
}

export function tripView(root, ctx, { kind, id }) {
  const page = h('section', { class: 'page' });
  clear(root, page);
  let data = null;
  let map = null;
  let mapLayers = null;
  let liveTimer = null;
  let fittedOnce = false;
  let alive = true;

  const backLink = () => h('a', { class: 'back', href: '#/viajes' }, icon('back', 18), 'Viajes');

  const stopLive = () => { clearInterval(liveTimer); liveTimer = null; };
  const destroyMap = () => { stopLive(); if (map) { maps.destroy(map); map = null; mapLayers = null; fittedOnce = false; } };

  async function load() {
    destroyMap();
    clear(page, backLink(), loading('Cargando viaje…'));
    try {
      data = await loadTrip({ kind, id });
    } catch (e) {
      clear(page, backLink(), banner('error', describeError(e), { label: 'Reintentar', run: load }));
      return;
    }
    if (!alive) return;
    if (!data) { clear(page, backLink(), banner('error', 'Este viaje no existe o tu cuenta no puede verlo.')); return; }
    render();
  }

  const edit = () => openTripForm({
    trip: data.trip, catalog: ctx.catalog, ...knownValues(ctx.knownTrips || []),
    onSaved: () => load(), onConflict: () => load(),
  });

  async function remove() {
    const t = data.trip;
    const ok = await confirmDialog({
      title: '¿Eliminar este viaje?',
      message: t.source === 'app'
        ? 'Se quita de la lista de viajes. El recorrido GPS y lo que envió el chofer no se borran. Podés restaurarlo desde "Eliminados".'
        : 'Se mueve a "Eliminados". Podés restaurarlo cuando quieras.',
      confirmLabel: 'Eliminar', danger: true,
    });
    if (!ok) return;
    try {
      await setDeleted(t, true);
      toast('Viaje eliminado. Podés restaurarlo desde "Eliminados".');
    } catch (e) {
      toast(describeError(e), 'error');
    }
    load();
  }

  async function restore() {
    try {
      await setDeleted(data.trip, false);
      toast('Viaje restaurado.');
    } catch (e) {
      toast(describeError(e), 'error');
    }
    load();
  }

  function render() {
    destroyMap();
    const t = data.trip;
    const actions = t.deleted
      ? [h('button', { class: 'btn primary', type: 'button', onclick: restore }, 'Restaurar viaje')]
      : [h('button', { class: 'btn primary', type: 'button', onclick: edit }, t.panelId ? 'Editar datos' : 'Completar datos'),
        h('button', { class: 'btn danger ghost', type: 'button', onclick: remove }, 'Eliminar')];

    const kmLabel = t.billableKm ? `${formatNumber(t.billableKm, 0)} km` : t.gpsKm !== null ? `${formatNumber(t.gpsKm, 1)} km` : 'km sin datos';
    const place = (kind2, name, when, whenLabel) => h('div', { class: 'place ' + kind2 },
      h('span', { class: 'place-icon' }, icon(kind2 === 'origin' ? 'plant' : 'flag', 30)),
      h('strong', null, name || (kind2 === 'origin' ? 'Origen por completar' : 'Destino por completar')),
      h('small', null, when ? `${whenLabel} ${formatDateTime(when)}` : (kind2 === 'destination' && t.active ? 'En viaje' : '')));

    const facts = [
      ['Cliente', t.client || '—'],
      ['Kilos', t.kg ? `${formatNumber(t.kg, 0)} kg` : '—'],
      ['Km GPS', t.gpsKm !== null ? `${formatNumber(t.gpsKm, 1)} km` : 'Sin GPS'],
      ['Km facturables', t.billableKm ? `${formatNumber(t.billableKm, 0)} km` : '—'],
      ['Importe', t.amount ? formatMoney(t.amount, t.currency) : '—'],
      ['Duración', t.arrivalAt && t.departureAt ? formatDuration(new Date(t.arrivalAt) - new Date(t.departureAt)) : t.active ? formatDuration(Date.now() - new Date(t.departureAt)) + ' (en curso)' : '—'],
      ['Camión', t.vehicle || 'Sin camión asignado'],
      ['Última edición', t.updatedAt ? formatDateTime(t.updatedAt) : 'Sin editar'],
    ];

    const mapEl = h('div', { class: 'map big', id: 'trip-map' });
    const mapInfo = h('div', { class: 'map-info' });
    const liveBadge = t.active ? h('span', { class: 'pill en_curso' }, 'En vivo · se actualiza cada 30 s') : null;
    const mapTitle = t.source === 'app' ? (t.active ? 'Recorrido en vivo' : 'Recorrido real (GPS)') : 'Ruta sugerida';

    const docs = data.documents || [];
    const fuel = (data.fuel || []).map(fuelFromReceipt);

    clear(page,
      backLink(),
      t.deleted ? banner('warn', 'Este viaje está en "Eliminados". No aparece en la lista ni en los totales hasta que lo restaures.') : null,
      h('div', { class: 'trip-head' },
        h('div', null,
          h('p', { class: 'eyebrow' }, t.source === 'app' ? 'Registrado por la app' : 'Cargado a mano'),
          h('h1', null, t.driverName || 'Chofer sin indicar')),
        plateBadge(t.vehicle)),
      h('div', { class: 'row between wrap status-row' },
        h('div', { class: 'row gap wrap' }, statusPill(t.status),
          t.status.missing.length && !t.deleted ? h('span', { class: 'muted' }, 'Falta completar: ' + t.status.missing.join(', ')) : null),
        h('div', { class: 'row gap wrap' }, actions)),
      h('div', { class: 'card order-card' },
        h('div', { class: 'order-top' },
          h('div', null, h('span', { class: 'label' }, 'Orden de carga'), h('strong', null, t.orderNumber || '—')),
          h('div', null, h('span', { class: 'label' }, 'Producto'), h('strong', null, t.product || '—'))),
        h('div', { class: 'route-line' },
          place('origin', t.originName, t.departureAt, 'Salida'),
          h('div', { class: 'distance' }, h('span', { id: 'trip-km' }, kmLabel), h('i', { 'aria-hidden': 'true' })),
          place('destination', t.destinationName, t.arrivalAt, 'Llegada'))),
      h('div', { class: 'facts' }, facts.map(([label, value]) => h('div', { class: 'fact' }, h('span', { class: 'label' }, label), h('strong', null, value)))),
      h('section', { class: 'card' },
        h('div', { class: 'row between wrap' }, h('h2', null, mapTitle), liveBadge),
        mapEl, mapInfo),
      t.source === 'app' ? h('section', { class: 'card' },
        h('h2', null, `Remitos (${docs.length})`),
        docs.length ? h('ul', { class: 'items' }, docs.map((d) => h('li', null,
          h('div', null, h('strong', null, `${d.kind === 'arrival' ? 'Llegada' : 'Salida'} · ${d.number || 'sin número'}`),
            h('small', null, [d.cargo_type, d.kg ? `${formatNumber(d.kg, 0)} kg` : null, formatDateTime(d.created_at)].filter(Boolean).join(' · '))),
          d.object_path ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => photoModal('trf-trip-documents', d.object_path, `Remito ${d.number || ''}`.trim()) }, 'Ver foto') : h('small', { class: 'muted' }, 'Sin foto'))))
          : h('p', { class: 'muted' }, 'El chofer no cargó remitos en este viaje.')) : null,
      t.source === 'app' ? h('section', { class: 'card' },
        h('h2', null, `Combustible en el viaje (${fuel.length})`),
        fuel.length ? h('ul', { class: 'items' }, fuel.map((f) => h('li', null,
          h('div', null, h('strong', null, f.station || 'Estación por completar'),
            h('small', null, [f.liters !== null ? `${formatNumber(f.liters, 1)} L` : null, f.total !== null ? formatMoney(f.total, f.currency) : null, formatDateTime(f.recordedAt)].filter(Boolean).join(' · '))),
          f.objectPath ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => photoModal('trf-fuel-receipts', f.objectPath, 'Boleta de combustible') }, 'Ver boleta') : null)))
          : h('p', { class: 'muted' }, 'Sin cargas de combustible asociadas.')) : null,
      t.notes ? h('section', { class: 'card' }, h('h2', null, 'Notas'), h('p', { class: 'notes' }, t.notes)) : null);

    drawMap(mapEl, mapInfo);
  }

  function drawMap(mapEl, mapInfo) {
    const t = data.trip;
    if (t.source !== 'app') {
      if (!t.origin || !t.destination) {
        mapEl.replaceWith(h('div', { class: 'map-empty' }, 'Para ver la ruta en el mapa, marcá el origen y el destino con "Buscar en el mapa" en Editar datos.'));
        return;
      }
      map = maps.createMap(mapEl);
      mapLayers = maps.featureGroup([maps.marker(t.origin, 'origin', t.originName || 'Origen'), maps.marker(t.destination, 'destination', t.destinationName || 'Destino')]).addTo(map);
      maps.fit(map, [t.origin, t.destination]);
      clear(mapInfo, h('span', { class: 'muted' }, 'Buscando la ruta por carretera…'));
      roadRoute(t.origin, t.destination)
        .then((r) => {
          if (!map || !r) { clear(mapInfo, h('span', { class: 'muted' }, 'No se encontró una ruta por carretera.')); return; }
          maps.lines([r.line], { color: maps.COLORS.suggested, dashed: true }).addTo(mapLayers);
          maps.fit(map, r.line);
          const kmEl = document.getElementById('trip-km');
          if (kmEl && !t.billableKm) kmEl.textContent = `≈ ${formatNumber(r.km, 0)} km`;
          clear(mapInfo, h('span', null, `Ruta sugerida: ${formatNumber(r.km, 0)} km · aprox. ${formatDuration(r.minutes * 60000)} de manejo. Es una estimación: este viaje no tiene GPS.`));
        })
        .catch(() => clear(mapInfo, h('span', { class: 'muted' }, 'El servicio de rutas no responde ahora. Se muestran origen y destino.')));
      return;
    }
    map = maps.createMap(mapEl);
    map.on('dragstart zoomstart', () => { if (fittedOnce) fittedOnce = 'user'; });
    const paint = async () => {
      let points;
      try {
        points = await loadRoute(data.session);
      } catch (e) {
        clear(mapInfo, banner('error', describeError(e), { label: 'Reintentar', run: paint }));
        return;
      }
      if (!map) return;
      if (mapLayers) map.removeLayer(mapLayers);
      mapLayers = maps.featureGroup().addTo(map);
      const segments = routeSegments(points);
      const all = segments.flat();
      const stats = routeStats(points);
      if (!all.length) {
        const ends = [t.gpsStart, t.gpsEnd].filter(Boolean);
        ends.forEach((p, i) => maps.marker(p, i === 0 ? 'origin' : 'destination', i === 0 ? 'Inicio GPS' : 'Fin GPS').addTo(mapLayers));
        if (t.destination) maps.marker(t.destination, 'destination', 'Destino previsto').addTo(mapLayers);
        maps.fit(map, [...ends, t.destination]);
        clear(mapInfo, h('span', { class: 'muted' }, t.active
          ? 'Todavía no llegaron puntos GPS de este viaje. Se actualizará solo.'
          : 'Este viaje no tiene recorrido guardado en el servidor (el chofer pudo no dar permiso de GPS, o quedan datos pendientes de envío en su teléfono).'));
        return;
      }
      maps.lines(segments).addTo(mapLayers);
      const first = all[0];
      const last = all[all.length - 1];
      maps.marker(first, 'origin', 'Salida · ' + formatDateTime(t.departureAt)).addTo(mapLayers);
      if (t.active) maps.marker(last, 'truck', `${t.vehicle || 'Camión'} · ahora`).addTo(mapLayers);
      else maps.marker(last, 'destination', 'Llegada · ' + formatDateTime(t.arrivalAt)).addTo(mapLayers);
      const showPlanned = t.destination && distanceMeters(t.destination, last) > 2000;
      if (showPlanned) maps.marker(t.destination, 'destination', 'Destino previsto: ' + (t.destinationName || ''), '#6b7a90').addTo(mapLayers);
      if (fittedOnce !== 'user') { maps.fit(map, showPlanned ? [...all, t.destination] : all); fittedOnce = true; }
      clear(mapInfo,
        h('span', null, `${formatNumber(stats.count, 0)} puntos GPS`),
        h('span', null, `Duración: ${formatDuration(stats.durationMs)}`),
        h('span', null, `Velocidad máxima: ${stats.maxSpeedKmh !== null ? formatNumber(stats.maxSpeedKmh, 0) + ' km/h' : '—'}`),
        segments.length > 1 ? h('span', { class: 'muted' }, `${segments.length - 1} corte(s) por pausa o falta de señal`) : null);
    };
    paint();
    if (t.active) {
      liveTimer = setInterval(async () => {
        if (document.hidden || document.querySelector('dialog[open]')) return;
        try {
          const fresh = await loadTrip({ kind, id });
          if (!alive || !fresh) return;
          const wasActive = data.trip.active;
          data = fresh;
          if (!fresh.trip.active && wasActive) { render(); return; }
          paint();
        } catch { /* keep the last map; next tick retries */ }
      }, LIVE_MS);
    }
  }

  load();
  return () => { alive = false; destroyMap(); };
}
