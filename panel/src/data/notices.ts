// What needs attention: trucks low on fuel, and papers and services expired or close. Inicio lists it and the bell of
// the top bar counts it, from the same reads.
import { useMemo } from 'react';
import { type Alert, alerts } from '../lib/papers';
import { useDocuments, useMaintenance } from './hooks';
import { lowTanks, useTanks } from './tanks';

export function useNotices(today: string) {
  const documents = useDocuments();
  const maintenance = useMaintenance();
  const tanks = useTanks();
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
  const refreshPapers = () => Promise.all([documents.query.refetch(), maintenance.query.refetch(), maintenance.refetchTrips()]);
  return {
    documents,
    maintenance,
    tanks,
    low,
    pending,
    papersLoaded,
    papersError,
    refreshPapers,
    /** How many, once the papers and the tanks answered (a tank read that failed counts none); null until then. */
    total: papersLoaded && (tanks.rows !== null || tanks.error !== null) ? low.length + pending.length : null,
  };
}
