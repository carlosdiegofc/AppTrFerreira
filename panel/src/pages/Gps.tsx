import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { FleetMap, type PersonMark } from '../components/FleetMap';
import { Icon } from '../components/Icon';
import { Dot, Empty, ErrorNote, PageHead, Pill, RefreshButton, Skeleton, StaleNote, type Tone } from '../components/ui';
import { LIVE_REFRESH_MS } from '../config';
import { useFleet, useNow, usePresence, useRoute } from '../data/hooks';
import { ago, dayInZone, formatDay, formatTime } from '../lib/dates';
import { type FleetUnit, fleetCounts, STATE_LABEL, unitTitle } from '../lib/fleet';
import { count, km, kmh } from '../lib/format';
import { type DriverPresence, driverPresence, PRESENCE_LABEL, type PresenceState } from '../lib/presence';
import { drawable } from '../lib/route';
import { STATE_TONE } from './states';
import { PointEditor, TruckRoad, type RoadView } from '../components/RoadControls';
import { useRoadPoints, useRoadWrite } from '../data/road';
import { POINT_LABEL, pointTitle, type RoadPoint, type PointKind, sortedPoints } from '../lib/road';
import { ConfirmDialog } from '../components/ConfirmDialog';

type Filter = 'all' | 'moving' | 'halted' | 'idle';

const matches = (u: FleetUnit, f: Filter) =>
  f === 'all' ||
  (f === 'moving' && u.state === 'moving') ||
  (f === 'idle' && u.state === 'idle') ||
  (f === 'halted' && (u.state === 'stopped' || u.state === 'paused' || u.state === 'nosignal'));

function when(ms: number, now: number): string {
  const day = dayInZone(ms);
  return day === dayInZone(now) ? formatTime(ms) : `${formatDay(day)} ${formatTime(ms)}`;
}

/** points: null while the route loads, 'error' when it could not be read; stale: a refresh of the route failed. */
function Detail({
  unit,
  now,
  points,
  stale,
  onRetry,
  onClose,
}: {
  unit: FleetUnit;
  now: number;
  points: number | null | 'error';
  stale: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
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
            <div>
              <dt>Velocidad</dt>
              <dd>{kmh(unit.speedKmh)}</dd>
            </div>
            <div>
              <dt>Recorrido del viaje</dt>
              <dd>{km(unit.meters)}</dd>
            </div>
            <div>
              <dt>Salió</dt>
              <dd>{when(Date.parse(trip.started_at), now)}</dd>
            </div>
            <div>
              <dt>Última posición</dt>
              <dd>{unit.at ? ago(unit.at, now) : 'Todavía ninguna'}</dd>
            </div>
            <div>
              <dt>Carga</dt>
              <dd>{trip.load_type === 'empty' ? 'Sin carga' : 'Con carga'}</dd>
            </div>
            <div>
              <dt>Puntos del recorrido</dt>
              <dd>{points === 'error' ? 'No se pudieron leer' : points === null ? '…' : count(points)}</dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt>Último viaje</dt>
              <dd>{unit.at ? `Terminó ${ago(unit.at, now)}` : 'Sin viajes registrados'}</dd>
            </div>
            <div>
              <dt>Posición</dt>
              <dd>{unit.lat !== null ? 'Donde terminó el último viaje' : 'Sin posición conocida'}</dd>
            </div>
          </>
        )}
      </dl>
      {stale && <StaleNote onRetry={onRetry}>No se pudo actualizar el recorrido: se ve el último que se leyó.</StaleNote>}
    </section>
  );
}

/** On a trip blue, active with the app open green, not seen for a while grey. */
const PRESENCE_TONE: Record<PresenceState, Tone> = { trip: 'blue', active: 'green', seen: 'grey' };

const version = (p: DriverPresence) => `app ${p.version}${p.newer ? ` (hay una más nueva: ${p.newer})` : ''}`;

/** What the list says of each driver: on a trip, active and since when, or when the app was last open. */
function presenceLine(p: DriverPresence, now: number): string {
  if (p.state === 'trip') return ['En viaje', version(p)].join(' · ');
  if (p.state === 'active')
    return [`Activo ${ago(p.seenAt, now)}`, 'sin viaje', p.place ? null : 'sin posición', version(p)].filter(Boolean).join(' · ');
  return [`Abrió la app ${ago(p.seenAt, now)}`, version(p)].join(' · ');
}

function PersonDetail({ person, now, onClose }: { person: DriverPresence; now: number; onClose: () => void }) {
  return (
    <section className="unit-detail" aria-label={`Detalle de ${person.name}`}>
      <header>
        <div>
          <h2>{person.name}</h2>
          <p>{person.vehicle ?? 'Sin camión guardado en el teléfono'}</p>
        </div>
        <button type="button" className="btn btn-icon" aria-label="Cerrar el detalle" onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
      </header>
      <Pill tone={PRESENCE_TONE[person.state]}>{person.state === 'active' ? 'Activo, sin viaje' : PRESENCE_LABEL[person.state]}</Pill>
      <dl className="facts facts-tight">
        <div>
          <dt>Con la app abierta</dt>
          <dd>{ago(person.seenAt, now)}</dd>
        </div>
        <div>
          <dt>Posición del teléfono</dt>
          <dd>
            {person.place
              ? `${ago(person.place.at, now)}${person.place.accuracy !== null ? ` · ±${Math.round(person.place.accuracy)} m` : ''}`
              : 'Sin posición'}
          </dd>
        </div>
        <div>
          <dt>Versión de la app</dt>
          <dd>
            {person.version}
            {person.newer ? ` (hay una más nueva: ${person.newer})` : ''}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function Gps() {
  const now = useNow(5_000);
  const fleet = useFleet(now);
  const presence = usePresence();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('all');
  const [fitToken, setFitToken] = useState(0);
  const [view, setView] = useState<RoadView>('live');
  // The map's card goes over the whole screen with it, «Ver todos» included.
  const mapCard = useRef<HTMLDivElement>(null);
  const [kinds, setKinds] = useState<PointKind[]>(['toll', 'scale', 'radar']);
  const [newKind, setNewKind] = useState<PointKind>('toll');
  const [picking, setPicking] = useState(false);
  const [archivePoint, setArchivePoint] = useState<RoadPoint | null>(null);
  const [focusPoint, setFocusPoint] = useState<RoadPoint | null>(null);
  const [pointEditor, setPointEditor] = useState<{
    point?: RoadPoint;
    kind: PointKind;
    location: { latitude: number; longitude: number };
  } | null>(null);
  const road = useRoadPoints(),
    roadWrite = useRoadWrite();
  const visiblePoints = useMemo(
    () => sortedPoints((road.data ?? []).filter((p) => (view === 'places' ? p.kind === 'place' : view === 'controls' && kinds.includes(p.kind)))),
    [road.data, view, kinds],
  );
  const chofer = params.get('chofer');
  const selected = params.get('camion') ?? (chofer ? `driver:${chofer}` : null);
  const unit = fleet.units.find((u) => u.key === selected) ?? null;
  const route = useRoute(unit?.trip ?? null);
  const counts = fleetCounts(fleet.units);
  const shown = fleet.units.filter((u) => matches(u, filter));
  const onTrip = useMemo(() => new Set(fleet.units.flatMap((u) => (u.trip ? [u.trip.driver_id] : []))), [fleet.units]);
  const drivers = useMemo(() => (presence.data ? driverPresence(presence.data, onTrip, now) : []), [presence.data, onTrip, now]);
  const people = useMemo(
    () =>
      drivers.flatMap((d): PersonMark[] =>
        d.place ? [{ key: `driver:${d.driverId}`, name: d.name, lat: d.place.lat, lng: d.place.lng }] : [],
      ),
    [drivers],
  );
  const person = drivers.find((d) => `driver:${d.driverId}` === selected) ?? null;

  const choose = (key: string | null) => {
    if (!key || key === selected) setParams({}, { replace: true });
    else if (key.startsWith('driver:')) setParams({ chofer: key.slice('driver:'.length) }, { replace: true });
    else setParams({ camion: key }, { replace: true });
  };
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
        subtitle={
          fleet.fetchedAt
            ? `Actualizado ${ago(fleet.fetchedAt, now)} · las posiciones se actualizan solas cada ${LIVE_REFRESH_MS / 1000} segundos`
            : 'Buscando las posiciones…'
        }
        actions={
          <RefreshButton
            onClick={() => void Promise.all([fleet.refetch(), unit?.trip ? route.refetch() : null, presence.refetch()])}
            busy={fleet.isFetching || route.isFetching}
          />
        }
      />
      {fleet.error ? <ErrorNote onRetry={() => void fleet.refetch()}>No se pudo leer la flota.</ErrorNote> : null}
      <div className="gps">
        <aside className="card gps-side" aria-label="Camiones y choferes">
          <nav className="road-nav" aria-label="Vistas del mapa">
            {(
              [
                ['live', 'Seguimiento'],
                ['controls', 'Peajes, balanzas y radares'],
                ['places', 'Mis puntos'],
              ] as const
            ).map(([value, label]) => (
              <button
                type="button"
                className={`chip${view === value ? ' is-on' : ''}`}
                key={value}
                aria-pressed={view === value}
                onClick={() => {
                  setView(value);
                  setPicking(false);
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          {view !== 'live' && (
            <section className="road-controls" aria-label="Puntos del mapa">
              {road.error ? (
                <ErrorNote onRetry={() => void road.refetch()}>
                  El control de ruta no está disponible en este momento. Volvé a intentar más tarde.
                </ErrorNote>
              ) : null}
              {view === 'controls' && (
                <div className="chips">
                  {(['toll', 'scale', 'radar'] as const).map((kind) => (
                    <button
                      className={`chip${kinds.includes(kind) ? ' is-on' : ''}`}
                      aria-pressed={kinds.includes(kind)}
                      key={kind}
                      onClick={() => setKinds((old) => (old.includes(kind) ? old.filter((k) => k !== kind) : [...old, kind]))}
                    >
                      {POINT_LABEL[kind]}
                    </button>
                  ))}
                </div>
              )}
              <div className="road-actions">
                {view === 'controls' && (
                  <label>
                    Tipo{' '}
                    <select value={newKind} onChange={(e) => setNewKind(e.target.value as PointKind)}>
                      {(['toll', 'scale', 'radar'] as const).map((k) => (
                        <option key={k} value={k}>
                          {POINT_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button className="btn" disabled={!!road.error || !road.data} onClick={() => setPicking(!picking)}>
                  {picking ? 'Cancelar selección' : 'Agregar en el mapa'}
                </button>
                <button
                  className="btn"
                  disabled={!!road.error || !road.data}
                  onClick={() => setPointEditor({ kind: view === 'places' ? 'place' : newKind, location: { latitude: 0, longitude: 0 } })}
                >
                  Ingresar coordenadas
                </button>
              </div>
              {picking && <p role="status">Tocá la ubicación en el mapa para agregar el punto.</p>}
              {!road.isLoading && !road.error && visiblePoints.length === 0 && <p>No hay puntos en esta vista.</p>}
              {visiblePoints.map((p) => (
                <div className="road-point" key={p.id}>
                  <button className="btn btn-quiet" onClick={() => setFocusPoint(p)}>
                    {pointTitle(p)}
                  </button>
                  <p>{p.notes}</p>
                  <div className="road-actions">
                    <button className="btn" onClick={() => setPointEditor({ point: p, kind: p.kind, location: p })}>
                      Editar
                    </button>
                    <button className="btn" disabled={roadWrite.isPending} onClick={() => setArchivePoint(p)}>
                      Archivar
                    </button>
                  </div>
                </div>
              ))}
              {roadWrite.error && <p role="alert">No se pudo archivar. Actualizá los puntos y volvé a intentar.</p>}
            </section>
          )}
          <div className="chips" role="group" aria-label="Filtrar camiones">
            {filters.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`chip${filter === f.value ? ' is-on' : ''}`}
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
              >
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
          {person && <PersonDetail person={person} now={now} onClose={() => choose(null)} />}
          {unit && <TruckRoad key={unit.key} unit={unit} points={road.data ?? []} now={now} />}
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
                  <button
                    type="button"
                    className={`unit${u.key === selected ? ' is-selected' : ''}`}
                    onClick={() => choose(u.key)}
                    aria-pressed={u.key === selected}
                  >
                    <Dot tone={STATE_TONE[u.state]} />
                    <span className="unit-main">
                      <strong>{unitTitle(u)}</strong>
                      <span>
                        {[u.driver, STATE_LABEL[u.state], u.at ? ago(u.at, now) : null, u.lat === null ? 'sin posición' : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
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
          <section className="gps-people" aria-label="Choferes con la app">
            <h2>Choferes con la app</h2>
            {presence.error && !presence.data ? (
              <ErrorNote onRetry={() => void presence.refetch()}>No se pudo leer quién tiene la app abierta.</ErrorNote>
            ) : presence.isLoading ? (
              <Skeleton lines={2} />
            ) : drivers.length === 0 ? (
              <p className="muted">Todavía ningún chofer abrió la app nueva.</p>
            ) : (
              <ul className="people">
                {drivers.map((d) => {
                  const key = `driver:${d.driverId}`;
                  const body = (
                    <>
                      <Dot tone={PRESENCE_TONE[d.state]} />
                      <span className="unit-main">
                        <strong>{d.name}</strong>
                        <span>{presenceLine(d, now)}</span>
                      </span>
                    </>
                  );
                  return (
                    <li key={d.driverId}>
                      {d.place ? (
                        <button
                          type="button"
                          className={`unit${key === selected ? ' is-selected' : ''}`}
                          onClick={() => choose(key)}
                          aria-pressed={key === selected}
                        >
                          {body}
                        </button>
                      ) : (
                        <div className="unit unit-static">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {presence.error && presence.data ? (
              <StaleNote onRetry={() => void presence.refetch()}>
                No se pudo actualizar quién tiene la app abierta: se ve lo último que se leyó.
              </StaleNote>
            ) : null}
            <p className="muted gps-people-note">
              Activo es con la app abierta en los últimos 10 minutos; la posición sin viaje es la del teléfono, con la app abierta. Las
              versiones anteriores a la 0.17.0 no avisan.
            </p>
          </section>
        </aside>
        <div ref={mapCard} className="card gps-map">
          <FleetMap
            tools
            fullTarget={mapCard}
            units={fleet.units}
            people={people}
            selected={selected}
            onSelect={(key) => choose(key)}
            route={unit?.trip ? (route.data ?? null) : null}
            fitToken={fitToken}
            label="Mapa de la flota en vivo"
            className="map-live"
            roadPoints={visiblePoints}
            focusPoint={focusPoint}
            onPointSelect={setFocusPoint}
            onPickLocation={
              picking
                ? (location) => {
                    setPicking(false);
                    setPointEditor({ kind: view === 'places' ? 'place' : newKind, location });
                  }
                : undefined
            }
          />
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
      {pointEditor && <PointEditor {...pointEditor} close={() => setPointEditor(null)} />}
      {archivePoint && (
        <ConfirmDialog
          title={`Archivar ${archivePoint.name}`}
          confirmLabel="Archivar"
          busy={roadWrite.isPending}
          onCancel={() => setArchivePoint(null)}
          onConfirm={() =>
            roadWrite.mutate(
              { type: 'point', row: { ...archivePoint, archived: true }, before: archivePoint.updated_at },
              {
                onSuccess: () => {
                  setArchivePoint(null);
                  setFocusPoint(null);
                },
              },
            )
          }
        >
          <p>Se conserva el historial de pasos y movimientos. El punto dejará de detectar nuevos pasos.</p>
          {roadWrite.error && <p role="alert">No se pudo archivar. Cerrá y actualizá los puntos antes de volver a intentar.</p>}
        </ConfirmDialog>
      )}
    </div>
  );
}
