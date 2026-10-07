// Every query the panel makes. Screens never build URLs themselves.
import { ConflictError, rest, restAll, rpc } from './api.js';
import { NOMINATIM_URL, OSRM_URL } from './config.js';
import { chunk } from './util.js';
import { asObject, mergeTrips, tripFromPanel, tripFromSession } from './trips.js';

const enc = encodeURIComponent;
const inList = (ids) => 'in.(' + ids.map((id) => enc(`"${String(id).replace(/"/g, '')}"`)).join(',') + ')';

export const isPanelAdmin = () => rpc('trf_is_panel_admin');

/** Trips that started inside [fromIso, toIso): app trips with their office data, plus manual trips. */
export async function loadTrips({ fromIso, toIso }) {
  const [sessions, manualRows] = await Promise.all([
    restAll(`trf_driver_tracking_sessions?select=*&started_at=gte.${enc(fromIso)}&started_at=lt.${enc(toIso)}&order=started_at.desc,id.desc`, 5000),
    restAll(`trf_panel_trips?select=*&source=eq.manual&departure_at=gte.${enc(fromIso)}&departure_at=lt.${enc(toIso)}&order=departure_at.desc,id.desc`, 5000),
  ]);
  const ids = [...new Set(sessions.map((s) => s.id))];
  const details = [];
  const appRows = [];
  for (const part of chunk(ids, 40)) {
    const [d, p] = await Promise.all([
      rest(`trf_trip_details?select=trip_id,data&trip_id=${inList(part)}`),
      rest(`trf_panel_trips?select=*&app_trip_id=${inList(part)}`),
    ]);
    details.push(...d);
    appRows.push(...p);
  }
  return mergeTrips({ sessions, panelRows: [...appRows, ...manualRows], details });
}

/** One trip with everything the detail screen shows. Returns null when it does not exist. */
export async function loadTrip({ kind, id }) {
  if (kind === 'web') {
    const [row] = await rest(`trf_panel_trips?select=*&id=eq.${enc(id)}&source=eq.manual`);
    return row ? { trip: tripFromPanel(row), session: null, documents: [], fuel: [] } : null;
  }
  const [[session], [panel], [detail], documents, fuel] = await Promise.all([
    rest(`trf_driver_tracking_sessions?select=*&id=eq.${enc(id)}`),
    rest(`trf_panel_trips?select=*&app_trip_id=eq.${enc(id)}`),
    rest(`trf_trip_details?select=trip_id,data&trip_id=eq.${enc(id)}`),
    rest(`trf_trip_documents?select=*&trip_id=eq.${enc(id)}&order=created_at.asc`),
    rest(`trf_driver_fuel_receipts?select=*&trip_id=eq.${enc(id)}&order=recorded_at.asc`),
  ]);
  if (!session) return null;
  return { trip: tripFromSession(session, panel, detail), session, documents, fuel };
}

/** GPS points of an app trip (same rule as the phone: this trip's points, or older points without trip id in its time window). */
export function loadRoute(session) {
  let path = `trf_driver_location_history?select=latitude,longitude,recorded_at,segment,speed_kmh`
    + `&driver_id=eq.${enc(session.driver_id)}&or=(trip_id.eq.${enc(session.id)},trip_id.is.null)`
    + `&recorded_at=gte.${enc(session.started_at)}`;
  if (session.ended_at) path += `&recorded_at=lte.${enc(session.ended_at)}`;
  return restAll(path + '&order=recorded_at.asc,id.asc', 40000);
}

export async function loadFleet() {
  const [locations, active] = await Promise.all([
    rest('trf_driver_locations?select=*&order=updated_at.desc'),
    rest('trf_driver_tracking_sessions?select=id,driver_id,vehicle,started_at,distance_meters,paused&active=is.true&order=started_at.desc'),
  ]);
  return { locations, active };
}

export async function loadCatalog() {
  try {
    const [row] = await rest('trf_mobile_catalog?select=data&id=eq.fleet');
    return asObject(row?.data);
  } catch {
    return {};
  }
}

export function loadFuel({ fromIso, toIso }) {
  return restAll(`trf_driver_fuel_receipts?select=*&or=(archived.is.null,archived.is.false)`
    + `&recorded_at=gte.${enc(fromIso)}&recorded_at=lt.${enc(toIso)}&order=recorded_at.desc,id.desc`, 5000);
}

/**
 * Saves what the office typed. The first save of an app trip creates its panel row; later saves only
 * apply if nobody changed the trip in between (otherwise ConflictError).
 */
export async function saveTrip(trip, payload) {
  if (!trip || !trip.panelId) {
    const body = { ...payload };
    if (trip && trip.source === 'app') {
      Object.assign(body, { source: 'app', app_trip_id: trip.appTripId, departure_at: trip.departureAt, driver_id: trip.driverId });
    } else {
      body.source = 'manual';
    }
    try {
      const rows = await rest('trf_panel_trips', { method: 'POST', body, prefer: 'return=representation' });
      return rows[0];
    } catch (e) {
      if (e.code === '23505') throw new ConflictError();
      throw e;
    }
  }
  const rows = await rest(`trf_panel_trips?id=eq.${enc(trip.panelId)}&updated_at=eq.${enc(trip.panelUpdatedAt)}`, {
    method: 'PATCH', body: payload, prefer: 'return=representation',
  });
  if (!Array.isArray(rows) || rows.length === 0) throw new ConflictError();
  return rows[0];
}

export const setDeleted = (trip, deleted) => saveTrip(trip, { deleted_at: deleted ? new Date().toISOString() : null });

// ---- public map services (no account needed) -------------------------------------------------

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export async function searchPlaces(query) {
  const url = `${NOMINATIM_URL}/search?format=jsonv2&limit=6&accept-language=es&countrycodes=uy,ar,br,py&q=${enc(query)}`;
  const rows = await getJson(url);
  return (Array.isArray(rows) ? rows : [])
    .map((r) => ({ label: r.display_name, short: r.name || String(r.display_name || '').split(',')[0], lat: Number(r.lat), lng: Number(r.lon) }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

export async function placeName(lat, lng) {
  const r = await getJson(`${NOMINATIM_URL}/reverse?format=jsonv2&zoom=14&accept-language=es&lat=${lat}&lon=${lng}`);
  const a = r?.address || {};
  const town = a.city || a.town || a.village || a.hamlet || a.suburb || a.municipality || a.county;
  const region = a.state || a.region;
  return [town, region].filter(Boolean).join(', ') || r?.name || null;
}

export async function roadRoute(from, to) {
  const r = await getJson(`${OSRM_URL}/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`);
  const best = r?.routes?.[0];
  if (!best) return null;
  return { line: best.geometry.coordinates.map((c) => [c[1], c[0]]), km: best.distance / 1000, minutes: best.duration / 60 };
}
