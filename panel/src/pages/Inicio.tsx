import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { usePanelUser } from '../auth/AuthProvider';
import { FleetMap } from '../components/FleetMap';
import { Icon } from '../components/Icon';
import { Card, Dot, Empty, ErrorNote, PageHead, Pill, RefreshButton, Skeleton, StaleNote, Stat } from '../components/ui';
import type { TripRow } from '../data/api';
import { useCatalog, useFleet, useNow, usePapers, useTrips } from '../data/hooks';
import { addDays, ago, dayInZone, firstOfMonth, firstOfNextMonth, formatTime, greeting, longDate, startOfDay } from '../lib/dates';
import { type CatalogTruck, canonical, fleetCounts, truckParts } from '../lib/fleet';
import { count, km, percent } from '../lib/format';
import { monthTotals } from '../lib/month';
import { type Alert, alerts } from '../lib/papers';

function TripLine({ trip, catalog }: { trip: TripRow; catalog: readonly CatalogTruck[] }) {
  const { model, plate } = truckParts(canonical(trip.vehicle, catalog) ?? '');
  const status = trip.active ? (trip.paused ? <Pill tone="amber">Pausado</Pill> : <Pill tone="blue">En curso</Pill>) : <Pill tone="green">Finalizado</Pill>;
  const content = (
    <>
      <span className="trip-time">{formatTime(Date.parse(trip.started_at))}</span>
      <span className="trip-main">
        <strong>{plate || model || 'Sin camión'}</strong>
        <span>{[plate ? model : '', trip.driver_name].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="trip-km">
        {km(trip.distance_meters)}
        <small>{trip.load_type === 'empty' ? 'Sin carga' : 'Con carga'}</small>
      </span>
      {status}
    </>
  );
  return (
    <li>
      {trip.active ? (
        <Link className="trip-line" to={`/gps?camion=${encodeURIComponent('trip:' + trip.id)}`} title="Ver en el GPS en vivo">
          {content}
        </Link>
      ) : (
        <div className="trip-line">{content}</div>
      )}
    </li>
  );
}

function AlertLine({ alert }: { alert: Alert }) {
  const late = alert.state === 'late';
  return (
    <li className="alert-line">
      <span className={`alert-icon tone-${late ? 'red' : 'amber'}`}>
        <Icon name={alert.type === 'paper' ? 'doc' : 'wrench'} size={18} />
      </span>
      <span className="alert-main">
        <strong>{[alert.kind, alert.owner].filter(Boolean).join(' · ')}</strong>
        <span>{alert.detail}</span>
      </span>
      <Pill tone={late ? 'red' : 'amber'}>{late ? 'Vencido' : alert.type === 'paper' ? 'Por vencer' : 'Próximo'}</Pill>
    </li>
  );
}

export function Inicio() {
  const { user } = usePanelUser();
  const navigate = useNavigate();
  const now = useNow(15_000);
  const today = dayInZone(now);
  const fleet = useFleet(now);
  const catalog = useCatalog();
  const todays = useTrips(startOfDay(today), startOfDay(addDays(today, 1)), 60_000);
  const month = useTrips(startOfDay(firstOfMonth(today)), startOfDay(firstOfNextMonth(today)));
  const papers = usePapers();

  const counts = fleetCounts(fleet.units);
  const pending = useMemo(() => (papers.data ? alerts(papers.data.papers, papers.data.services, today) : []), [papers.data, today]);
  const totals = useMemo(() => (month.data ? monthTotals(month.data, catalog.data ?? []) : null), [month.data, catalog.data]);
  const running = todays.data?.filter((t) => t.active).length ?? 0;
  const refreshing = fleet.isFetching || todays.isFetching || papers.isFetching;
  const refresh = () => void Promise.all([fleet.refetch(), todays.refetch(), month.refetch(), papers.refetch()]);
  const firstName = user.name.split(' ')[0] ?? user.name;

  return (
    <div className="page">
      <PageHead
        title={`${greeting(now)}, ${firstName}`}
        subtitle={<span className="cap">{longDate(now)}</span>}
        actions={
          <>
            {fleet.fetchedAt && <span className="updated">Actualizado {ago(fleet.fetchedAt, now)}</span>}
            <RefreshButton onClick={refresh} busy={refreshing} />
          </>
        }
      />

      {fleet.error ? <ErrorNote onRetry={() => void fleet.refetch()}>No se pudo leer la flota.</ErrorNote> : null}

      <div className="stats">
        <Stat tone="green" icon="truck" label="En ruta" value={fleet.isLoading ? '…' : count(counts.moving)} />
        <Stat tone="amber" icon="pause" label="Detenidos" value={fleet.isLoading ? '…' : count(counts.halted)} detail={counts.noSignal > 0 ? `${counts.noSignal} sin señal` : undefined} />
        <Stat tone="grey" icon="clock" label="Sin viaje" value={fleet.isLoading ? '…' : count(counts.idle)} />
        <Stat tone="blue" icon="route" label="Viajes hoy" value={todays.isLoading ? '…' : count(todays.data?.length ?? 0)} detail={running > 0 ? `${running} en curso` : undefined} />
      </div>

      <div className="grid-2">
        <Card
          title="La flota ahora"
          padded={false}
          action={
            <Link className="link" to="/gps">
              Abrir el GPS en vivo <Icon name="chevron" size={16} />
            </Link>
          }
        >
          <FleetMap units={fleet.units} onSelect={(key) => navigate(`/gps?camion=${encodeURIComponent(key)}`)} label="Mapa con la posición de cada camión" className="map-home" />
          <div className="legend">
            <span><Dot tone="green" /> En ruta</span>
            <span><Dot tone="amber" /> Detenido, pausado o sin señal</span>
            <span><Dot tone="grey" /> Sin viaje (donde terminó el último)</span>
          </div>
        </Card>

        <Card title="Para tener en cuenta">
          {papers.error && papers.data !== undefined && <StaleNote onRetry={() => void papers.refetch()} />}
          {papers.error && papers.data === undefined ? (
            <ErrorNote onRetry={() => void papers.refetch()} />
          ) : papers.isLoading ? (
            <Skeleton />
          ) : pending.length === 0 ? (
            <Empty icon="check" title="Todo en orden">
              No hay papeles vencidos ni por vencer en 30 días, ni services atrasados o en los próximos 15 días.
            </Empty>
          ) : (
            <ul className="alert-list">
              {pending.slice(0, 6).map((a) => (
                <AlertLine key={a.id} alert={a} />
              ))}
              {pending.length > 6 && <li className="more">Y {pending.length - 6} más.</li>}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Viajes de hoy">
          {todays.error && todays.data !== undefined && <StaleNote onRetry={() => void todays.refetch()} />}
          {todays.error && todays.data === undefined ? (
            <ErrorNote onRetry={() => void todays.refetch()} />
          ) : todays.isLoading ? (
            <Skeleton />
          ) : (todays.data ?? []).length === 0 ? (
            <Empty icon="route" title="Todavía no hay viajes hoy">
              Los viajes aparecen acá apenas un chofer los inicia en la app.
            </Empty>
          ) : (
            <ul className="trip-list">
              {(todays.data ?? []).map((t) => (
                <TripLine key={t.id} trip={t} catalog={catalog.data ?? []} />
              ))}
            </ul>
          )}
        </Card>

        <Card title={<span className="cap">{new Intl.DateTimeFormat('es-UY', { month: 'long', timeZone: 'America/Montevideo' }).format(now)}</span>}>
          {month.error && month.data !== undefined && <StaleNote onRetry={() => void month.refetch()} />}
          {month.error && month.data === undefined ? (
            <ErrorNote onRetry={() => void month.refetch()} />
          ) : !totals ? (
            <Skeleton />
          ) : (
            <>
              <dl className="facts">
                <div><dt>Viajes</dt><dd>{count(totals.trips)}</dd></div>
                <div><dt>Kilómetros GPS</dt><dd>{km(totals.meters)}</dd></div>
                <div><dt>Con carga</dt><dd>{totals.loadedShare === null ? '—' : percent(totals.loadedShare)}</dd></div>
                <div><dt>Camiones con viajes</dt><dd>{count(totals.trucks)}</dd></div>
              </dl>
              <p className="note">Viajes registrados con la app, sin los eliminados en el panel. El rendimiento por camión y por chofer llega con Métricas.</p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
