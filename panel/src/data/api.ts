// Every read the panel makes. Screens never build queries themselves; row security in the database decides what
// each account gets back.
import { type ActiveTrip, type CatalogTruck, catalogTrucks, type FinishedTrip, type LastPoint } from '../lib/fleet';
import type { PaperRow, ServiceRow } from '../lib/papers';
import { supabase } from '../lib/supabase';

/** A query that failed; the message is for the office, the cause for the console. */
export class DataError extends Error {}

function rows<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new DataError(result.error.message);
  if (result.data === null) throw new DataError('Respuesta vacía');
  return result.data;
}

const PAGE = 1000;

/** Every row of a query with a stable order, a page at a time. */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, max = 20_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const part = rows(await page(from, from + PAGE - 1));
    out.push(...part);
    if (part.length < PAGE) break;
  }
  return out;
}

export interface Access {
  /** In trf_panel_admins: reads the whole fleet. */
  panelAdmin: boolean;
  /** Full administrator (trf_private.admin_emails): may also change data. */
  admin: boolean;
}

export async function fetchAccess(): Promise<Access> {
  const [panel, admin] = await Promise.all([supabase.rpc('trf_is_panel_admin'), supabase.rpc('trf_is_admin')]);
  return { panelAdmin: rows(panel) === true, admin: rows(admin) === true };
}

export async function fetchCatalog(): Promise<CatalogTruck[]> {
  const result = await supabase.from('trf_mobile_catalog').select('data').eq('id', 'fleet').maybeSingle();
  if (result.error) throw new DataError(result.error.message);
  return catalogTrucks(result.data?.data ?? null);
}

export interface FleetData {
  active: ActiveTrip[];
  finished: FinishedTrip[];
  fetchedAt: number;
}

/** Trips in progress with their latest GPS reading, and the latest finished trips to place idle trucks. */
export async function fetchFleet(): Promise<FleetData> {
  const [running, finished] = await Promise.all([
    supabase.from('trf_driver_tracking_sessions').select('id,driver_id,driver_name,vehicle,started_at,paused,load_type,distance_meters').eq('active', true).order('started_at', { ascending: false }).limit(50),
    supabase.from('trf_driver_tracking_sessions').select('driver_name,vehicle,ended_at,arrival_lat,arrival_lng').eq('active', false).order('ended_at', { ascending: false, nullsFirst: false }).limit(100),
  ]);
  const trips = rows(running);
  const last = await Promise.all(
    trips.map(async (t) => {
      const point = await supabase.from('trf_driver_location_history').select('latitude,longitude,speed_kmh,recorded_at').eq('trip_id', t.id).order('recorded_at', { ascending: false }).limit(1);
      return (rows(point)[0] ?? null) as LastPoint | null;
    }),
  );
  return { active: trips.map((t, i) => ({ ...t, last: last[i] ?? null })), finished: rows(finished), fetchedAt: Date.now() };
}

export interface TripRow {
  id: string;
  driver_name: string;
  vehicle: string;
  started_at: string;
  ended_at: string | null;
  active: boolean;
  paused: boolean;
  load_type: string;
  distance_meters: number;
}

/** App trips the office sent to the trash in the old panel: they never count. */
async function deletedAppTrips(fromIso: string, toIso: string): Promise<Set<string>> {
  const deleted = await all((from, to) =>
    supabase.from('trf_panel_trips').select('app_trip_id').eq('source', 'app').not('deleted_at', 'is', null).gte('departure_at', fromIso).lt('departure_at', toIso).order('id').range(from, to),
  );
  return new Set(deleted.map((d) => d.app_trip_id).filter((id): id is string => id !== null));
}

/** App trips that started in [fromIso, toIso), newest first, without the deleted ones. */
export async function fetchTrips(fromIso: string, toIso: string): Promise<TripRow[]> {
  const [trips, deleted] = await Promise.all([
    all((from, to) =>
      supabase.from('trf_driver_tracking_sessions').select('id,driver_name,vehicle,started_at,ended_at,active,paused,load_type,distance_meters').gte('started_at', fromIso).lt('started_at', toIso).order('started_at', { ascending: false }).order('id').range(from, to),
    ),
    deletedAppTrips(fromIso, toIso),
  ]);
  return trips.filter((t) => !deleted.has(t.id));
}

export async function fetchPapers(): Promise<{ papers: PaperRow[]; services: ServiceRow[] }> {
  const [papers, services] = await Promise.all([
    supabase.from('trf_documents').select('id,scope,driver_name,vehicle,kind,expires_on').order('expires_on', { ascending: true, nullsFirst: false }).limit(500),
    supabase.from('trf_vehicle_maintenance').select('id,vehicle,kind,due_on,done_on').order('created_at', { ascending: false }).limit(500),
  ]);
  return { papers: rows(papers), services: rows(services) };
}

export interface RoutePoint {
  latitude: number;
  longitude: number;
  recorded_at: string;
  segment: number;
}

/**
 * GPS readings of a trip, oldest first. Same rule as the phone and the current panel: the readings of this trip, or
 * readings without trip saved by older app versions inside its time window.
 */
export async function fetchRoute(trip: Pick<ActiveTrip, 'id' | 'driver_id' | 'started_at'> & { ended_at?: string | null }): Promise<RoutePoint[]> {
  return all((from, to) => {
    let q = supabase.from('trf_driver_location_history').select('latitude,longitude,recorded_at,segment').eq('driver_id', trip.driver_id).or(`trip_id.eq.${trip.id},trip_id.is.null`).gte('recorded_at', trip.started_at);
    if (trip.ended_at) q = q.lte('recorded_at', trip.ended_at);
    return q.order('recorded_at', { ascending: true }).order('id', { ascending: true }).range(from, to);
  }, 40_000);
}
