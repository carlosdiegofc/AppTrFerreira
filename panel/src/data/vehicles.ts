// Flota (decision of 24/10/2026): each truck with its card and its trailer, and what the other sections already know of
// it: where it is, its kilometres, its tank, its services, its papers and its month. Every read is the one of its own
// section, so a truck shows here what it shows there.
import { useMemo } from 'react';
import { dayInZone, firstOfMonth, firstOfNextMonth, startOfDay } from '../lib/dates';
import { type FleetUnit, truckLabel } from '../lib/fleet';
import { type PaperView, paperViews } from '../lib/documents';
import { type ServiceView, serviceViews, type TruckKm } from '../lib/maintenance';
import { type MetricsRow, summarize } from '../lib/metrics';
import { attention, type Attention, byAttention, ofTruck, type TruckEntry, truckEntries } from '../lib/vehicles';
import { useCatalog, useDocuments, useFleet, useMaintenance, useTripList, useVehicles } from './hooks';
import { type TankRow, useTanks } from './tanks';

export interface TruckView extends TruckEntry {
  /** Where it is now: on a trip (on the road, stopped, without signal) or where its last trip ended. */
  live: FleetUnit | null;
  /** Estimated: the odometer of its last service done plus the GPS since. */
  km: TruckKm | null;
  tank: TankRow | null;
  papers: PaperView[];
  /** The ones still to do, the most urgent first. */
  services: ServiceView[];
  /** This month's trips, kilometres and fuel, as Métricas counts them. */
  month: MetricsRow | null;
  attention: Attention;
}

/** What could be read: a truck shows «—» for what could not, never a zero or «Al día» it does not know. */
export interface FleetKnown {
  live: boolean;
  /** The last trip of each truck, further back than the live list: without it, «no trips» is not known. */
  lastTrip: boolean;
  km: boolean;
  tank: boolean;
  papers: boolean;
  services: boolean;
  month: boolean;
}

export function useFleetViews(now: number) {
  const today = dayInZone(now);
  const catalog = useCatalog();
  const cards = useVehicles();
  const fleet = useFleet(now);
  const maintenance = useMaintenance();
  const docs = useDocuments();
  const tanks = useTanks();
  const month = firstOfMonth(today);
  const tripList = useTripList(startOfDay(month), startOfDay(firstOfNextMonth(today)));

  const known: FleetKnown = {
    live: !fleet.isLoading && !fleet.error,
    lastTrip: fleet.lastTrips.data !== undefined,
    // Without the trips the kilometres are not known, as in Mantenimiento; the services still say what their dates say.
    km: maintenance.query.data !== undefined && !maintenance.kmMissing,
    tank: tanks.rows !== null,
    papers: docs.query.data !== undefined,
    services: maintenance.query.data !== undefined,
    month: tripList.query.data !== undefined,
  };
  const entries = useMemo(() => (catalog.data && cards.query.data ? truckEntries(catalog.data, cards.vehicles, cards.hitches) : null), [catalog.data, cards.query.data, cards.vehicles, cards.hitches]);
  const monthRows = useMemo(() => summarize(tripList.trips, [], 'vehicle').rows, [tripList.trips]);
  const views = useMemo(() => {
    if (!entries) return null;
    const view = (e: TruckEntry): TruckView => {
      const papers = paperViews(
        docs.papers.filter((p) => p.scope === 'vehicle' && ofTruck(p.vehicle, e)),
        today,
      );
      const services = serviceViews(
        maintenance.services.filter((s) => ofTruck(s.vehicle, e) && s.doneOn === null),
        maintenance.kms,
        today,
      );
      const tank = tanks.rows?.find((r) => r.key === e.key) ?? null;
      const low = tank?.state.status === 'known' && tank.state.low;
      return {
        ...e,
        live: fleet.units.find((u) => truckLabel(u) === e.label) ?? null,
        km: maintenance.kms.get(e.label) ?? null,
        tank,
        papers,
        services,
        month: monthRows.find((r) => r.named && r.name === e.label) ?? null,
        // What could not be read does not count as fine nor as late.
        attention: attention(known.papers ? papers.map((p) => p.state) : [], known.services ? services.map((s) => s.status.state) : [], known.tank && low),
      };
    };
    return { current: byAttention(entries.current.map(view)), gone: entries.gone.map(view) };
  }, [entries, docs.papers, maintenance.services, maintenance.kms, tanks.rows, fleet.units, monthRows, today, known.papers, known.services, known.tank]);

  // The page waits for the cards and the catalog; every other read that failed leaves «—» where it counts and says so.
  // A read that answered before and fails to refresh says that what shows is the last one read.
  const reads = [
    { query: cards.query, failed: false, stale: cards.query.data !== undefined && !!cards.query.error, what: 'las fichas de la flota' },
    { query: catalog, failed: false, stale: catalog.data !== undefined && !!catalog.error, what: 'la lista de camiones de la app' },
    { query: fleet, failed: !!fleet.error && !fleet.isLoading, stale: false, what: 'dónde está cada camión' },
    { query: fleet.lastTrips, failed: fleet.lastTrips.data === undefined && !!fleet.lastTrips.error, stale: fleet.lastTrips.data !== undefined && !!fleet.lastTrips.error, what: 'los últimos viajes de cada camión' },
    { query: maintenance.query, failed: maintenance.query.data === undefined && !!maintenance.query.error, stale: maintenance.query.data !== undefined && !!maintenance.query.error, what: 'los services' },
    { query: maintenance.trips, failed: maintenance.kmMissing && !!maintenance.trips.error, stale: maintenance.trips.data !== undefined && !!maintenance.trips.error, what: 'los kilómetros de los viajes' },
    { query: docs.query, failed: docs.query.data === undefined && !!docs.query.error, stale: docs.query.data !== undefined && !!docs.query.error, what: 'los papeles' },
    { query: { refetch: tanks.refetch }, failed: !!tanks.error, stale: tanks.stale, what: 'los tanques' },
    { query: tripList.query, failed: tripList.query.data === undefined && !!tripList.query.error, stale: tripList.query.data !== undefined && !!tripList.query.error, what: 'los viajes del mes' },
  ];
  const waiting =
    fleet.isLoading ||
    (fleet.lastTrips.data === undefined && !fleet.lastTrips.error) ||
    (maintenance.query.data === undefined && !maintenance.query.error) ||
    (maintenance.kmMissing && !maintenance.trips.error) ||
    (docs.query.data === undefined && !docs.query.error) ||
    (tanks.rows === null && !tanks.error) ||
    (tripList.query.data === undefined && !tripList.query.error);
  const refetch = () => {
    void cards.query.refetch();
    void catalog.refetch();
    void fleet.refetch();
    void maintenance.query.refetch();
    void maintenance.refetchTrips();
    void docs.query.refetch();
    tanks.refetch();
    void tripList.query.refetch();
  };
  const isFetching = cards.query.isFetching || catalog.isFetching || fleet.isFetching || maintenance.query.isFetching || docs.query.isFetching || tanks.isFetching || tripList.query.isFetching;
  return { views, known, cards, catalog, docs, reads, waiting, refetch, isFetching, today };
}
