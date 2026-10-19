import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { FleetMap } from '../components/FleetMap';
import { Icon } from '../components/Icon';
import { Dot, Empty, ErrorNote, PageHead, Pill, RefreshButton, Skeleton, StaleNote } from '../components/ui';
import { LIVE_REFRESH_MS } from '../config';
import { useFleet, useNow, useRoute } from '../data/hooks';
import { ago, dayInZone, formatDay, formatTime } from '../lib/dates';
import { type FleetUnit, fleetCounts, STATE_LABEL, unitTitle } from '../lib/fleet';
import { count, km, kmh } from '../lib/format';
import { drawable } from '../lib/route';
import { STATE_TONE } from './states';

type Filter = 'all' | 'moving' | 'halted' | 'idle';

const matches = (u: FleetUnit, f: Filter) =>
  f === 'all' || (f === 'moving' && u.state === 'moving') || (f === 'idle' && u.state === 'idle') || (f === 'halted' && (u.state === 'stopped' || u.state === 'paused' || u.state === 'nosignal'));

function when(ms: number, now: number): string {
  const day = dayInZone(ms);
  return day === dayInZone(now) ? formatTime(ms) : `${formatDay(day)} ${formatTime(ms)}`;
}

/** points: null while the route loads, 'error' when it could not be read; stale: a refresh of the route failed. */
function Detail({ unit, now, points, stale, onRetry, onClose }: { unit: FleetUnit; now: number; points: number | null | 'error'; stale: boolean; onRetry: () => void; onClose: () => void }) {
  const trip = unit.trip;
  return (
    <section className="unit-detail" aria-label={`Detalle de ${unitTitle(unit)}`}>
      <header>
        <div>
          <h2>{unitTitle(unit)}</h2>
          <p>{unit.driver || 'Sin chofer'}</p>
        </div>
        <button type="button" className="btn btn-icon" aria-label="Cerrar el detalle" onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
      </header>
      <Pill tone={STATE_TONE[unit.state]}>{STATE_LABEL[unit.state]}</Pill>
      <dl className="facts facts-tight">
        {trip ? (
          <>
            <div><dt>Velocidad</dt><dd>{kmh(unit.speedKmh)}</dd></div>
            <div><dt>Recorrido del viaje</dt><dd>{km(unit.meters)}</dd></div>
            <div><dt>Salió</dt><dd>{when(Date.parse(trip.started_at), now)}</dd></div>
            <div><dt>Última posición</dt><dd>{unit.at ? ago(unit.at, now) : 'Todavía ninguna'}</dd></div>
            <div><dt>Carga</dt><dd>{trip.load_type === 'empty' ? 'Sin carga' : 'Con carga'}</dd></div>
            <div><dt>Puntos del recorrido</dt><dd>{points === 'error' ? 'No se pudieron leer' : points === null ? '…' : count(points)}</dd></div>
          </>
        ) : (
          <>
            <div><dt>Último viaje</dt><dd>{unit.at ? `Terminó ${ago(unit.at, now)}` : 'Sin viajes registrados'}</dd></div>
            <div><dt>Posición</dt><dd>{unit.lat !== null ? 'Donde terminó el último viaje' : 'Sin posición conocida'}</dd></div>
          </>
        )}
      </dl>
      {stale && <StaleNote onRetry={onRetry}>No se pudo actualizar el recorrido: se ve el último que se leyó.</StaleNote>}
    </section>
  );
}

export function Gps() {
  const now = useNow(5_000);
  const fleet = useFleet(now);
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('all');
  const [fitToken, setFitToken] = useState(0);
  const selected = params.get('camion');
  const unit = fleet.units.find((u) => u.key === selected) ?? null;
  const route = useRoute(unit?.trip ?? null);
  const counts = fleetCounts(fleet.units);
  const shown = fleet.units.filter((u) => matches(u, filter));

  const choose = (key: string | null) => setParams(key && key !== selected ? { camion: key } : {}, { replace: true });
  const filters: { value: Filter; label: string; n: number }[] = [
    { value: 'all', label: 'Todos', n: fleet.units.length },
    { value: 'moving', label: 'En ruta', n: counts.moving },
    { value: 'halted', label: 'Detenidos', n: counts.halted },
    { value: 'idle', label: 'Sin viaje', n: counts.idle },
  ];

  return (
    <div className="page page-gps">
      <PageHead
        title="GPS en vivo"
        subtitle={fleet.fetchedAt ? `Actualizado ${ago(fleet.fetchedAt, now)} · las posiciones se actualizan solas cada ${LIVE_REFRESH_MS / 1000} segundos` : 'Buscando las posiciones…'}
        actions={<RefreshButton onClick={() => void Promise.all([fleet.refetch(), unit?.trip ? route.refetch() : null])} busy={fleet.isFetching || route.isFetching} />}
      />
      {fleet.error ? <ErrorNote onRetry={() => void fleet.refetch()}>No se pudo leer la flota.</ErrorNote> : null}
      <div className="gps">
        <aside className="card gps-side" aria-label="Camiones">
          <div className="chips" role="group" aria-label="Filtrar camiones">
            {filters.map((f) => (
              <button key={f.value} type="button" className={`chip${filter === f.value ? ' is-on' : ''}`} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
                {f.label} <span>{f.n}</span>
              </button>
            ))}
          </div>
          {unit && (
            <Detail
              unit={unit}
              now={now}
              points={unit.trip ? (route.data ? drawable(route.data).length : route.error ? 'error' : null) : null}
              stale={Boolean(unit.trip && route.error && route.data)}
              onRetry={() => void route.refetch()}
              onClose={() => choose(null)}
            />
          )}
          {fleet.isLoading ? (
            <Skeleton lines={5} />
          ) : shown.length === 0 ? (
            <Empty icon="truck" title={fleet.units.length === 0 ? 'Sin camiones cargados' : 'Ningún camión en este grupo'}>
              {fleet.units.length === 0 ? 'Los camiones del catálogo y los viajes en curso aparecen acá.' : null}
            </Empty>
          ) : (
            <ul className="units">
              {shown.map((u) => (
                <li key={u.key}>
                  <button type="button" className={`unit${u.key === selected ? ' is-selected' : ''}`} onClick={() => choose(u.key)} aria-pressed={u.key === selected}>
                    <Dot tone={STATE_TONE[u.state]} />
                    <span className="unit-main">
                      <strong>{unitTitle(u)}</strong>
                      <span>{[u.driver, STATE_LABEL[u.state], u.at ? ago(u.at, now) : null, u.lat === null ? 'sin posición' : null].filter(Boolean).join(' · ')}</span>
                    </span>
                    {u.trip && (
                      <span className="unit-side">
                        <strong>{kmh(u.speedKmh)}</strong>
                        <span>{km(u.meters)}</span>
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <div className="card gps-map">
          <FleetMap units={fleet.units} selected={selected} onSelect={(key) => choose(key)} route={unit?.trip ? (route.data ?? null) : null} fitToken={fitToken} label="Mapa de la flota en vivo" className="map-live" />
          <button
            type="button"
            className="btn map-fit"
            onClick={() => {
              choose(null);
              setFitToken((t) => t + 1);
            }}
          >
            <Icon name="expand" size={17} /> Ver todos
          </button>
        </div>
      </div>
    </div>
  );
}
