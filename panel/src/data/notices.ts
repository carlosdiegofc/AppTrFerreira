// What needs attention: trucks low on fuel, papers and services expired or close, and (decision of 28/10/2026) trips
// that look left open, receipts without an amount or litres, trips with cargo without an amount and drivers with an
// older app. Inicio lists it and the bell of the top bar counts it, from the same reads.
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { addDays, startOfDay } from '../lib/dates';
import { receiptFromRow } from '../lib/fuel';
import { longTrips, oldApps, RECEIPT_DAYS, receiptsMissing, UNBILLED_DAYS, unbilledTrips } from '../lib/notices';
import { type Alert, alerts } from '../lib/papers';
import { driverPresence } from '../lib/presence';
import { mergeTrips } from '../lib/trips';
import { fetchFleet, fetchPresence, fetchRecentReceipts, fetchTripList } from './api';
import { useCatalog, useDocuments, useMaintenance } from './hooks';
import { lowTanks, useTanks } from './tanks';

/** The bell is on every page: what it reads beyond the papers is read again every 5 minutes, not more often. */
const EVERY = 5 * 60_000;

export function useNotices(today: string, now: number) {
  const documents = useDocuments();
  const maintenance = useMaintenance();
  const tanks = useTanks();
  const catalog = useCatalog();
  const low = lowTanks(tanks.rows);
  // The warnings by kilometres need the trips: until they arrive (or fail), the list is not complete.
  const kmWaiting = maintenance.kmMissing && !maintenance.trips.error;
  const papersLoaded = documents.query.data !== undefined && maintenance.query.data !== undefined && !kmWaiting;
  const papersError = documents.query.error ?? maintenance.query.error;
  const pending: Alert[] = useMemo(() => {
    if (!papersLoaded) return [];
    const papers = documents.papers.map((p) => ({ id: p.id, scope: p.scope, driver_name: p.driverName, vehicle: p.vehicle, kind: p.kind, expires_on: p.expiresOn }));
    const services = maintenance.services.map((s) => ({ id: s.id, vehicle: s.vehicle, kind: s.kind, due_on: s.dueOn, done_on: s.doneOn, due_km: s.dueKm }));
    return alerts(papers, services, today, (vehicle) => maintenance.kms.get(vehicle)?.estimate ?? null);
  }, [papersLoaded, documents.papers, maintenance.services, maintenance.kms, today]);

  // The same reads as GPS en vivo, Combustible and Viajes, shared with them while they are open.
  const fleet = useQuery({ queryKey: ['fleet'], queryFn: fetchFleet, refetchInterval: EVERY });
  const presence = useQuery({ queryKey: ['presence'], queryFn: fetchPresence, refetchInterval: EVERY });
  const receiptsFrom = startOfDay(addDays(today, -RECEIPT_DAYS - 10));
  const receipts = useQuery({ queryKey: ['recentReceipts', receiptsFrom], queryFn: () => fetchRecentReceipts(receiptsFrom), refetchInterval: EVERY });
  const tripsFrom = startOfDay(addDays(today, -UNBILLED_DAYS));
  const tripsTo = startOfDay(addDays(today, 1));
  const trips = useQuery({ queryKey: ['tripList', tripsFrom, tripsTo], queryFn: () => fetchTripList(tripsFrom, tripsTo), refetchInterval: EVERY });

  const long = useMemo(() => longTrips(fleet.data?.active ?? [], now), [fleet.data, now]);
  const missing = useMemo(() => receiptsMissing((receipts.data ?? []).map((r) => receiptFromRow(r, catalog.data ?? [])), today), [receipts.data, catalog.data, today]);
  const unbilled = useMemo(() => (trips.data ? unbilledTrips(mergeTrips(trips.data, catalog.data ?? [])) : []), [trips.data, catalog.data]);
  const old = useMemo(() => {
    const onTrip = new Set((fleet.data?.active ?? []).map((t) => t.driver_id));
    return oldApps(driverPresence(presence.data ?? [], onTrip, now), now);
  }, [presence.data, fleet.data, now]);
  /** The lines beyond papers, services and fuel: each long trip, and one line for each of the other three when there is any. */
  const others = long.length + (missing.length > 0 ? 1 : 0) + (unbilled.length > 0 ? 1 : 0) + (old.length > 0 ? 1 : 0);
  const othersError = fleet.error ?? presence.error ?? receipts.error ?? trips.error;
  const refreshPapers = () => Promise.all([documents.query.refetch(), maintenance.query.refetch(), maintenance.refetchTrips()]);
  const refreshOthers = () => Promise.all([fleet.refetch(), presence.refetch(), receipts.refetch(), trips.refetch()]);
  return {
    documents,
    maintenance,
    tanks,
    low,
    pending,
    papersLoaded,
    papersError,
    refreshPapers,
    long,
    missing,
    unbilled,
    old,
    othersError,
    refreshOthers,
    /** How many, once the papers and the tanks answered (a tank read that failed counts none); null until then. */
    total: papersLoaded && (tanks.rows !== null || tanks.error !== null) ? low.length + pending.length + others : null,
  };
}
