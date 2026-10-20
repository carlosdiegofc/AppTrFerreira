// Every read and write the panel makes. Screens never build queries themselves; row security in the database decides
// what each account gets back and what it may change.
import type { Tables, TablesInsert, TablesUpdate } from '../lib/database.types';
import { type DriverChoice, driverChoices, type FileType, type Paper, type PaperDocRow } from '../lib/documents';
import { type ActiveTrip, type CatalogTruck, catalogTrucks, type FinishedTrip, lastTripByTruck, type LivePosition, text, truckLabel } from '../lib/fleet';
import { type CatalogStation, catalogStations, type Movement, type MovementRow, type Receipt } from '../lib/fuel';
import type { KmTrip, MaintenanceRow, Service } from '../lib/maintenance';
import type { PresenceRow } from '../lib/presence';
import { supabase } from '../lib/supabase';
import type { TripPayload } from '../lib/tripForm';
import type { DetailRow, FuelRow, PanelTripRow, SessionRow, Trip } from '../lib/trips';

/** A query that failed; the message is for the console, the code (PostgreSQL's or PostgREST's) says why. */
export class DataError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Someone saved the trip while it was being edited, or created its panel row first: reload it and look again. */
export class ConflictError extends DataError {}

/** The database certainly did not save: someone else saved first, or it said why. A cut answer is not a refusal. */
export const refused = (e: unknown) => e instanceof ConflictError || (e instanceof DataError && Boolean(e.code));

function rows<T>(result: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (result.error) throw new DataError(result.error.message, result.error.code);
  if (result.data === null) throw new DataError('Respuesta vacía');
  return result.data;
}

const PAGE = 1000;
/** The code of a read that has more rows than the panel reads at once. */
export const TOO_MANY = 'too_many';

/**
 * Every row of a query with a stable order, a page at a time, up to max rows. With complete, a query with more rows
 * than that fails instead of coming back cut: sums like a station's account must never be made with part of the rows.
 */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, max = 20_000, complete = false): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const part = rows(await page(from, from + PAGE - 1));
    out.push(...part);
    if (part.length < PAGE) return out;
  }
  // Exactly max rows is complete; one more is not.
  if (complete && rows(await page(max, max)).length > 0) throw new DataError(`Hay más de ${max} filas para leer de una vez`, TOO_MANY);
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

/** Trips in progress, and the latest finished trips to place idle trucks. Positions come from fetchLivePositions. */
export async function fetchFleet(): Promise<FleetData> {
  const [running, finished] = await Promise.all([
    supabase.from('trf_driver_tracking_sessions').select('id,driver_id,driver_name,vehicle,started_at,paused,load_type,distance_meters').eq('active', true).order('started_at', { ascending: false }).limit(50),
    supabase.from('trf_driver_tracking_sessions').select('driver_name,vehicle,ended_at,arrival_lat,arrival_lng').eq('active', false).order('ended_at', { ascending: false, nullsFirst: false }).limit(100),
  ]);
  return { active: rows(running).map((t) => ({ ...t, last: null })), finished: rows(finished), fetchedAt: Date.now() };
}

/**
 * The latest position of every driver: the phone updates its row of trf_driver_locations with each reading (every app
 * version does), so one small query brings the whole fleet. Only what the map needs, since it is read every few seconds.
 */
export async function fetchLivePositions(): Promise<LivePosition[]> {
  return rows(await supabase.from('trf_driver_locations').select('driver_id,latitude,longitude,speed_kmh,recorded_at').limit(500));
}

/** Who has the app open («chofer activo»): one row per driver, from app 0.17.0 on. */
export async function fetchPresence(): Promise<PresenceRow[]> {
  return rows(await supabase.from('trf_driver_presence').select('driver_id,driver_name,vehicle,app_version,seen_at,latitude,longitude,accuracy_m,located_at').order('seen_at', { ascending: false }).limit(500));
}

/**
 * The latest finished trip of every catalog truck, looking further back than the live refresh (its last 100 trips) so a
 * truck used rarely keeps its last driver and place. Stops as soon as every truck is found, at most 3000 trips back.
 */
export async function fetchLastTrips(catalog: readonly CatalogTruck[]): Promise<FinishedTrip[]> {
  const wanted = new Set(catalog.map(truckLabel).filter((l) => l !== '')).size;
  const found = new Map<string, FinishedTrip>();
  for (let from = 0; from < 3000 && found.size < wanted; from += PAGE) {
    const part = rows(await supabase.from('trf_driver_tracking_sessions').select('driver_name,vehicle,ended_at,arrival_lat,arrival_lng').eq('active', false).order('ended_at', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).range(from, from + PAGE - 1));
    lastTripByTruck(part, catalog, found);
    if (part.length < PAGE) break;
  }
  return [...found.values()];
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

/**
 * Every service of the fleet: the kilometres of each truck come from the ones done, the warnings from the ones to do,
 * so a read cut short would hide some.
 */
export async function fetchServices(): Promise<MaintenanceRow[]> {
  return all((from, to) => supabase.from('trf_vehicle_maintenance').select('*').order('created_at', { ascending: false }).order('id').range(from, to), 20_000, true);
}

/** The app's trips that started since an instant, with what the kilometres of each truck need, without the deleted ones. */
export async function fetchKmTrips(sinceIso: string): Promise<KmTrip[]> {
  const [trips, deleted] = await Promise.all([
    all((from, to) => supabase.from('trf_driver_tracking_sessions').select('id,vehicle,started_at,distance_meters').gte('started_at', sinceIso).order('started_at').order('id').range(from, to), 50_000, true),
    deletedAppTrips(sinceIso, '2100-01-01T00:00:00Z'),
  ]);
  return trips.filter((t) => !deleted.has(t.id));
}

/** A service, new or changed; a change only applies if nobody saved it meanwhile (otherwise ConflictError). */
export async function saveService(service: Pick<Service, 'id' | 'updatedAt'> | null, row: TablesInsert<'trf_vehicle_maintenance'> | TablesUpdate<'trf_vehicle_maintenance'>): Promise<MaintenanceRow> {
  if (!service) {
    const result = await supabase.from('trf_vehicle_maintenance').insert(row as TablesInsert<'trf_vehicle_maintenance'>).select();
    // Saved before: a save tried again after its answer was cut.
    if (result.error?.code === '23505' && row.id) {
      const saved = rows(await supabase.from('trf_vehicle_maintenance').select('*').eq('id', row.id).limit(1))[0];
      if (saved) return saved;
    }
    const saved = rows(result)[0];
    if (!saved) throw new DataError('El alta no devolvió la fila');
    return saved;
  }
  const saved = rows(await supabase.from('trf_vehicle_maintenance').update(row).eq('id', service.id).eq('updated_at', service.updatedAt).select())[0];
  if (!saved) throw new ConflictError('Otra persona cambió el service');
  return saved;
}

/** A service as it is now; null when it does not exist (or this account cannot see it). */
export async function serviceRow(id: string): Promise<MaintenanceRow | null> {
  return rows(await supabase.from('trf_vehicle_maintenance').select('*').eq('id', id).limit(1))[0] ?? null;
}

/** Deletes a service for good, like the app; only if nobody changed it meanwhile (otherwise ConflictError). */
export async function deleteService(service: Pick<Service, 'id' | 'updatedAt'>): Promise<void> {
  const gone = rows(await supabase.from('trf_vehicle_maintenance').delete().eq('id', service.id).eq('updated_at', service.updatedAt).select('id'));
  if (gone.length === 0) throw new ConflictError('Otra persona cambió o borró el service');
}

/** Every paper of trucks and drivers. */
export async function fetchDocuments(): Promise<PaperDocRow[]> {
  return all((from, to) => supabase.from('trf_documents').select('*').order('created_at', { ascending: false }).order('id').range(from, to), 20_000, true);
}

/**
 * The drivers a paper can be for, with the latest name each used: every phone that sent a position has its row in
 * trf_driver_locations; the app open and the latest trips add the newer names.
 */
export async function fetchPaperDrivers(): Promise<DriverChoice[]> {
  const [presence, trips, located, papers] = await Promise.all([
    supabase.from('trf_driver_presence').select('driver_id,driver_name').order('seen_at', { ascending: false }).limit(500),
    supabase.from('trf_driver_tracking_sessions').select('driver_id,driver_name').order('started_at', { ascending: false }).limit(1000),
    supabase.from('trf_driver_locations').select('driver_id,driver_name').order('updated_at', { ascending: false }).limit(500),
    supabase.from('trf_documents').select('driver_id,driver_name').eq('scope', 'driver').order('updated_at', { ascending: false }).limit(1000),
  ]);
  return driverChoices(rows(presence), rows(trips), rows(located), rows(papers));
}

/** A paper, new or changed; a change only applies if nobody saved it meanwhile (otherwise ConflictError). */
export async function saveDocument(paper: Pick<Paper, 'id' | 'updatedAt'> | null, row: TablesInsert<'trf_documents'> | TablesUpdate<'trf_documents'>): Promise<PaperDocRow> {
  if (!paper) {
    const result = await supabase.from('trf_documents').insert(row as TablesInsert<'trf_documents'>).select();
    if (result.error?.code === '23505' && row.id) {
      const saved = rows(await supabase.from('trf_documents').select('*').eq('id', row.id).limit(1))[0];
      if (saved) return saved;
    }
    const saved = rows(result)[0];
    if (!saved) throw new DataError('El alta no devolvió la fila');
    return saved;
  }
  const saved = rows(await supabase.from('trf_documents').update(row).eq('id', paper.id).eq('updated_at', paper.updatedAt).select())[0];
  if (!saved) throw new ConflictError('Otra persona cambió el documento');
  return saved;
}

/** Deletes a paper for good, like the app; only if nobody changed it meanwhile (otherwise ConflictError). */
export async function deleteDocument(paper: Pick<Paper, 'id' | 'updatedAt'>): Promise<void> {
  const gone = rows(await supabase.from('trf_documents').delete().eq('id', paper.id).eq('updated_at', paper.updatedAt).select('id'));
  if (gone.length === 0) throw new ConflictError('Otra persona cambió o borró el documento');
}

/** The file of a paper: a JPEG photo or a PDF. One already uploaded (a save tried again) counts as uploaded. */
export async function uploadDocumentFile(path: string, file: Blob, type: FileType): Promise<void> {
  const contentType = type === 'pdf' ? 'application/pdf' : 'image/jpeg';
  // The storage takes the type of the file itself, which a PDF may not bring.
  const body = file.type === contentType ? file : new Blob([file], { type: contentType });
  const result = await supabase.storage.from('trf-documents').upload(path, body, { contentType, upsert: false });
  if (!result.error) return;
  const e = result.error as { message: string; statusCode?: string; status?: number };
  if (e.statusCode === '409' || e.status === 409 || /already exists|duplicate/i.test(e.message)) return;
  throw new DataError(e.message, e.statusCode ?? (e.status === undefined ? undefined : String(e.status)));
}

/** Deletes the file of a paper. */
export async function removeDocumentFile(path: string): Promise<void> {
  const result = await supabase.storage.from('trf-documents').remove([path]);
  if (result.error) throw new DataError(result.error.message);
}

export interface RoutePoint {
  id: number;
  latitude: number;
  longitude: number;
  recorded_at: string;
  segment: number;
  speed_kmh: number | null;
}

/**
 * GPS readings of a trip, oldest first. Same rule as the phone and the current panel: the readings of this trip, or
 * readings without trip saved by older app versions inside its time window.
 */
export async function fetchRoute(trip: Pick<ActiveTrip, 'id' | 'driver_id' | 'started_at'> & { ended_at?: string | null }, since?: string): Promise<RoutePoint[]> {
  return all((from, to) => {
    let q = supabase.from('trf_driver_location_history').select('id,latitude,longitude,recorded_at,segment,speed_kmh').eq('driver_id', trip.driver_id).or(`trip_id.eq.${trip.id},trip_id.is.null`).gte('recorded_at', since ?? trip.started_at);
    if (trip.ended_at) q = q.lte('recorded_at', trip.ended_at);
    return q.order('recorded_at', { ascending: true }).order('id', { ascending: true }).range(from, to);
  }, 40_000);
}

export type DocumentRow = Tables<'trf_trip_documents'>;

export interface TripListData {
  sessions: SessionRow[];
  panelRows: PanelTripRow[];
  details: DetailRow[];
}

/** Lists of ids short enough for one query address. */
function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Trips that started in [fromIso, toIso): the app's trips with what the office completed and what the driver typed on
 * the phone, and the trips typed by hand in the panel. Deleted trips come too, for the trash.
 */
export async function fetchTripList(fromIso: string, toIso: string): Promise<TripListData> {
  const [sessions, manual] = await Promise.all([
    all((from, to) => supabase.from('trf_driver_tracking_sessions').select('*').gte('started_at', fromIso).lt('started_at', toIso).order('started_at', { ascending: false }).order('id', { ascending: false }).range(from, to)),
    all((from, to) => supabase.from('trf_panel_trips').select('*').eq('source', 'manual').gte('departure_at', fromIso).lt('departure_at', toIso).order('departure_at', { ascending: false }).order('id', { ascending: false }).range(from, to)),
  ]);
  const parts = await Promise.all(
    chunks([...new Set(sessions.map((s) => s.id))], 50).map(async (ids) => {
      const [details, panel] = await Promise.all([
        supabase.from('trf_trip_details').select('trip_id,data').in('trip_id', ids),
        supabase.from('trf_panel_trips').select('*').eq('source', 'app').in('app_trip_id', ids),
      ]);
      return { details: rows(details), panel: rows(panel) };
    }),
  );
  return { sessions, panelRows: [...parts.flatMap((p) => p.panel), ...manual], details: parts.flatMap((p) => p.details) };
}

export interface TripDetailData {
  session: SessionRow | null;
  panel: PanelTripRow | null;
  detail: DetailRow | null;
  documents: DocumentRow[];
  fuel: FuelRow[];
}

/** One trip with what its page shows; null when it does not exist or this account cannot see it. */
export async function fetchTripDetail(kind: 'app' | 'web', id: string): Promise<TripDetailData | null> {
  if (kind === 'web') {
    const manual = rows(await supabase.from('trf_panel_trips').select('*').eq('id', id).eq('source', 'manual').limit(1));
    return manual[0] ? { session: null, panel: manual[0], detail: null, documents: [], fuel: [] } : null;
  }
  const [session, panel, detail, documents, fuel] = await Promise.all([
    supabase.from('trf_driver_tracking_sessions').select('*').eq('id', id).limit(1),
    supabase.from('trf_panel_trips').select('*').eq('source', 'app').eq('app_trip_id', id).limit(1),
    supabase.from('trf_trip_details').select('trip_id,data').eq('trip_id', id).limit(1),
    supabase.from('trf_trip_documents').select('*').eq('trip_id', id).order('created_at', { ascending: true }).order('id', { ascending: true }),
    supabase.from('trf_driver_fuel_receipts').select('*').eq('trip_id', id).or('archived.is.null,archived.is.false').order('recorded_at', { ascending: true }).order('id', { ascending: true }),
  ]);
  const trip = rows(session)[0];
  if (!trip) return null;
  return { session: trip, panel: rows(panel)[0] ?? null, detail: rows(detail)[0] ?? null, documents: rows(documents), fuel: rows(fuel) };
}

/**
 * Saves what the office typed, the same way as the current panel (web/js/data.js). The first save of an app trip
 * creates its panel row; a later save only applies if nobody saved the trip in between (otherwise ConflictError). The
 * database notes who and when.
 */
export async function saveTrip(trip: Trip | null, payload: TripPayload): Promise<PanelTripRow> {
  if (!trip?.panelId) {
    const row: TablesInsert<'trf_panel_trips'> =
      trip?.source === 'app'
        ? { ...payload, source: 'app', app_trip_id: trip.appTripId, departure_at: trip.departureAt, driver_id: trip.driverId }
        : { ...payload, source: 'manual' };
    const result = await supabase.from('trf_panel_trips').insert(row).select();
    if (result.error?.code === '23505') throw new ConflictError(result.error.message, result.error.code);
    const saved = rows(result)[0];
    if (!saved) throw new DataError('El alta no devolvió la fila');
    return saved;
  }
  if (!trip.updatedAt) throw new ConflictError('Sin fecha de modificación');
  const result = await supabase.from('trf_panel_trips').update(payload).eq('id', trip.panelId).eq('updated_at', trip.updatedAt).select();
  const saved = rows(result)[0];
  if (!saved) throw new ConflictError('Otra persona guardó el viaje');
  return saved;
}

/** What went wrong with a save, in the office's words (a conflict is handled apart: the row is read again). */
export function describeWriteError(e: unknown, what = 'viajes'): string {
  const code = e instanceof DataError ? e.code : undefined;
  if (code === '42501') return `Esta cuenta no tiene permiso para guardar ${what}.`;
  if (code === '23514' || code === '22P02' || code === '22003' || code === '22007' || code === '22008') return 'Algún dato no es válido para guardar. Revisá los números y las fechas.';
  if (/fetch|network|load failed/i.test(e instanceof Error ? e.message : String(e))) return 'Sin conexión con el servidor. Revisá internet y volvé a intentar.';
  return 'No se pudo guardar. Volvé a intentar en un momento.';
}

/** To the trash and back: the trip is never deleted. */
export const setTripDeleted = (trip: Trip, deleted: boolean) => saveTrip(trip, { deleted_at: deleted ? new Date().toISOString() : null });

export interface CatalogLists {
  clients: string[];
  products: string[];
  /** The service stations the app offers in its fuel form. */
  stations: CatalogStation[];
}

/** The clients, the kinds of cargo and the service stations of the app's catalog, to offer them in the forms. */
export async function fetchCatalogLists(): Promise<CatalogLists> {
  const result = await supabase.from('trf_mobile_catalog').select('data').eq('id', 'fleet').maybeSingle();
  if (result.error) throw new DataError(result.error.message, result.error.code);
  let data: unknown = result.data?.data ?? null;
  // The column is jsonb, but older rows were saved as text holding JSON.
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      data = null;
    }
  }
  const names = (value: unknown) =>
    (Array.isArray(value) ? value : []).map((v: unknown) => text(typeof v === 'string' ? v : (v as { nombre?: unknown } | null)?.nombre)).filter((v): v is string => v !== null);
  const d = (data ?? {}) as { clientes?: unknown; tiposCarga?: unknown };
  return { clients: names(d.clientes), products: names(d.tiposCarga), stations: catalogStations(data) };
}

/** The drivers of the latest trips of the app, to suggest them for a trip typed by hand. */
export async function fetchDriverNames(): Promise<string[]> {
  const result = rows(await supabase.from('trf_driver_tracking_sessions').select('driver_name').order('started_at', { ascending: false }).limit(500));
  return [...new Set(result.map((r) => text(r.driver_name)).filter((v): v is string => v !== null))];
}

export interface FuelData {
  /** Every receipt, the ones in the trash too. */
  receipts: Tables<'trf_driver_fuel_receipts'>[];
  /** The payments and opening balances of the stations, the annulled ones too. */
  movements: MovementRow[];
}

/** All the fuel: the accounts of the stations need every receipt and payment, not only those of a period. */
export async function fetchFuel(): Promise<FuelData> {
  const [receipts, movements] = await Promise.all([
    all((from, to) => supabase.from('trf_driver_fuel_receipts').select('*').order('receipt_date', { ascending: false }).order('id').range(from, to), 50_000, true),
    all((from, to) => supabase.from('trf_fuel_station_movements').select('*').order('happened_on', { ascending: false }).order('id').range(from, to), 20_000, true),
  ]);
  return { receipts, movements };
}

/** The photo of a receipt typed in the panel. One already uploaded (a save tried again) counts as uploaded. */
export async function uploadReceiptPhoto(path: string, photo: Blob): Promise<void> {
  const result = await supabase.storage.from('trf-fuel-receipts').upload(path, photo, { contentType: 'image/jpeg', upsert: false });
  if (!result.error) return;
  const e = result.error as { message: string; statusCode?: string; status?: number };
  if (e.statusCode === '409' || e.status === 409 || /already exists|duplicate/i.test(e.message)) return;
  throw new DataError(e.message, e.statusCode ?? (e.status === undefined ? undefined : String(e.status)));
}

/** Whether a receipt was saved: a save whose answer was cut may have gone through all the same. */
export async function receiptExists(id: string): Promise<boolean> {
  return rows(await supabase.from('trf_driver_fuel_receipts').select('id').eq('id', id).limit(1)).length > 0;
}

/** A receipt typed in the panel. Saved before (a save tried again after a cut): the saved one. */
export async function createReceipt(row: TablesInsert<'trf_driver_fuel_receipts'>): Promise<Tables<'trf_driver_fuel_receipts'>> {
  const result = await supabase.from('trf_driver_fuel_receipts').insert(row).select();
  if (result.error?.code === '23505') {
    const saved = rows(await supabase.from('trf_driver_fuel_receipts').select('*').eq('id', row.id).limit(1))[0];
    if (saved) return saved;
  }
  const saved = rows(result)[0];
  if (!saved) throw new DataError('El alta no devolvió la fila');
  return saved;
}

/**
 * A correction (panel_data) or the trash (archived). It only applies if nobody changed the receipt since it was read
 * (otherwise ConflictError); the database keeps what was declared and notes who and when.
 */
export async function updateReceipt(receipt: Pick<Receipt, 'id' | 'updatedAt'>, changes: Pick<TablesUpdate<'trf_driver_fuel_receipts'>, 'panel_data' | 'archived'>): Promise<Tables<'trf_driver_fuel_receipts'>> {
  const q = supabase.from('trf_driver_fuel_receipts').update(changes).eq('id', receipt.id);
  const saved = rows(await (receipt.updatedAt ? q.eq('updated_at', receipt.updatedAt) : q.is('updated_at', null)).select())[0];
  if (!saved) throw new ConflictError('Otra persona cambió la boleta');
  return saved;
}

/**
 * A payment or an opening balance: a new one, or a change that only applies if nobody saved it meanwhile. A new one
 * comes with its id: saved before (a save tried again after its answer was cut), the saved one, so it never counts twice.
 */
export async function saveMovement(movement: Movement | null, row: TablesInsert<'trf_fuel_station_movements'> | TablesUpdate<'trf_fuel_station_movements'>): Promise<MovementRow> {
  if (!movement) {
    const result = await supabase.from('trf_fuel_station_movements').insert(row as TablesInsert<'trf_fuel_station_movements'>).select();
    // The same code is the second opening balance of a station and currency: then there is no row with this id.
    if (result.error?.code === '23505' && row.id) {
      const saved = rows(await supabase.from('trf_fuel_station_movements').select('*').eq('id', row.id).limit(1))[0];
      if (saved) return saved;
    }
    const saved = rows(result)[0];
    if (!saved) throw new DataError('El alta no devolvió la fila');
    return saved;
  }
  const saved = rows(await supabase.from('trf_fuel_station_movements').update(row).eq('id', movement.id).eq('updated_at', movement.updatedAt).select())[0];
  if (!saved) throw new ConflictError('Otra persona cambió el pago');
  return saved;
}

/** Annuls a payment or an opening balance, or brings it back: nothing is deleted. */
export const setMovementDeleted = (movement: Movement, deleted: boolean) => saveMovement(movement, { deleted_at: deleted ? new Date().toISOString() : null });

export type PhotoBucket = 'trf-trip-documents' | 'trf-fuel-receipts' | 'trf-documents';

/** A link that opens a photo (or the PDF of a paper) of the private buckets for ten minutes; the storage rules decide who can open it. */
export async function photoUrl(bucket: PhotoBucket, path: string): Promise<string> {
  const result = await supabase.storage.from(bucket).createSignedUrl(path, 600);
  if (result.error) throw new DataError(result.error.message);
  return result.data.signedUrl;
}
