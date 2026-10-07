// Trip rules shared by every screen. Pure functions: no DOM, no network.
import { cleanText, firstValue, fold, fromLocalInput, parseNumber, splitVehicle, toNumber, validLatLng } from './util.js';

export const LIMITS = {
  order_number: 60, product: 120, client: 160, origin_name: 200, destination_name: 200,
  driver_name: 120, vehicle: 120, notes: 2000,
};
const MAX = { billable_km: 5000, kg: 100000, amount: 1e9 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v) => UUID.test(String(v ?? ''));

/** JSON columns may arrive as objects (jsonb) or as text (json saved as a string): both are accepted. */
export function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
  }
  return {};
}

export function parseTripKey(key) {
  const m = /^(app|web):(.+)$/.exec(String(key ?? ''));
  if (!m || !isUuid(m[2])) return null;
  return { kind: m[1], id: m[2].toLowerCase() };
}

function pair(lat, lng) {
  const a = toNumber(lat);
  const b = toNumber(lng);
  return validLatLng(a, b) ? [a, b] : null;
}

/** The app stores "Sin camión asignado" when the driver did not pick a truck: that is not a truck. */
function appVehicle(label) {
  return splitVehicle(label).label || null;
}

function withStatus(trip) {
  trip.status = tripStatus(trip);
  return trip;
}

/** A trip recorded by the app, plus what the office completed in the panel (panel values win). */
export function tripFromSession(session, panel, detail) {
  const p = panel || {};
  const d = asObject(detail?.data);
  const empty = session.load_type === 'empty';
  const origin = pair(p.origin_lat, p.origin_lng) || pair(session.origin_lat, session.origin_lng);
  const destination = pair(p.destination_lat, p.destination_lng) || pair(d.destination_lat, d.destination_lng);
  return withStatus({
    key: 'app:' + session.id,
    source: 'app',
    appTripId: String(session.id),
    panelId: p.id || null,
    panelUpdatedAt: p.updated_at || null,
    deleted: Boolean(p.deleted_at),
    deletedAt: p.deleted_at || null,
    active: session.active === true,
    paused: session.paused === true,
    driverId: session.driver_id || null,
    driverName: firstValue(p.driver_name, session.driver_name),
    vehicle: firstValue(p.vehicle, appVehicle(session.vehicle)),
    appVehicle: session.vehicle || null,
    departureAt: session.started_at || null,
    arrivalAt: session.ended_at || null,
    gpsKm: toNumber(session.distance_meters) === null ? null : toNumber(session.distance_meters) / 1000,
    loadType: session.load_type || null,
    orderNumber: firstValue(p.order_number),
    client: firstValue(p.client, d.cliente),
    product: firstValue(p.product, d.tipoCarga, empty ? 'Retorno vacío' : null),
    originName: firstValue(p.origin_name),
    origin,
    gpsStart: pair(session.origin_lat, session.origin_lng),
    destinationName: firstValue(p.destination_name, d.destino),
    destination,
    gpsEnd: pair(session.arrival_lat, session.arrival_lng),
    billableKm: toNumber(p.billable_km),
    kg: firstValue(toNumber(p.kg), toNumber(d.kg)),
    amount: toNumber(p.amount),
    currency: p.currency === 'USD' ? 'USD' : 'UYU',
    notes: firstValue(p.notes),
    updatedAt: p.updated_at || null,
  });
}

/** A trip typed by hand in the panel. */
export function tripFromPanel(p) {
  return withStatus({
    key: 'web:' + p.id,
    source: 'manual',
    appTripId: null,
    panelId: p.id,
    panelUpdatedAt: p.updated_at || null,
    deleted: Boolean(p.deleted_at),
    deletedAt: p.deleted_at || null,
    active: false,
    paused: false,
    driverId: p.driver_id || null,
    driverName: firstValue(p.driver_name),
    vehicle: firstValue(p.vehicle),
    appVehicle: null,
    departureAt: p.departure_at || null,
    arrivalAt: p.arrival_at || null,
    gpsKm: null,
    loadType: null,
    orderNumber: firstValue(p.order_number),
    client: firstValue(p.client),
    product: firstValue(p.product),
    originName: firstValue(p.origin_name),
    origin: pair(p.origin_lat, p.origin_lng),
    gpsStart: null,
    destinationName: firstValue(p.destination_name),
    destination: pair(p.destination_lat, p.destination_lng),
    gpsEnd: null,
    billableKm: toNumber(p.billable_km),
    kg: toNumber(p.kg),
    amount: toNumber(p.amount),
    currency: p.currency === 'USD' ? 'USD' : 'UYU',
    notes: firstValue(p.notes),
    updatedAt: p.updated_at || null,
  });
}

export function missingFields(trip) {
  const missing = [];
  if (!trip.vehicle) missing.push('Camión');
  if (!trip.originName) missing.push('Origen');
  if (!trip.destinationName) missing.push('Destino');
  if (trip.loadType !== 'empty') {
    if (!trip.client) missing.push('Cliente');
    if (!trip.product) missing.push('Producto');
  }
  return missing;
}

export function tripStatus(trip) {
  const missing = missingFields(trip);
  if (trip.deleted) return { code: 'eliminado', label: 'Eliminado', missing };
  if (trip.active) return { code: 'en_curso', label: trip.paused ? 'En curso · pausado' : 'En curso', missing };
  if (missing.length) return { code: 'pendiente', label: 'Pendiente de completar', missing };
  return { code: 'completo', label: 'Completo', missing };
}

const time = (v) => {
  const t = new Date(v ?? 0).getTime();
  return Number.isNaN(t) ? 0 : t;
};

/** App trips (each with its panel row and app details, when they exist) + manual trips, newest first. */
export function mergeTrips({ sessions = [], panelRows = [], details = [] }) {
  const panelByApp = new Map();
  const manual = new Map();
  for (const p of panelRows) {
    if (p.source === 'app' && p.app_trip_id) panelByApp.set(String(p.app_trip_id), p);
    else if (p.source === 'manual' && p.id) manual.set(p.id, p);
  }
  const detailByTrip = new Map(details.map((d) => [String(d.trip_id), d]));
  const bySession = new Map();
  for (const s of sessions) if (s && s.id) bySession.set(String(s.id), s);
  const list = [];
  for (const [id, s] of bySession) list.push(tripFromSession(s, panelByApp.get(id), detailByTrip.get(id)));
  for (const p of manual.values()) list.push(tripFromPanel(p));
  return list.sort((a, b) => time(b.departureAt) - time(a.departureAt) || a.key.localeCompare(b.key));
}

export function filterTrips(list, { q = '', status = 'all', vehicle = '', driver = '', bin = false } = {}) {
  const needle = fold(q);
  return list.filter((t) => {
    if (bin !== t.deleted) return false;
    if (!bin && status !== 'all' && t.status.code !== status) return false;
    if (vehicle && (t.vehicle || '') !== vehicle) return false;
    if (driver && (t.driverName || '') !== driver) return false;
    if (!needle) return true;
    return [t.orderNumber, t.client, t.product, t.originName, t.destinationName, t.driverName, t.vehicle, t.notes]
      .some((v) => v && fold(v).includes(needle));
  });
}

export function countByStatus(list) {
  const c = { all: 0, pendiente: 0, en_curso: 0, completo: 0, eliminado: 0 };
  for (const t of list) {
    if (t.deleted) { c.eliminado++; continue; }
    c.all++;
    c[t.status.code] = (c[t.status.code] || 0) + 1;
  }
  return c;
}

/** Initial form values for a trip (what the office sees when opening "Completar datos"). */
export function formValues(trip) {
  return {
    order_number: trip?.orderNumber ?? '',
    client: trip?.client ?? '',
    product: trip?.product === 'Retorno vacío' && trip?.loadType === 'empty' ? '' : (trip?.product ?? ''),
    origin_name: trip?.originName ?? '',
    origin: trip?.origin ?? null,
    destination_name: trip?.destinationName ?? '',
    destination: trip?.destination ?? null,
    vehicle: trip?.vehicle ?? '',
    driver_name: trip?.driverName ?? '',
    departure_at: trip?.departureAt ?? null,
    arrival_at: trip?.arrivalAt ?? null,
    billable_km: trip?.billableKm ?? null,
    kg: trip?.kg ?? null,
    amount: trip?.amount ?? null,
    currency: trip?.currency || 'UYU',
    notes: trip?.notes ?? '',
  };
}

/**
 * Checks the form. mode "app": GPS dates and driver come from the phone and are not sent.
 * mode "manual": departure date and truck are required.
 * Returns {ok, errors: {field: message}, payload} where payload is ready for trf_panel_trips.
 */
export function validateTripForm(input, mode) {
  const errors = {};
  const payload = {};
  const text = (field) => {
    const v = cleanText(input[field]);
    if (v && v.length > LIMITS[field]) errors[field] = `Máximo ${LIMITS[field]} caracteres.`;
    payload[field] = v;
  };
  ['order_number', 'client', 'product', 'origin_name', 'destination_name', 'vehicle', 'notes'].forEach(text);

  const number = (field, decimals) => {
    const raw = input[field];
    const parsed = typeof raw === 'number' ? { ok: Number.isFinite(raw) && raw >= 0, value: raw, error: 'Número no válido.' } : parseNumber(raw);
    if (!parsed.ok) { errors[field] = parsed.error; payload[field] = null; return; }
    if (parsed.value !== null && parsed.value > MAX[field]) {
      errors[field] = `Revisá el valor: supera ${MAX[field].toLocaleString('es-UY')}.`;
    }
    payload[field] = parsed.value === null ? null : Number(parsed.value.toFixed(decimals));
  };
  number('billable_km', 1);
  number('kg', 1);
  number('amount', 2);

  const currency = input.currency || 'UYU';
  if (currency !== 'UYU' && currency !== 'USD') errors.currency = 'Elegí pesos o dólares.';
  payload.currency = currency;

  const place = (field, prefix) => {
    const value = input[field];
    if (value === null || value === undefined) { payload[prefix + '_lat'] = null; payload[prefix + '_lng'] = null; return; }
    const lat = toNumber(value[0]);
    const lng = toNumber(value[1]);
    if (!validLatLng(lat, lng)) { errors[prefix + '_name'] = 'La ubicación del mapa no es válida. Buscala de nuevo.'; return; }
    payload[prefix + '_lat'] = lat;
    payload[prefix + '_lng'] = lng;
  };
  place('origin', 'origin');
  place('destination', 'destination');

  if (mode === 'manual') {
    text('driver_name');
    const dep = fromLocalInput(input.departure_at);
    const arr = fromLocalInput(input.arrival_at);
    if (dep === undefined) errors.departure_at = 'Fecha y hora no válidas.';
    else if (dep === null) errors.departure_at = 'Indicá la fecha y hora de salida.';
    if (arr === undefined) errors.arrival_at = 'Fecha y hora no válidas.';
    if (dep && arr && new Date(arr) < new Date(dep)) errors.arrival_at = 'La llegada no puede ser antes de la salida.';
    payload.departure_at = dep || null;
    payload.arrival_at = arr || null;
    if (!payload.vehicle) errors.vehicle = 'Indicá el camión.';
  }
  return { ok: Object.keys(errors).length === 0, errors, payload };
}

/** Same values as the database would store them: used to know whether the form changed. */
export function samePayload(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    const x = a?.[k] ?? null;
    const y = b?.[k] ?? null;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number' && Math.abs(x - y) < 1e-9) continue;
    if ((k.endsWith('_at')) && x && y && new Date(x).getTime() === new Date(y).getTime()) continue;
    return false;
  }
  return true;
}

/** GPS points → polylines. A new line starts when the segment changes (pause) or after 90 s without signal. */
export function routeSegments(points, gapMs = 90000) {
  const sorted = points
    .map((p) => ({ lat: toNumber(p.latitude), lng: toNumber(p.longitude), t: time(p.recorded_at), seg: p.segment ?? 0 }))
    .filter((p) => validLatLng(p.lat, p.lng))
    .sort((a, b) => a.t - b.t);
  const lines = [];
  let line = [];
  let prev = null;
  for (const p of sorted) {
    if (prev && (p.seg !== prev.seg || p.t - prev.t > gapMs)) {
      if (line.length) lines.push(line);
      line = [];
    }
    line.push([p.lat, p.lng]);
    prev = p;
  }
  if (line.length) lines.push(line);
  return lines;
}

export function routeStats(points) {
  const valid = points.filter((p) => validLatLng(toNumber(p.latitude), toNumber(p.longitude)));
  if (!valid.length) return { count: 0, durationMs: null, maxSpeedKmh: null };
  const times = valid.map((p) => time(p.recorded_at)).filter((t) => t > 0);
  const speeds = valid.map((p) => toNumber(p.speed_kmh)).filter((s) => s !== null && s >= 0 && s <= 160);
  return {
    count: valid.length,
    durationMs: times.length > 1 ? Math.max(...times) - Math.min(...times) : null,
    maxSpeedKmh: speeds.length ? Math.max(...speeds) : null,
  };
}

/** A fuel receipt with the panel's corrections applied (panel_data wins over what the phone sent). */
export function fuelFromReceipt(r) {
  const d = asObject(r.panel_data);
  return {
    id: r.id,
    tripId: r.trip_id || null,
    date: firstValue(d.fecha, r.receipt_date, r.recorded_at),
    recordedAt: r.recorded_at || null,
    vehicle: firstValue(d.vehicle, appVehicle(r.vehicle)),
    driverName: firstValue(r.driver_name),
    station: firstValue(d.estacionNombre, r.station_name),
    liters: firstValue(toNumber(d.litros), toNumber(r.liters)),
    total: firstValue(toNumber(d.monto), toNumber(r.total)),
    currency: d.moneda === 'USD' ? 'USD' : 'UYU',
    objectPath: r.object_path || null,
  };
}

/** Totals per truck for the summary screen. Money is kept per currency, never added across currencies. */
export function summarize(trips, fuel) {
  const rows = new Map();
  const row = (vehicle) => {
    const key = vehicle || 'Sin camión asignado';
    if (!rows.has(key)) rows.set(key, { vehicle: key, trips: 0, gpsKm: 0, billableKm: 0, kg: 0, billed: { UYU: 0, USD: 0 }, liters: 0, fuel: { UYU: 0, USD: 0 } });
    return rows.get(key);
  };
  for (const t of trips) {
    if (t.deleted) continue;
    const r = row(t.vehicle);
    r.trips++;
    r.gpsKm += t.gpsKm || 0;
    r.billableKm += t.billableKm || 0;
    r.kg += t.kg || 0;
    if (t.amount) r.billed[t.currency] += t.amount;
  }
  for (const f of fuel) {
    const r = row(f.vehicle);
    r.liters += f.liters || 0;
    if (f.total) r.fuel[f.currency] += f.total;
  }
  const list = [...rows.values()].sort((a, b) => a.vehicle.localeCompare(b.vehicle, 'es'));
  const total = list.reduce((acc, r) => {
    acc.trips += r.trips; acc.gpsKm += r.gpsKm; acc.billableKm += r.billableKm; acc.kg += r.kg; acc.liters += r.liters;
    acc.billed.UYU += r.billed.UYU; acc.billed.USD += r.billed.USD; acc.fuel.UYU += r.fuel.UYU; acc.fuel.USD += r.fuel.USD;
    return acc;
  }, { trips: 0, gpsKm: 0, billableKm: 0, kg: 0, liters: 0, billed: { UYU: 0, USD: 0 }, fuel: { UYU: 0, USD: 0 } });
  return { rows: list, total };
}
