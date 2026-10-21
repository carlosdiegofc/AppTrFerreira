import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { FLEET_REFRESH_MS, LIVE_REFRESH_MS, PRESENCE_REFRESH_MS, ROUTE_REFRESH_MS } from '../config';
import type { TablesInsert, TablesUpdate } from '../lib/database.types';
import { startOfDay } from '../lib/dates';
import { type FileType, type Paper, type PaperDocRow, paperFromRow, samePaper } from '../lib/documents';
import { type ActiveTrip, type CatalogTruck, fleetUnits, truckLabel, withLivePositions } from '../lib/fleet';
import { groupStations, type Movement, movementFromRow, type Receipt, receiptFromRow } from '../lib/fuel';
import { kmReferences, kmSince, type MaintenanceRow, sameService, type Service, serviceFromRow, type TruckKm, truckKms } from '../lib/maintenance';
import { appendReadings } from '../lib/route';
import type { TripPayload } from '../lib/tripForm';
import { mergeTrips, type Trip, tripFromPanel, tripFromSession } from '../lib/trips';
import {
  ConflictError,
  createReceipt,
  deleteDocument,
  deleteService,
  documentRow,
  fetchCatalog,
  fetchCatalogLists,
  fetchDocuments,
  fetchDriverNames,
  fetchFleet,
  fetchFuel,
  fetchKmTrips,
  fetchLastTrips,
  fetchLivePositions,
  fetchPaperDrivers,
  fetchPresence,
  fetchRoute,
  fetchServices,
  fetchTripDetail,
  fetchTripList,
  fetchTrips,
  refused,
  removeDocumentFile,
  type RoutePoint,
  saveDocument,
  saveMovement,
  saveService,
  saveTrip,
  serviceRow,
  setMovementDeleted,
  setTripDeleted,
  updateReceipt,
  uploadDocumentFile,
  uploadReceiptPhoto,
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
      const last = shown?.at(-1);
      return shown && last ? appendReadings(shown, await fetchRoute(trip, last.recorded_at)) : fetchRoute(trip);
    },
    enabled: trip !== null,
    refetchInterval: trip && (!trip.ended_at || settling(trip.ended_at)) ? ROUTE_REFRESH_MS : false,
    staleTime: trip?.ended_at ? 10 * 60_000 : 0,
    placeholderData: (previous, previousQuery) => (trip && previousQuery?.queryKey[1] === trip.id ? previous : undefined),
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
 * Everything that shows trips reads them again after a change: the list, the trip's page, Inicio, and the kilometres
 * of the trucks (a trip in the trash does not count).
 */
function useTripsChanged() {
  const client = useQueryClient();
  return () => Promise.all(['tripList', 'trip', 'trips', 'kmTrips'].map((key) => client.invalidateQueries({ queryKey: [key] })));
}

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
