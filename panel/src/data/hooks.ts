import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { FLEET_REFRESH_MS, ROUTE_REFRESH_MS } from '../config';
import { type ActiveTrip, type CatalogTruck, fleetUnits, truckLabel } from '../lib/fleet';
import { appendReadings } from '../lib/route';
import { fetchCatalog, fetchFleet, fetchLastTrips, fetchPapers, fetchRoute, fetchTrips, type RoutePoint } from './api';

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

/** The route of a trip in progress. After the first load each refresh brings only the readings since the last one. */
export function useRoute(trip: ActiveTrip | null) {
  const client = useQueryClient();
  return useQuery({
    queryKey: ['route', trip?.id ?? null],
    queryFn: async (): Promise<RoutePoint[]> => {
      if (!trip) return [];
      const shown = client.getQueryData<RoutePoint[]>(['route', trip.id]);
      const last = shown?.at(-1);
      return shown && last ? appendReadings(shown, await fetchRoute(trip, last.recorded_at)) : fetchRoute(trip);
    },
    enabled: trip !== null,
    refetchInterval: ROUTE_REFRESH_MS,
  });
}
