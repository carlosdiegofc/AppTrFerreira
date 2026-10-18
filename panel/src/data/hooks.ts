import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { FLEET_REFRESH_MS, ROUTE_REFRESH_MS } from '../config';
import { type ActiveTrip, fleetUnits } from '../lib/fleet';
import { appendReadings } from '../lib/route';
import { fetchCatalog, fetchFleet, fetchPapers, fetchRoute, fetchTrips, type RoutePoint } from './api';

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

/** Every truck with its live state, recomputed as time passes (a truck goes "sin señal" without new data). */
export function useFleet(now: number) {
  const catalog = useCatalog();
  const fleet = useFleetData();
  const units = useMemo(
    () => (fleet.data ? fleetUnits(fleet.data.active, fleet.data.finished, catalog.data ?? [], now) : []),
    [fleet.data, catalog.data, now],
  );
  return {
    units,
    fetchedAt: fleet.data?.fetchedAt ?? null,
    isLoading: fleet.isLoading || catalog.isLoading,
    error: fleet.error ?? catalog.error,
    refetch: () => Promise.all([fleet.refetch(), catalog.refetch()]),
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
