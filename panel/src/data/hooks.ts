import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { FLEET_REFRESH_MS, LIVE_REFRESH_MS, PRESENCE_REFRESH_MS, ROUTE_REFRESH_MS } from '../config';
import { type ActiveTrip, type CatalogTruck, fleetUnits, truckLabel, withLivePositions } from '../lib/fleet';
import { appendReadings } from '../lib/route';
import type { TripPayload } from '../lib/tripForm';
import { mergeTrips, type Trip, tripFromPanel, tripFromSession } from '../lib/trips';
import {
  fetchCatalog,
  fetchCatalogLists,
  fetchDriverNames,
  fetchFleet,
  fetchLastTrips,
  fetchLivePositions,
  fetchPapers,
  fetchPresence,
  fetchRoute,
  fetchTripDetail,
  fetchTripList,
  fetchTrips,
  type RoutePoint,
  saveTrip,
  setTripDeleted,
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

export const usePapers = () => useQuery({ queryKey: ['papers'], queryFn: fetchPapers, staleTime: 10 * 60_000 });

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

/** Everything that shows trips reads them again after a change: the list, the trip's page and Inicio. */
function useTripsChanged() {
  const client = useQueryClient();
  return () => Promise.all(['tripList', 'trip', 'trips'].map((key) => client.invalidateQueries({ queryKey: [key] })));
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
  const lists = useQuery({ queryKey: ['catalogLists'], queryFn: fetchCatalogLists, staleTime: 10 * 60_000, enabled });
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
