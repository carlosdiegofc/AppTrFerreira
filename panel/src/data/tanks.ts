// The tank of each truck, read and saved: its settings (trf_tank_settings), its latest measurement (trf_tank_references),
// the fuel receipts and the trips since the earliest start. While a truck moves, its trips are read every 30 seconds.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { TablesInsert } from '../lib/database.types';
import { truckLabel } from '../lib/fleet';
import { roadVehicleKey, type TankReference } from '../lib/road';
import {
  consumptionFrom,
  measuredConsumption,
  type MeasuredConsumption,
  settingsFromRow,
  type TankSettings,
  tankStart,
  tankState,
  type TankState,
  tripsInCatalog,
  tripsSince,
} from '../lib/tanks';
import { fetchTanks, fetchTankTrips, saveTankSettings } from './api';
import { useFuel } from './hooks';
import { saveRoad } from './road';

/** A truck as Combustible lists it: its tank, its latest measurement and the estimate now. */
export interface TankRow {
  key: string;
  name: string;
  settings: TankSettings | null;
  reference: TankReference | null;
  state: TankState;
  /** From full tank to full tank, when there are two with enough kilometres in between. */
  measured: MeasuredConsumption | null;
}

const RANK: Record<TankState['status'], number> = { known: 2, unknown: 1, waiting: 3, unset: 4 };

/** Low first, then the ones to check, then by how full they are; the ones without a tank last. */
function order(a: TankRow, b: TankRow): number {
  const low = (r: TankRow) => (r.state.status === 'known' && r.state.low ? 0 : RANK[r.state.status]);
  const diff = low(a) - low(b);
  if (diff !== 0) return diff;
  if (a.state.status === 'known' && b.state.status === 'known') return a.state.share - b.state.share || a.name.localeCompare(b.name, 'es');
  return a.name.localeCompare(b.name, 'es');
}

/**
 * Every truck's tank: the catalog's trucks and any other with a tank set. known says whether every read it needs
 * answered; until then nothing shows as empty or as missing.
 */
export function useTanks() {
  const fuel = useFuel();
  const tanks = useQuery({ queryKey: ['tanks'], queryFn: fetchTanks, staleTime: 30_000, refetchInterval: 60_000 });
  const trucks = fuel.catalog.data;

  const base = useMemo(() => {
    if (!tanks.data) return null;
    const settings = new Map(tanks.data.settings.map((r) => [r.vehicle_key, settingsFromRow(r)]));
    const references = new Map(tanks.data.references.map((r) => [r.vehicle_key, r]));
    const names = new Map<string, string>();
    for (const t of trucks ?? []) {
      const label = truckLabel(t);
      if (label) names.set(roadVehicleKey(label), label);
    }
    for (const s of settings.values()) if (!names.has(s.key)) names.set(s.key, s.name);
    for (const r of references.values()) if (!names.has(r.vehicle_key)) names.set(r.vehicle_key, r.vehicle_name);
    return [...names].map(([key, name]) => {
      const reference = references.get(key) ?? null;
      // A truck measured in GPS before its tank had its own settings: the measurement says them.
      const own =
        settings.get(key) ??
        (reference ? { key, name, capacity: Number(reference.capacity_l), consumption: Number(reference.consumption), warning: Number(reference.warning_l), updatedAt: null } : null);
      return { key, name, settings: own, reference };
    });
  }, [tanks.data, trucks]);

  // The trips of each tank since its start, and of its measured consumption since the full tank before the last one.
  const since = useMemo(() => {
    if (!base || !fuel.query.data) return null;
    return tripsSince(base.flatMap((b) => [b.settings ? (tankStart(b.settings, b.reference, fuel.receipts)?.at ?? null) : null, consumptionFrom(b.key, fuel.receipts)]));
  }, [base, fuel.query.data, fuel.receipts]);
  const trips = useQuery({ queryKey: ['tankTrips', since], queryFn: () => fetchTankTrips(since as string), enabled: since !== null, refetchInterval: 30_000, staleTime: 15_000 });

  // Without any start there are no trips to read: the estimate needs none. A trip counts for its catalog truck, like the
  // receipts, so the list waits for the catalog too.
  const tripList = useMemo(() => (since === null ? [] : trips.data && trucks ? tripsInCatalog(trips.data, trucks) : undefined), [since, trips.data, trucks]);
  const rows = useMemo<TankRow[] | null>(() => {
    if (!base || !fuel.query.data || !trucks || !tripList) return null;
    return base
      .map((b) => ({ ...b, state: tankState(b.settings, b.reference, tripList, fuel.receipts), measured: measuredConsumption(b.key, tripList, fuel.receipts) }))
      .sort(order);
  }, [base, fuel.query.data, fuel.receipts, trucks, tripList]);

  const reads = [tanks, fuel.query, fuel.catalog, ...(since === null ? [] : [trips])];
  return {
    rows,
    tanks,
    trips,
    fuel,
    error: reads.find((r) => r.error && r.data === undefined)?.error ?? null,
    stale: reads.some((r) => r.error && r.data !== undefined),
    refetch: () => reads.forEach((r) => void r.refetch()),
    isFetching: reads.some((r) => r.isFetching),
  };
}

function useTanksChanged() {
  const client = useQueryClient();
  return () => Promise.all(['tanks', 'tankTrips', 'roadAccount'].map((key) => client.invalidateQueries({ queryKey: [key] })));
}

/** A truck's tank: capacity, consumption and the alert. */
export function useSaveTank() {
  const changed = useTanksChanged();
  return useMutation({
    mutationFn: ({ settings, row }: { settings: TankSettings | null; row: TablesInsert<'trf_tank_settings'> }) => saveTankSettings(settings, row),
    onSettled: changed,
  });
}

/** What the tank has now, measured (or full): the estimate starts again from here. */
export function useMeasureTank() {
  const changed = useTanksChanged();
  return useMutation({
    mutationFn: ({ row, before }: { row: TankReference; before: string | null }) => saveRoad({ type: 'tank', row, before }),
    onSettled: changed,
  });
}
