import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { FLEET_REFRESH_MS, ROUTE_REFRESH_MS } from '../config';
import { type ActiveTrip, fleetUnits } from '../lib/fleet';
import { fetchCatalog, fetchFleet, fetchPapers, fetchRoute, fetchTrips } from './api';

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

export const useRoute = (trip: ActiveTrip | null) =>
  useQuery({
    queryKey: ['route', trip?.id ?? null],
    queryFn: () => (trip ? fetchRoute(trip) : Promise.resolve([])),
    enabled: trip !== null,
    refetchInterval: ROUTE_REFRESH_MS,
  });
