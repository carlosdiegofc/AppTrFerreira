import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { FLEET_REFRESH_MS, ROUTE_REFRESH_MS } from '../config';
import { type ActiveTrip, type CatalogTruck, fleetUnits, truckLabel } from '../lib/fleet';
import { appendReadings } from '../lib/route';
import { mergeTrips, tripFromPanel, tripFromSession } from '../lib/trips';
import { fetchCatalog, fetchFleet, fetchLastTrips, fetchPapers, fetchRoute, fetchTripDetail, fetchTripList, fetchTrips, type RoutePoint } from './api';

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

/** The last trip of every truck, further back than the live refresh; trucks rarely change it, so every 30 minutes. */
const useLastTrips = (catalog: readonly CatalogTruck[] | undefined) =>
  useQuery({
    queryKey: ['lastTrips', catalog?.map(truckLabel).join('|') ?? ''],
    queryFn: () => fetchLastTrips(catalog ?? []),
    enabled: catalog !== undefined,
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
  });

/** Every truck with its live state, recomputed as time passes (a truck goes "sin señal" without new data). */
export function useFleet(now: number) {
  const catalog = useCatalog();
  const fleet = useFleetData();
  const last = useLastTrips(catalog.data);
  // The live list first: a truck that appears there has its newest trip there.
  const units = useMemo(
    () => (fleet.data ? fleetUnits(fleet.data.active, [...fleet.data.finished, ...(last.data ?? [])], catalog.data ?? [], now) : []),
    [fleet.data, last.data, catalog.data, now],
  );
  return {
    units,
    fetchedAt: fleet.data?.fetchedAt ?? null,
    isLoading: fleet.isLoading || catalog.isLoading,
    error: fleet.error ?? catalog.error,
    refetch: () => Promise.all([fleet.refetch(), catalog.refetch(), last.refetch()]),
    isFetching: fleet.isFetching || catalog.isFetching,
  };
}

export const useTrips = (fromIso: string, toIso: string, refreshMs?: number) =>
  useQuery({ queryKey: ['trips', fromIso, toIso], queryFn: () => fetchTrips(fromIso, toIso), refetchInterval: refreshMs ?? false, staleTime: 60_000 });

export const usePapers = () => useQuery({ queryKey: ['papers'], queryFn: fetchPapers, staleTime: 10 * 60_000 });

type RouteTrip = Pick<ActiveTrip, 'id' | 'driver_id' | 'started_at'> & { ended_at?: string | null };

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
    refetchInterval: trip && !trip.ended_at ? ROUTE_REFRESH_MS : false,
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
  return { trips, query: list };
}

/** One trip and everything its page shows. */
export function useTripDetail(kind: 'app' | 'web', id: string) {
  const catalog = useCatalog();
  const detail = useQuery({ queryKey: ['trip', kind, id], queryFn: () => fetchTripDetail(kind, id), refetchInterval: (q) => (q.state.data?.session?.active ? 60_000 : false) });
  const trip = useMemo(() => {
    const d = detail.data;
    if (!d) return null;
    if (d.session) return tripFromSession(d.session, d.panel, d.detail, catalog.data ?? []);
    return d.panel ? tripFromPanel(d.panel, catalog.data ?? []) : null;
  }, [detail.data, catalog.data]);
  return { trip, detail };
}
