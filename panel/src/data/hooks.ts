import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { FLEET_REFRESH_MS, LIVE_REFRESH_MS, PRESENCE_REFRESH_MS, ROUTE_REFRESH_MS } from '../config';
import type { TablesInsert, TablesUpdate } from '../lib/database.types';
import { type ClientMovement, clientMovementFromRow, groupClients } from '../lib/clients';
import { startOfDay } from '../lib/dates';
import { type FileType, type Paper, type PaperDocRow, paperFromRow, samePaper } from '../lib/documents';
import { type Driver, driverFromRow, type Payment, paymentFromRow, type Salary, salaryFromRow } from '../lib/drivers';
import { type Expense, expenseFromRow, targetChoices } from '../lib/expenses';
import { type ActiveTrip, type CatalogTruck, fleetUnits, truckLabel, withLivePositions } from '../lib/fleet';
import { groupStations, type Movement, movementFromRow, type Receipt, receiptFromRow } from '../lib/fuel';
import { kmReferences, kmSince, type MaintenanceRow, sameService, type Service, serviceFromRow, type TruckKm, truckKms } from '../lib/maintenance';
import { type ProfitInput, type TollPassage, tollPassageFromRow } from '../lib/profit';
import { appendReadings, lastSaved } from '../lib/route';
import type { TripPayload } from '../lib/tripForm';
import { mergeTrips, type Trip, tripFromPanel, tripFromSession } from '../lib/trips';
import { hitchFromRow, type Hitch, truckEntries, type Vehicle, vehicleFromRow } from '../lib/vehicles';
import {
  ConflictError,
  createReceipt,
  deleteDocument,
  deleteService,
  documentRow,
  fetchAllTrips,
  fetchBilledTrips,
  fetchCatalog,
  fetchCatalogLists,
  fetchClientMovements,
  fetchDocuments,
  fetchDriverNames,
  fetchDrivers,
  fetchExpenses,
  fetchFleet,
  fetchFuel,
  fetchKmTrips,
  fetchLastTrips,
  fetchLivePositions,
  fetchPaperDrivers,
  fetchPresence,
  fetchRoute,
  fetchRouteGaps,
  fetchTripStops,
  fetchServices,
  fetchTollPassages,
  fetchTripDetail,
  fetchTripList,
  fetchTrips,
  fetchVehicles,
  hitchTrailer,
  type HitchRequest,
  photoUrl,
  type PhotoBucket,
  refused,
  removeDocumentFile,
  type RoutePoint,
  saveClientMovement,
  saveDocument,
  saveDriver,
  saveExpense,
  saveMovement,
  savePayment,
  saveSalary,
  saveHitch,
  saveService,
  saveTrip,
  saveVehicle,
  serviceRow,
  setClientMovementDeleted,
  setExpenseDeleted,
  setMovementDeleted,
  setPaymentDeleted,
  setSalaryDeleted,
  setTripDeleted,
  updateReceipt,
  uploadDocumentFile,
  uploadExpenseFile,
  uploadReceiptPhoto,
  uploadVehiclePhoto,
} from './api';

/** The current time, refreshed every few seconds so "hace 2 min" keeps moving. */
export function useNow(everyMs = 10_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}

export const useCatalog = () => useQuery({ queryKey: ['catalog'], queryFn: fetchCatalog, staleTime: 10 * 60_000 });

/** The catalog's clients, cargo and stations; the forms and Combustible read it. */
const useCatalogLists = (enabled = true) => useQuery({ queryKey: ['catalogLists'], queryFn: fetchCatalogLists, staleTime: 10 * 60_000, enabled });

export const useFleetData = () => useQuery({ queryKey: ['fleet'], queryFn: fetchFleet, refetchInterval: FLEET_REFRESH_MS, refetchIntervalInBackground: false });

/** The position of every truck, every few seconds while the screen is visible (a hidden tab does not read). */
export const useLivePositions = () => useQuery({ queryKey: ['livePositions'], queryFn: fetchLivePositions, refetchInterval: LIVE_REFRESH_MS, refetchIntervalInBackground: false, staleTime: 0 });

/** Who has the app open («chofer activo»), every 30 seconds while the screen is visible. */
export const usePresence = () => useQuery({ queryKey: ['presence'], queryFn: fetchPresence, refetchInterval: PRESENCE_REFRESH_MS, refetchIntervalInBackground: false });

/** The last trip of every truck, further back than the live refresh; trucks rarely change it, so every 30 minutes. */
const useLastTrips = (catalog: readonly CatalogTruck[] | undefined) =>
  useQuery({
    queryKey: ['lastTrips', catalog?.map(truckLabel).join('|') ?? ''],
    queryFn: () => fetchLastTrips(catalog ?? []),
    enabled: catalog !== undefined,
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
  });

/**
 * Every truck with its live state, recomputed as time passes (a truck goes "sin señal" without new data). Who is on a
 * trip is read every 15 seconds; where each truck is, every 3.
 */
export function useFleet(now: number) {
  const catalog = useCatalog();
  const fleet = useFleetData();
  const live = useLivePositions();
  const last = useLastTrips(catalog.data);
  // The live list first: a truck that appears there has its newest trip there.
  const units = useMemo(
    () => (fleet.data ? fleetUnits(withLivePositions(fleet.data.active, live.data ?? []), [...fleet.data.finished, ...(last.data ?? [])], catalog.data ?? [], now) : []),
    [fleet.data, live.data, last.data, catalog.data, now],
  );
  return {
    units,
    /** When the positions were last read. */
    fetchedAt: live.dataUpdatedAt || fleet.data?.fetchedAt || null,
    isLoading: fleet.isLoading || catalog.isLoading || live.isLoading,
    error: fleet.error ?? catalog.error ?? live.error,
    /** The last trip of each truck, further back: until it is read, a truck without recent trips may have older ones. */
    lastTrips: last,
    refetch: () => Promise.all([fleet.refetch(), live.refetch(), catalog.refetch(), last.refetch()]),
    // The position refresh every few seconds does not turn the refresh button.
    isFetching: fleet.isFetching || catalog.isFetching,
  };
}

export const useTrips = (fromIso: string, toIso: string, refreshMs?: number) =>
  useQuery({ queryKey: ['trips', fromIso, toIso], queryFn: () => fetchTrips(fromIso, toIso), refetchInterval: refreshMs ?? false, staleTime: 60_000 });

/**
 * Every service with the kilometres of each truck: the odometer written in the latest service done, plus the GPS
 * kilometres of its trips since that day. The trips are read once the services say since when.
 */
export function useMaintenance() {
  const catalog = useCatalog();
  const query = useQuery({ queryKey: ['services'], queryFn: fetchServices, refetchInterval: 5 * 60_000, staleTime: 60_000 });
  const services = useMemo(() => (query.data ?? []).map((r) => serviceFromRow(r, catalog.data ?? [])), [query.data, catalog.data]);
  const references = useMemo(() => kmReferences(services), [services]);
  const since = kmSince(references);
  const trips = useQuery({
    queryKey: ['kmTrips', since],
    queryFn: () => fetchKmTrips(startOfDay(since ?? '2000-01-01')),
    enabled: since !== null,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });
  const kms = useMemo(() => (trips.data ? truckKms(references, trips.data, catalog.data ?? []) : new Map<string, TruckKm>()), [references, trips.data, catalog.data]);
  // Without the trips the kilometres are not known: the screens say so instead of showing "no kilometres".
  const kmMissing = since !== null && trips.data === undefined;
  // A query that is off still reads when asked to: without a service done with its kilometres there is nothing to read.
  const refetchTrips = () => (since === null ? Promise.resolve() : trips.refetch());
  return { services, kms, kmMissing, query, trips, refetchTrips, catalog };
}

/** Everything that shows services reads them again after a change: Mantenimiento and Inicio. */
function useServicesChanged() {
  const client = useQueryClient();
  return () => Promise.all(['services', 'kmTrips'].map((key) => client.invalidateQueries({ queryKey: [key] })));
}

export interface SavedService {
  saved: MaintenanceRow;
  /** The next one of a service that repeats, when it was scheduled. */
  next: MaintenanceRow | null;
  /** It had to be scheduled and was not; unknown when not even reading it back worked. */
  nextFailed: false | 'failed' | 'unknown';
}

/**
 * A service, new or changed. One that repeats every N km and was just done gets its next one, due N km after the
 * odometer of that day (next); when that fails, the service stays done and nextFailed says so. Both steps survive an
 * answer that was cut: a change that went through is found in the service as it was sent, and the next one by its id,
 * which is the same for everyone who marks the service done the same way.
 */
export function useSaveService() {
  const changed = useServicesChanged();
  return useMutation({
    mutationFn: async ({ service, row, next }: { service: Service | null; row: TablesInsert<'trf_vehicle_maintenance'> | TablesUpdate<'trf_vehicle_maintenance'>; next: ((saved: MaintenanceRow) => Promise<TablesInsert<'trf_vehicle_maintenance'> | null>) | null }): Promise<SavedService> => {
      let saved: MaintenanceRow;
      try {
        saved = await saveService(service, row);
      } catch (e) {
        if (!service || !(e instanceof ConflictError)) throw e;
        const current = await serviceRow(service.id);
        if (!current || !sameService(current, row)) throw e;
        saved = current;
      }
      const nextRow = next ? await next(saved) : null;
      if (!nextRow?.id) return { saved, next: null, nextFailed: false };
      try {
        return { saved, next: await saveService(null, nextRow), nextFailed: false };
      } catch (e) {
        console.error(e);
        const there = await serviceRow(nextRow.id).catch(() => undefined);
        return there ? { saved, next: there, nextFailed: false } : { saved, next: null, nextFailed: there === null ? 'failed' : 'unknown' };
      }
    },
    onSettled: changed,
  });
}

export function useDeleteService() {
  const changed = useServicesChanged();
  return useMutation({ mutationFn: (service: Service) => deleteService(service), onSettled: changed });
}

/** Every paper of trucks and drivers, with the trucks named as the catalog names them now. */
export function useDocuments() {
  const catalog = useCatalog();
  const query = useQuery({ queryKey: ['documents'], queryFn: fetchDocuments, refetchInterval: 5 * 60_000, staleTime: 60_000 });
  const papers = useMemo(() => (query.data ?? []).map((r) => paperFromRow(r, catalog.data ?? [])), [query.data, catalog.data]);
  return { papers, query, catalog };
}

/** The drivers a paper can be for; read when the form opens. */
export const usePaperDrivers = (enabled: boolean) => useQuery({ queryKey: ['paperDrivers'], queryFn: fetchPaperDrivers, staleTime: 10 * 60_000, enabled });

function useDocumentsChanged() {
  const client = useQueryClient();
  return () => Promise.all(['documents', 'paperDrivers'].map((key) => client.invalidateQueries({ queryKey: [key] })));
}

export interface PaperFileUpload {
  path: string;
  blob: Blob;
  type: FileType;
  /** No save tried before with this file: if this one is refused, nothing points to the file. */
  fresh: boolean;
}

/**
 * A paper, new or changed: its new file first (when there is one), then the paper, then the file it no longer has goes
 * (if that fails, it stays in the private folder, unused). A change whose answer was cut, found in the paper as it was
 * sent, counts as saved. When the database refuses the save, the new file goes too, unless an earlier try with it may
 * have been saved without its answer arriving.
 */
export function useSavePaper() {
  const changed = useDocumentsChanged();
  return useMutation({
    mutationFn: async ({ paper, row, upload, previous }: { paper: Paper | null; row: TablesInsert<'trf_documents'> | TablesUpdate<'trf_documents'>; upload: PaperFileUpload | null; previous: string | null }) => {
      if (upload) await uploadDocumentFile(upload.path, upload.blob, upload.type);
      let saved: PaperDocRow;
      try {
        saved = await saveDocument(paper, row);
      } catch (e) {
        const current = paper && e instanceof ConflictError ? await documentRow(paper.id).catch(() => null) : null;
        if (!current || !samePaper(current, row)) {
          if (upload?.fresh && refused(e)) await removeDocumentFile(upload.path).catch((err: unknown) => console.error(err));
          throw e;
        }
        saved = current;
      }
      if (previous && previous !== saved.object_path) await removeDocumentFile(previous).catch((err: unknown) => console.error(err));
      // A new paper saved before, with another file, kept that one: this file is in its folder, unused.
      if (upload && upload.path !== saved.object_path) await removeDocumentFile(upload.path).catch((err: unknown) => console.error(err));
      return saved;
    },
    onSettled: changed,
  });
}

/**
 * Deletes a paper for good, then its file (if that fails, it stays in the private folder, unused). A delete whose answer
 * was cut, or tried again after one, finds the paper gone: it counts as deleted, and its file goes too.
 */
export function useDeletePaper() {
  const changed = useDocumentsChanged();
  return useMutation({
    mutationFn: async (paper: Paper) => {
      try {
        await deleteDocument(paper);
      } catch (e) {
        if ((await documentRow(paper.id).catch(() => undefined)) !== null) throw e;
      }
      if (paper.file) await removeDocumentFile(paper.file.path).catch((err: unknown) => console.error(err));
    },
    onSettled: changed,
  });
}

type RouteTrip = Pick<ActiveTrip, 'id' | 'driver_id' | 'started_at'> & { ended_at?: string | null };

/**
 * A trip that ended a moment ago is still read for a while: the phone sends the trip first and then what goes with it
 * (details, delivery notes, fuel, queued readings), so the end can arrive before the rest.
 */
const SETTLING_MS = 15 * 60_000;
const settling = (endedAt: string | null | undefined) => {
  const ms = endedAt ? Date.parse(endedAt) : Number.NaN;
  return Number.isFinite(ms) && Date.now() - ms < SETTLING_MS;
};

/**
 * The route of a trip. While the trip is in progress it refreshes, and after the first load each refresh brings only the
 * readings since the last one; a finished trip is read once. A trip that ends while on screen is read once more in full,
 * so its last readings are never missing; the route already shown stays until that read arrives.
 */
export function useRoute(trip: RouteTrip | null) {
  const client = useQueryClient();
  const key = ['route', trip?.id ?? null, trip?.ended_at ? 'ended' : 'live'] as const;
  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<RoutePoint[]> => {
      if (!trip) return [];
      const shown = client.getQueryData<RoutePoint[]>(key);
      const last = shown ? lastSaved(shown) : null;
      return shown && last !== null ? appendReadings(shown, await fetchRoute(trip, last)) : fetchRoute(trip);
    },
    enabled: trip !== null,
    refetchInterval: trip && (!trip.ended_at || settling(trip.ended_at)) ? ROUTE_REFRESH_MS : false,
    staleTime: trip?.ended_at ? 10 * 60_000 : 0,
    placeholderData: (previous, previousQuery) => (trip && previousQuery?.queryKey[1] === trip.id ? previous : undefined),
  });
}

/** The stretches without signal of a trip, read again with its route while it is in progress. */
export function useRouteGaps(trip: RouteTrip | null) {
  return useQuery({
    queryKey: ['routeGaps', trip?.id ?? null],
    queryFn: () => (trip ? fetchRouteGaps(trip.id) : Promise.resolve([])),
    enabled: trip !== null,
    refetchInterval: trip && (!trip.ended_at || settling(trip.ended_at)) ? ROUTE_REFRESH_MS * 6 : false,
  });
}

/** The stops of a trip, read again with its route while it is in progress (the driver marks arrivals as they happen). */
export function useTripStops(trip: RouteTrip | null) {
  return useQuery({
    queryKey: ['tripStops', trip?.id ?? null],
    queryFn: () => (trip ? fetchTripStops(trip.id) : Promise.resolve([])),
    enabled: trip !== null,
    refetchInterval: trip && (!trip.ended_at || settling(trip.ended_at)) ? ROUTE_REFRESH_MS * 3 : false,
  });
}

/** Trips of a period with the office's data on top, newest first; refreshed every minute while the page is open. */
export function useTripList(fromIso: string | null, toIso: string | null) {
  const catalog = useCatalog();
  const list = useQuery({
    queryKey: ['tripList', fromIso, toIso],
    queryFn: () => fetchTripList(fromIso ?? '', toIso ?? ''),
    enabled: fromIso !== null && toIso !== null,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const trips = useMemo(() => (list.data ? mergeTrips(list.data, catalog.data ?? []) : []), [list.data, catalog.data]);
  // The catalog names the trucks (an older label counts for its catalog truck): the screens wait for it and say when it
  // could not be read.
  return { trips, query: list, catalog };
}

/**
 * Everything that shows trips reads them again after a change: the list, the trip's page, Inicio, the kilometres of
 * the trucks (a trip in the trash does not count), the billing of the last months in Métricas and the clients' accounts.
 */
function useTripsChanged() {
  const client = useQueryClient();
  return () => Promise.all(['tripList', 'trip', 'trips', 'kmTrips', 'billedTrips', 'allTrips'].map((key) => client.invalidateQueries({ queryKey: [key] })));
}

/** What the trips of the last months billed, for Métricas; read again every 5 minutes while the page is open. */
export const useBilledTrips = (fromIso: string, toIso: string) =>
  useQuery({ queryKey: ['billedTrips', fromIso, toIso], queryFn: () => fetchBilledTrips(fromIso, toIso), refetchInterval: 5 * 60_000, staleTime: 60_000 });

/** Saves the office's data of a trip (a new one when trip is null); on a conflict the screens read the trip again. */
export function useSaveTrip() {
  const changed = useTripsChanged();
  return useMutation({
    mutationFn: ({ trip, payload }: { trip: Trip | null; payload: TripPayload }) => saveTrip(trip, payload),
    onSettled: changed,
  });
}

/** Sends a trip to the trash or brings it back. */
export function useSetTripDeleted() {
  const changed = useTripsChanged();
  return useMutation({
    mutationFn: ({ trip, deleted }: { trip: Trip; deleted: boolean }) => setTripDeleted(trip, deleted),
    onSettled: changed,
  });
}

/** What the form suggests: the catalog's clients and cargo, and the drivers of the latest trips. */
export const useFormSuggestions = (enabled: boolean) => {
  const lists = useCatalogLists(enabled);
  const drivers = useQuery({ queryKey: ['driverNames'], queryFn: fetchDriverNames, staleTime: 10 * 60_000, enabled });
  return { clients: lists.data?.clients ?? [], products: lists.data?.products ?? [], drivers: drivers.data ?? [] };
};

/** One trip and everything its page shows; it keeps refreshing while the trip is in progress and right after it ends. */
export function useTripDetail(kind: 'app' | 'web', id: string) {
  const catalog = useCatalog();
  const detail = useQuery({
    queryKey: ['trip', kind, id],
    queryFn: () => fetchTripDetail(kind, id),
    refetchInterval: (q) => {
      const s = q.state.data?.session;
      return s && (s.active || settling(s.ended_at)) ? 60_000 : false;
    },
  });
  const trip = useMemo(() => {
    const d = detail.data;
    if (!d) return null;
    if (d.session) return tripFromSession(d.session, d.panel, d.detail, catalog.data ?? []);
    return d.panel ? tripFromPanel(d.panel, catalog.data ?? []) : null;
  }, [detail.data, catalog.data]);
  return { trip, detail, catalog };
}


/**
 * All the fuel with the office's corrections on top: the receipts, the payments and opening balances, and every station
 * with its account. Read again every minute while the page is open: the phones keep sending receipts.
 */
export function useFuel() {
  const catalog = useCatalog();
  const lists = useCatalogLists();
  const query = useQuery({ queryKey: ['fuel'], queryFn: fetchFuel, refetchInterval: 60_000, staleTime: 30_000 });
  const catalogStations = useMemo(() => lists.data?.stations ?? [], [lists.data]);
  const receipts = useMemo(() => (query.data?.receipts ?? []).map((r) => receiptFromRow(r, catalog.data ?? [], catalogStations)), [query.data, catalog.data, catalogStations]);
  const movements = useMemo(() => (query.data?.movements ?? []).map((m) => movementFromRow(m, catalogStations)), [query.data, catalogStations]);
  const stations = useMemo(() => groupStations(receipts, movements, catalogStations), [receipts, movements, catalogStations]);
  return { receipts, movements, stations, catalogStations, query, catalog, lists };
}

/** Everything that shows fuel reads it again after a change: Combustible and the trip's page. */
function useFuelChanged() {
  const client = useQueryClient();
  return () => Promise.all(['fuel', 'trip'].map((key) => client.invalidateQueries({ queryKey: [key] })));
}

/** A receipt typed in the panel: its photo first (when there is one), then the receipt. */
export function useCreateReceipt() {
  const changed = useFuelChanged();
  return useMutation({
    mutationFn: async ({ row, photo }: { row: TablesInsert<'trf_driver_fuel_receipts'>; photo: Blob | null }) => {
      if (photo && row.object_path) await uploadReceiptPhoto(row.object_path, photo);
      return createReceipt(row);
    },
    onSettled: changed,
  });
}

/** A correction or the trash; on a conflict the page reads the receipt again. */
export function useUpdateReceipt() {
  const changed = useFuelChanged();
  return useMutation({
    mutationFn: ({ receipt, changes }: { receipt: Pick<Receipt, 'id' | 'updatedAt'>; changes: Pick<TablesUpdate<'trf_driver_fuel_receipts'>, 'panel_data' | 'archived'> }) => updateReceipt(receipt, changes),
    onSettled: changed,
  });
}

/** A payment or an opening balance, new or changed. */
export function useSaveMovement() {
  const changed = useFuelChanged();
  return useMutation({
    mutationFn: ({ movement, row }: { movement: Movement | null; row: TablesInsert<'trf_fuel_station_movements'> | TablesUpdate<'trf_fuel_station_movements'> }) => saveMovement(movement, row),
    onSettled: changed,
  });
}

/** Annuls a payment or an opening balance, or brings it back. */
export function useSetMovementDeleted() {
  const changed = useFuelChanged();
  return useMutation({
    mutationFn: ({ movement, deleted }: { movement: Movement; deleted: boolean }) => setMovementDeleted(movement, deleted),
    onSettled: changed,
  });
}

/** Every driver's card with its salaries and payments (only the panel accounts read them). */
export function useDrivers(enabled = true) {
  const query = useQuery({ queryKey: ['drivers'], queryFn: fetchDrivers, staleTime: 30_000, enabled });
  const drivers = useMemo(() => (query.data?.drivers ?? []).map(driverFromRow).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })), [query.data]);
  const salaries = useMemo(() => (query.data?.salaries ?? []).map(salaryFromRow), [query.data]);
  const payments = useMemo(() => (query.data?.payments ?? []).map(paymentFromRow), [query.data]);
  return { query, drivers, salaries, payments };
}

function useDriversChanged() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['drivers'] });
}

/** A new card or a change to one; on a conflict the page reads them again. */
export function useSaveDriver() {
  const changed = useDriversChanged();
  return useMutation({
    mutationFn: ({ driver, row }: { driver: Driver | null; row: TablesInsert<'trf_drivers'> | TablesUpdate<'trf_drivers'> }) => saveDriver(driver, row),
    onSettled: changed,
  });
}

/** A salary from a month, new or corrected. */
export function useSaveSalary() {
  const changed = useDriversChanged();
  return useMutation({
    mutationFn: ({ salary, row }: { salary: Salary | null; row: TablesInsert<'trf_driver_salaries'> | TablesUpdate<'trf_driver_salaries'> }) => saveSalary(salary, row),
    onSettled: changed,
  });
}

/** Annuls a salary: the one before rules again from its month. */
export function useSetSalaryDeleted() {
  const changed = useDriversChanged();
  return useMutation({ mutationFn: ({ salary, deleted }: { salary: Salary; deleted: boolean }) => setSalaryDeleted(salary, deleted), onSettled: changed });
}

/** A payment, new or corrected. */
export function useSavePayment() {
  const changed = useDriversChanged();
  return useMutation({
    mutationFn: ({ payment, row }: { payment: Payment | null; row: TablesInsert<'trf_driver_payments'> | TablesUpdate<'trf_driver_payments'> }) => savePayment(payment, row),
    onSettled: changed,
  });
}

/** Annuls a payment, or brings it back: nothing is deleted. */
export function useSetPaymentDeleted() {
  const changed = useDriversChanged();
  return useMutation({ mutationFn: ({ payment, deleted }: { payment: Payment; deleted: boolean }) => setPaymentDeleted(payment, deleted), onSettled: changed });
}

/** Every card of trucks and trailers and which trailer each truck takes (only the panel accounts read them). */
export function useVehicles(enabled = true) {
  const query = useQuery({ queryKey: ['vehicles'], queryFn: fetchVehicles, staleTime: 30_000, enabled });
  const vehicles = useMemo(() => (query.data?.units ?? []).map(vehicleFromRow), [query.data]);
  const hitches = useMemo(() => (query.data?.hitches ?? []).map(hitchFromRow), [query.data]);
  return { query, vehicles, hitches };
}

function useVehiclesChanged() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['vehicles'] });
}

/**
 * A card, new or changed, with its new photo when one was chosen: the photo goes first, so a card never points to a
 * photo that is not there. A save tried again finds the photo already uploaded.
 */
export function useSaveVehicle() {
  const changed = useVehiclesChanged();
  return useMutation({
    mutationFn: async ({ vehicle, row, photo }: { vehicle: Vehicle | null; row: TablesInsert<'trf_fleet_units'> | TablesUpdate<'trf_fleet_units'>; photo: { path: string; jpeg: Blob } | null }) => {
      if (photo) await uploadVehiclePhoto(photo.path, photo.jpeg);
      return saveVehicle(vehicle, photo ? { ...row, photo_path: photo.path } : row);
    },
    onSettled: changed,
  });
}

/** A trailer on a truck from a day; on a conflict the page reads the hitches again. */
export function useHitchTrailer() {
  const changed = useVehiclesChanged();
  return useMutation({ mutationFn: (r: HitchRequest) => hitchTrailer(r), onSettled: changed });
}

/** A hitch that ends (unhitched), with other notes, or annulled. */
export function useSaveHitch() {
  const changed = useVehiclesChanged();
  return useMutation({ mutationFn: ({ hitch, row }: { hitch: Hitch; row: TablesUpdate<'trf_fleet_hitches'> }) => saveHitch(hitch, row), onSettled: changed });
}

/** Every expense, the annulled ones too (only the panel accounts read them); read again every 5 minutes. */
export function useExpenses(enabled = true) {
  const query = useQuery({ queryKey: ['expenses'], queryFn: fetchExpenses, staleTime: 30_000, refetchInterval: 5 * 60_000, enabled });
  const expenses = useMemo(() => (query.data ?? []).map(expenseFromRow), [query.data]);
  return { query, expenses };
}

/**
 * What an expense can go to and how each is named now: the trucks of the catalog and of the cards, the trailers and the
 * drivers. reads are the queries behind them, for the screens to say when one failed.
 */
export function useExpenseTargets(enabled = true) {
  const catalog = useCatalog();
  const { query: vehicles, vehicles: units, hitches } = useVehicles(enabled);
  const { query: drivers, drivers: cards } = useDrivers(enabled);
  const value = useMemo(() => targetChoices(truckEntries(catalog.data ?? [], units, hitches), units, cards), [catalog.data, units, hitches, cards]);
  return { ...value, reads: { catalog, vehicles, drivers } };
}

function useExpensesChanged() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['expenses'] });
}

export interface ExpenseFileUpload {
  path: string;
  blob: Blob;
  type: FileType;
}

/**
 * An expense, new or changed, with its new invoice when one was chosen: the file goes first, so an expense never points
 * to a file that is not there. A save tried again finds the file already uploaded. Nobody deletes invoices: one replaced,
 * or of a save that was refused, stays in the private folder.
 */
export function useSaveExpense() {
  const changed = useExpensesChanged();
  return useMutation({
    mutationFn: async ({ expense, row, upload }: { expense: Expense | null; row: TablesInsert<'trf_expenses'> | TablesUpdate<'trf_expenses'>; upload: ExpenseFileUpload | null }) => {
      if (upload) await uploadExpenseFile(upload.path, upload.blob, upload.type);
      return saveExpense(expense, row);
    },
    onSettled: changed,
  });
}

/** Annuls an expense, or brings it back: nothing is deleted. */
export function useSetExpenseDeleted() {
  const changed = useExpensesChanged();
  return useMutation({ mutationFn: ({ expense, deleted }: { expense: Expense; deleted: boolean }) => setExpenseDeleted(expense, deleted), onSettled: changed });
}

/**
 * Every trip with the office's data on top, the ones in the trash too, for the sums that need them all; read again every
 * 5 minutes while the page is open.
 */
export function useAllTrips(enabled = true) {
  const catalog = useCatalog();
  const query = useQuery({ queryKey: ['allTrips'], queryFn: fetchAllTrips, refetchInterval: 5 * 60_000, staleTime: 60_000, enabled });
  const trips = useMemo(() => (query.data ? mergeTrips(query.data, catalog.data ?? []) : []), [query.data, catalog.data]);
  return { trips, query, catalog };
}

/**
 * Every client with its account: the trips billed to it, its collections and its opening balances, and the clients of
 * the app's list (only the panel accounts read the collections).
 */
export function useClients() {
  const { trips, query: tripsQuery, catalog } = useAllTrips();
  const lists = useCatalogLists();
  const query = useQuery({ queryKey: ['clientMovements'], queryFn: fetchClientMovements, staleTime: 30_000, refetchInterval: 5 * 60_000 });
  const movements = useMemo(() => (query.data ?? []).map(clientMovementFromRow), [query.data]);
  const listed = useMemo(() => lists.data?.clients ?? [], [lists.data]);
  const clients = useMemo(() => groupClients(trips, movements, listed), [trips, movements, listed]);
  return { clients, trips, movements, query, tripsQuery, catalog, lists };
}

/**
 * What the profit needs (decisions of 26/10/2026 and 27/10/2026): every trip, the fuel, the toll passages, the expenses,
 * the hitches of Flota and the drivers' salaries and payments (only the panel accounts read them). reads are the queries
 * behind it, for the page to say when one failed.
 */
export function useProfit() {
  const { trips, query: tripsQuery, catalog } = useAllTrips();
  const fuel = useFuel();
  const { expenses, query: expensesQuery } = useExpenses();
  const { vehicles, hitches, query: vehiclesQuery } = useVehicles();
  const { drivers, salaries, payments, query: driversQuery } = useDrivers();
  const tolls = useQuery({ queryKey: ['tollPassages'], queryFn: fetchTollPassages, staleTime: 60_000, refetchInterval: 5 * 60_000 });
  const passages = useMemo(() => (tolls.data ?? []).map(tollPassageFromRow).filter((p): p is TollPassage => p !== null), [tolls.data]);
  const names = useMemo(() => {
    const entries = truckEntries(catalog.data ?? [], vehicles, hitches);
    return new Map([...entries.current, ...entries.gone].map((e) => [e.key, e.label]));
  }, [catalog.data, vehicles, hitches]);
  const payroll = useMemo(
    () => drivers.map((d) => ({ leftOn: d.leftOn, salaries: salaries.filter((s) => s.driverId === d.id), payments: payments.filter((p) => p.driverId === d.id) })),
    [drivers, salaries, payments],
  );
  const input: ProfitInput = useMemo(
    () => ({ trips, receipts: fuel.receipts, passages, expenses, hitches, payroll, names }),
    [trips, fuel.receipts, passages, expenses, hitches, payroll, names],
  );
  return { input, reads: { trips: tripsQuery, fuel: fuel.query, tolls, expenses: expensesQuery, vehicles: vehiclesQuery, drivers: driversQuery, catalog } };
}

function useClientMovementsChanged() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['clientMovements'] });
}

/** A collection or an opening balance, new or changed; on a conflict the page reads them again. */
export function useSaveClientMovement() {
  const changed = useClientMovementsChanged();
  return useMutation({
    mutationFn: ({ movement, row }: { movement: ClientMovement | null; row: TablesInsert<'trf_client_movements'> | TablesUpdate<'trf_client_movements'> }) => saveClientMovement(movement, row),
    onSettled: changed,
  });
}

/** Annuls a collection or an opening balance, or brings it back: nothing is deleted. */
export function useSetClientMovementDeleted() {
  const changed = useClientMovementsChanged();
  return useMutation({ mutationFn: ({ movement, deleted }: { movement: ClientMovement; deleted: boolean }) => setClientMovementDeleted(movement, deleted), onSettled: changed });
}

/** A link to a private photo for a list or a card: read once and kept nine minutes, as each link lasts ten. */
export const usePhotoUrl = (bucket: PhotoBucket, path: string | null) =>
  useQuery({ queryKey: ['photoUrl', bucket, path], queryFn: () => photoUrl(bucket, path as string), enabled: path !== null, staleTime: 9 * 60_000, gcTime: 10 * 60_000, retry: 1 });
