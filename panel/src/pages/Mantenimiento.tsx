import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { ServiceFormDialog } from '../components/ServiceFormDialog';
import { CatalogNote, Empty, ErrorNote, PageHead, Pill, RefreshButton, Skeleton, StaleNote, Stat, type Tone } from '../components/ui';
import { TOO_MANY } from '../data/api';
import { useMaintenance, useNow } from '../data/hooks';
import { addDays, ago, dayInZone, formatDay } from '../lib/dates';
import { truckParts } from '../lib/fleet';
import { count, number } from '../lib/format';
import { filterServices, type Service, type ServiceListView, serviceVehicles, type ServiceView, serviceViews, type TruckKm } from '../lib/maintenance';
import type { ServiceState } from '../lib/papers';
import { useAddressFilters } from './addressFilters';

const VIEWS: { value: ServiceListView; label: string }[] = [
  { value: 'todo', label: 'Por hacer' },
  { value: 'hechos', label: 'Hechos' },
  { value: 'todos', label: 'Todos' },
];

// The words and colours of the app.
export const SERVICE_STATE: Record<ServiceState, { label: string; tone: Tone }> = {
  late: { label: 'Vencido', tone: 'red' },
  soon: { label: 'Próximo', tone: 'amber' },
  planned: { label: 'Programado', tone: 'blue' },
  pending: { label: 'Pendiente', tone: 'grey' },
  done: { label: 'Realizado', tone: 'green' },
};

/** "Ford Cargo 1722 · JKL3456" as plate first, with the model under it. */
const truckTitle = (vehicle: string) => {
  const { model, plate } = truckParts(vehicle);
  return { title: plate || model || 'Sin camión', sub: plate ? model : '' };
};

function TruckKmCard({ vehicle, km, missing, failed, todo, chosen, onPick }: { vehicle: string; km: TruckKm | undefined; missing: boolean; failed: boolean; todo: number; chosen: boolean; onPick: () => void }) {
  const { title, sub } = truckTitle(vehicle);
  return (
    <li>
      <button type="button" className={`km-card${chosen ? ' is-on' : ''}`} aria-pressed={chosen} onClick={onPick} title={chosen ? 'Ver todos los camiones' : 'Ver solo este camión'}>
        <span className="km-truck">
          <strong>{title}</strong>
          {sub && <small>{sub}</small>}
        </span>
        {km ? (
          <>
            <span className="km-value">{`${number(km.estimate)} km`}</span>
            <small>{`${number(km.reference.km)} km anotados el ${formatDay(km.reference.day)} + ${number(km.gpsKm)} km de GPS`}</small>
          </>
        ) : (
          <>
            <span className="km-value km-none">{missing ? (failed ? '—' : '…') : 'Sin kilometraje'}</span>
            <small>{missing ? (failed ? 'No se pudo estimar' : 'Leyendo los viajes') : 'Se estima desde un service hecho con el kilometraje anotado.'}</small>
          </>
        )}
        <small className="km-todo">{todo === 0 ? 'Nada por hacer' : `${count(todo)} por hacer`}</small>
      </button>
    </li>
  );
}

function ServiceRow({ service, showTruck, onOpen }: { service: ServiceView; showTruck: boolean; onOpen: () => void }) {
  const { status } = service;
  const state = SERVICE_STATE[status.state];
  const done = status.state === 'done';
  // When (by date and by kilometres, or when it was done), then how it repeats.
  const lines = [
    [status.byDate, done ? (service.odometerKm === null ? null : `Con ${number(service.odometerKm)} km`) : status.byKm].filter(Boolean).join(' · '),
    [service.intervalKm !== null ? `Cada ${number(service.intervalKm)} km` : null, !done && service.dueKm === null && service.odometerKm !== null ? `Kilometraje anotado: ${number(service.odometerKm)} km` : null].filter(Boolean).join(' · '),
  ].filter(Boolean);
  return (
    <li>
      <button type="button" className="service-row" onClick={onOpen} aria-label={`${service.kind}, ${service.vehicle}: ${state.label}`}>
        <span className={`sv-icon tone-${state.tone}`}>
          <Icon name="wrench" size={18} />
        </span>
        <span className="sv-main">
          <strong>{service.kind || 'Sin tipo'}</strong>
          {showTruck && <small>{service.vehicle || 'Sin camión'}</small>}
          {lines.map((l) => (
            <small key={l} className="sv-detail">
              {l}
            </small>
          ))}
          {service.notes && <small className="sv-notes">{service.notes}</small>}
        </span>
        <Pill tone={state.tone}>{state.label}</Pill>
      </button>
    </li>
  );
}

export function Mantenimiento() {
  const now = useNow(60_000);
  const today = dayInZone(now);
  const { params, set, typed, search } = useAddressFilters();
  const { services, kms, kmMissing, query, trips, catalog } = useMaintenance();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  const view = VIEWS.find((v) => v.value === params.get('vista')) ?? VIEWS[0]!;
  const vehicle = params.get('camion') ?? '';
  const views = useMemo(() => serviceViews(services, kms, today), [services, kms, today]);
  const vehicles = useMemo(() => serviceVehicles(services, catalog.data ?? []), [services, catalog.data]);
  const shown = useMemo(() => filterServices(views, { view: view.value, vehicle, q: typed }), [views, view.value, vehicle, typed]);
  const inTruck = useMemo(() => (vehicle ? views.filter((s) => s.vehicle === vehicle) : views), [views, vehicle]);
  const late = inTruck.filter((s) => s.status.state === 'late').length;
  const soon = inTruck.filter((s) => s.status.state === 'soon').length;
  const todo = inTruck.filter((s) => s.status.state !== 'done').length;
  const recent = inTruck.filter((s) => s.doneOn !== null && s.doneOn >= addDays(today, -30)).length;
  const todoOf = (v: string) => views.filter((s) => s.vehicle === v && s.status.state !== 'done').length;

  const done = (text: string, tone: 'ok' | 'warn' = 'ok') => {
    setAdding(false);
    setEditing(null);
    setNotice({ tone, text });
  };
  const conflict = () => {
    setEditing(null);
    setNotice({ tone: 'warn', text: 'Otra persona cambió o borró ese service mientras lo tenías abierto, y no se guardó nada: ya se ven los datos nuevos. Revisalo y, si hace falta, volvé a cambiarlo.' });
  };

  const loadedAt = query.dataUpdatedAt || null;
  const loading = query.isLoading || catalog.isLoading;
  const ready = !loading && query.data !== undefined;

  return (
    <div className="page">
      <PageHead
        title="Mantenimiento"
        subtitle="Los services de cada camión, con avisos por fecha y por kilómetros. Son los mismos de la app."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)} disabled={!ready}>
            <Icon name="plus" size={18} /> Nuevo service
          </button>
        }
      />
      {notice && (
        <p className={`notice notice-${notice.tone}`} role={notice.tone === 'ok' ? 'status' : 'alert'}>
          <Icon name={notice.tone === 'ok' ? 'check' : 'warning'} size={18} /> {notice.text}
        </p>
      )}

      {ready && (
        <div className="stats">
          <Stat tone={late > 0 ? 'red' : 'green'} icon="warning" label="Vencidos" value={count(late)} detail={late > 0 ? 'Por fecha o por kilómetros' : 'Ninguno atrasado'} />
          <Stat tone="amber" icon="clock" label="Próximos" value={count(soon)} detail="En 15 días o 1.000 km" />
          <Stat tone="blue" icon="wrench" label="Por hacer" value={count(todo)} />
          <Stat tone="grey" icon="check" label="Hechos en 30 días" value={count(recent)} />
        </div>
      )}

      {query.error && query.data !== undefined && <StaleNote onRetry={() => void query.refetch()} />}
      {catalog.error && <CatalogNote onRetry={() => void catalog.refetch()} />}
      {trips.error && (
        <StaleNote onRetry={() => void trips.refetch()}>
          {kmMissing ? 'No se pudieron leer los viajes: los kilómetros de los camiones no se pueden estimar ahora.' : 'No se pudieron actualizar los viajes: los kilómetros son los de la última lectura.'}
        </StaleNote>
      )}

      {query.error && query.data === undefined ? (
        <ErrorNote onRetry={() => void query.refetch()}>{(query.error as { code?: string }).code === TOO_MANY ? 'Hay demasiados services para leerlos de una vez.' : 'No se pudieron leer los services.'}</ErrorNote>
      ) : loading ? (
        <div className="card card-body">
          <Skeleton lines={6} />
        </div>
      ) : (
        <>
          {vehicles.length > 0 && (
            <section className="card km-section" aria-label="Kilómetros por camión">
              <header className="card-head">
                <h2 className="card-title">Kilómetros por camión</h2>
                {vehicle && (
                  <button type="button" className="link-button" onClick={() => set({ camion: null })}>
                    Ver todos
                  </button>
                )}
              </header>
              <ul className="km-grid">
                {vehicles.map((v) => (
                  <TruckKmCard key={v} vehicle={v} km={kms.get(v)} missing={kmMissing} failed={trips.error !== null} todo={todoOf(v)} chosen={vehicle === v} onPick={() => set({ camion: vehicle === v ? null : v })} />
                ))}
              </ul>
              <p className="note">Estimados: el kilometraje anotado en el último service hecho, más los kilómetros que midió el GPS en los viajes con la app desde ese día. Lo que el camión anduvo sin la app no cuenta.</p>
            </section>
          )}

          <section className="card filters" aria-label="Filtros">
            <label className="field field-wide">
              <span>Buscar</span>
              <input type="search" placeholder="Tipo, camión, notas…" value={typed} onChange={(e) => search(e.target.value)} />
            </label>
            <label className="field">
              <span>Camión</span>
              <select value={vehicle} onChange={(e) => set({ camion: e.target.value })}>
                <option value="">Todos los camiones</option>
                {(vehicle && !vehicles.includes(vehicle) ? [vehicle, ...vehicles] : vehicles).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <div className="list-bar">
            <div className="chips" role="group" aria-label="Vista">
              {VIEWS.map((v) => (
                <button key={v.value} type="button" className={`chip${view.value === v.value ? ' is-on' : ''}`} aria-pressed={view.value === v.value} onClick={() => set({ vista: v.value === 'todo' ? null : v.value })}>
                  {v.label} <span>{count(filterServices(views, { view: v.value, vehicle }).length)}</span>
                </button>
              ))}
            </div>
            <div className="list-info">
              {loadedAt !== null && <span className="updated">actualizado {ago(loadedAt, now)}</span>}
              <RefreshButton onClick={() => void Promise.all([query.refetch(), trips.refetch()])} busy={query.isFetching || trips.isFetching} />
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="card">
              <Empty icon="wrench" title={view.value === 'hechos' ? 'No hay services hechos' : view.value === 'todo' ? 'No hay services por hacer' : 'No hay services cargados'}>
                {typed || vehicle ? 'Probá con otro camión o búsqueda.' : 'Cargá un service hecho o uno que hay que hacer con «Nuevo service».'}
              </Empty>
            </div>
          ) : (
            <ul className="card service-list" aria-label="Services">
              {shown.map((s) => (
                <ServiceRow
                  key={s.id}
                  service={s}
                  showTruck={!vehicle}
                  onOpen={() => {
                    setNotice(null);
                    setEditing(s);
                  }}
                />
              ))}
            </ul>
          )}
          <p className="note">Un service por hacer se marca como próximo 15 días antes de la fecha o 1.000 km antes del kilometraje, como en la app.</p>
        </>
      )}

      {(adding || editing) && (
        <ServiceFormDialog
          service={editing}
          vehicle={vehicle}
          vehicles={vehicles}
          services={services}
          kms={kms}
          today={today}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onDone={done}
          onConflict={conflict}
        />
      )}
    </div>
  );
}
