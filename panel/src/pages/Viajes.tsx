import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Icon } from '../components/Icon';
import { Empty, ErrorNote, PageHead, Pill, RefreshButton, Skeleton } from '../components/ui';
import { useNow, useTripList } from '../data/hooks';
import type { ListFormat } from '../exports/trips';
import { ago, dayInZone, formatDay, formatDayTime } from '../lib/dates';
import { count, number } from '../lib/format';
import { routeText, sourceLabel, truckOf } from '../lib/tripTable';
import { countByStatus, filterTrips, knownValues, type PeriodKind, periodRange, periodToIso, type StatusFilter, type Trip } from '../lib/trips';
import { STATUS_TONE } from './states';

// The filters live in the address (?periodo=mes&estado=pendientes…): going back from a trip, reloading or sharing the
// link keeps them.
const PERIODS: { value: string; kind: PeriodKind; label: string }[] = [
  { value: '30', kind: '30', label: 'Últimos 30 días' },
  { value: 'mes', kind: 'month', label: 'Este mes' },
  { value: 'mes-anterior', kind: 'prev-month', label: 'Mes anterior' },
  { value: '90', kind: '90', label: 'Últimos 90 días' },
  { value: 'fechas', kind: 'custom', label: 'Elegir fechas…' },
];

const TABS: { value: string; status: StatusFilter | 'bin'; label: string }[] = [
  { value: 'todos', status: 'all', label: 'Todos' },
  { value: 'pendientes', status: 'pending', label: 'Pendientes' },
  { value: 'en-curso', status: 'running', label: 'En curso' },
  { value: 'completos', status: 'complete', label: 'Completos' },
  { value: 'eliminados', status: 'bin', label: 'Eliminados' },
];

function TripRow({ trip }: { trip: Trip }) {
  const { model, plate } = truckOf(trip);
  const route = routeText(trip) || 'Origen y destino por completar';
  const sub = [trip.client, trip.product].filter(Boolean).join(' · ') || 'Cliente y producto por completar';
  const [km, kmKind] = trip.billableKm !== null ? [`${number(trip.billableKm, 0)} km`, 'facturables'] : trip.gpsKm !== null ? [`${number(trip.gpsKm, 1)} km`, 'GPS'] : ['—', ''];
  return (
    <li>
      <Link className="trip-row" to={`/viajes/${trip.key}`}>
        <span className="tr-date">
          <strong>{formatDayTime(trip.departureAt ? Date.parse(trip.departureAt) : null) || 'Sin fecha'}</strong>
          <small>{[sourceLabel(trip), trip.orderNumber ? `Orden ${trip.orderNumber}` : null].filter(Boolean).join(' · ')}</small>
          {/* On narrow screens the truck column is hidden and its plate and driver go here. */}
          <small className="tr-truck-narrow">{[plate || model || 'Sin camión', trip.driverName].filter(Boolean).join(' · ')}</small>
        </span>
        <span className="tr-truck">
          <strong>{plate || model || 'Sin camión'}</strong>
          <small>{[plate ? model : null, trip.driverName ?? 'Chofer sin indicar'].filter(Boolean).join(' · ')}</small>
        </span>
        <span className="tr-route">
          <strong>{route}</strong>
          <small>{sub}</small>
        </span>
        <span className="tr-km">
          <strong>{km}</strong>
          <small>{kmKind}</small>
        </span>
        <span className="tr-status">
          <Pill tone={STATUS_TONE[trip.status.code]}>{trip.status.label}</Pill>
          {!trip.deleted && trip.status.missing.length > 0 && <small>Falta: {trip.status.missing.join(', ')}</small>}
        </span>
      </Link>
    </li>
  );
}

export function Viajes() {
  const now = useNow(30_000);
  const today = dayInZone(now);
  const [params, setParams] = useSearchParams();
  const [exporting, setExporting] = useState<ListFormat | null>(null);
  const [exportFailed, setExportFailed] = useState(false);

  const period = PERIODS.find((p) => p.value === params.get('periodo')) ?? PERIODS[0]!;
  const range = period.kind === 'custom' ? { from: params.get('desde') ?? today, to: params.get('hasta') ?? today } : periodRange(period.kind, today);
  const instants = periodToIso(range.from, range.to);
  const tab = TABS.find((t) => t.value === params.get('estado')) ?? TABS[0]!;
  // The search box keeps its own text: the address follows it, so typing is never slowed down or undone by it.
  const [q, setQ] = useState(() => params.get('buscar') ?? '');
  const vehicle = params.get('camion') ?? '';
  const driver = params.get('chofer') ?? '';

  const { trips, query } = useTripList(instants?.fromIso ?? null, instants?.toIso ?? null);
  const counts = useMemo(() => countByStatus(trips), [trips]);
  const known = useMemo(() => knownValues(trips), [trips]);
  const shown = useMemo(
    () => filterTrips(trips, { q, vehicle, driver, status: tab.status === 'bin' ? 'all' : tab.status, bin: tab.status === 'bin' }),
    [trips, q, vehicle, driver, tab.status],
  );

  // The router updates the address in the background: changes made before it does (a tab, then the search right after)
  // build on each other instead of on the address of the last screen.
  const pending = useRef<URLSearchParams | null>(null);
  useEffect(() => {
    pending.current = null;
  }, [params]);
  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(pending.current ?? params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    pending.current = next;
    setParams(next, { replace: true });
  };

  const choosePeriod = (value: string) => {
    if (value === 'fechas') set({ periodo: value, desde: range.from, hasta: range.to });
    else set({ periodo: value === '30' ? null : value, desde: null, hasta: null });
  };

  const exportList = async (format: ListFormat) => {
    setExporting(format);
    setExportFailed(false);
    try {
      const { downloadTrips } = await import('../exports/trips');
      const what = [tab.status === 'all' ? null : tab.label, vehicle ? `Camión ${vehicle}` : null, driver ? `Chofer ${driver}` : null, q ? `Búsqueda «${q}»` : null].filter(Boolean).join(' · ');
      await downloadTrips(format, shown, {
        title: `Viajes del ${formatDay(range.from)} al ${formatDay(range.to)}`,
        subtitle: what || 'Todos los viajes del período',
        fileBase: `viajes_${range.from}_a_${range.to}`,
      });
    } catch (e) {
      console.error(e);
      setExportFailed(true);
    } finally {
      setExporting(null);
    }
  };

  const exportButton = (format: ListFormat, label: string) => (
    <button type="button" className={`btn btn-quiet${exporting === format ? ' is-busy' : ''}`} disabled={exporting !== null || shown.length === 0} onClick={() => void exportList(format)}>
      <Icon name="doc" size={18} />
      <span className="btn-text">{label}</span>
    </button>
  );

  const loadedAt = query.dataUpdatedAt || null;
  const tabCount = (status: StatusFilter | 'bin') => (status === 'bin' ? counts.deleted : counts[status]);

  return (
    <div className="page">
      <PageHead
        title="Viajes"
        subtitle="Los viajes de la app aparecen solos, con lo que completó la oficina; también los cargados a mano en el panel."
        actions={
          <div className="export-group" role="group" aria-label="Exportar la lista">
            <span className="export-label">Exportar</span>
            {exportButton('xlsx', 'Excel')}
            {exportButton('pdf', 'PDF')}
            {exportButton('docx', 'Word')}
          </div>
        }
      />
      {exportFailed && <ErrorNote>No se pudo armar el archivo. Probá de nuevo.</ErrorNote>}

      <section className="card filters" aria-label="Filtros">
        <label className="field">
          <span>Período</span>
          <select value={period.value} onChange={(e) => choosePeriod(e.target.value)}>
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {period.kind === 'custom' && (
          <>
            <label className="field">
              <span>Desde</span>
              <input type="date" value={range.from} max={range.to} onChange={(e) => set({ desde: e.target.value })} />
            </label>
            <label className="field">
              <span>Hasta</span>
              <input type="date" value={range.to} min={range.from} onChange={(e) => set({ hasta: e.target.value })} />
            </label>
          </>
        )}
        <label className="field field-wide">
          <span>Buscar</span>
          <input
            type="search"
            placeholder="Orden, cliente, lugar, chofer…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              set({ buscar: e.target.value });
            }}
          />
        </label>
        <label className="field">
          <span>Camión</span>
          <select value={known.vehicles.includes(vehicle) ? vehicle : ''} onChange={(e) => set({ camion: e.target.value })}>
            <option value="">Todos los camiones</option>
            {known.vehicles.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Chofer</span>
          <select value={known.drivers.includes(driver) ? driver : ''} onChange={(e) => set({ chofer: e.target.value })}>
            <option value="">Todos los choferes</option>
            {known.drivers.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="list-bar">
        <div className="chips" role="group" aria-label="Estado de los viajes">
          {TABS.map((t) => (
            <button key={t.value} type="button" className={`chip${tab.value === t.value ? ' is-on' : ''}`} aria-pressed={tab.value === t.value} onClick={() => set({ estado: t.value === 'todos' ? null : t.value })}>
              {t.label} <span>{count(tabCount(t.status))}</span>
            </button>
          ))}
        </div>
        <div className="list-info">
          {loadedAt !== null && (
            <span className="updated">
              {count(shown.length)} de {count(tab.status === 'bin' ? counts.deleted : counts.all)} · actualizado {ago(loadedAt, now)}
            </span>
          )}
          <RefreshButton onClick={() => void query.refetch()} busy={query.isFetching} />
        </div>
      </div>

      {instants === null ? (
        <ErrorNote>Revisá las fechas: «hasta» no puede ser antes de «desde».</ErrorNote>
      ) : query.error ? (
        <ErrorNote onRetry={() => void query.refetch()}>No se pudieron leer los viajes.</ErrorNote>
      ) : query.isLoading ? (
        <div className="card card-body">
          <Skeleton lines={6} />
        </div>
      ) : shown.length === 0 ? (
        <div className="card">
          <Empty icon="route" title={tab.status === 'bin' ? 'No hay viajes eliminados en este período' : trips.length > 0 ? 'Ningún viaje coincide con el filtro' : 'No hay viajes en este período'}>
            {trips.length > 0 && tab.status !== 'bin' ? 'Probá con otro estado, camión, chofer o búsqueda.' : null}
          </Empty>
        </div>
      ) : (
        <ul className="card trip-rows" aria-label="Viajes">
          {shown.map((t) => (
            <TripRow key={t.key} trip={t} />
          ))}
        </ul>
      )}
    </div>
  );
}
