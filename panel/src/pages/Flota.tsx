// Flota (decision of 24/10/2026): every truck of the catalog with its card, its trailer and what the other sections
// know of it (where it is, its kilometres, its tank, its next service, its papers and its month), the urgent ones first;
// the trailers; and the vehicles sold. Only the panel accounts read and change the cards.
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Icon } from '../components/Icon';
import { Empty, ErrorNote, PageHead, Pill, RefreshButton, Skeleton, StaleNote, Stat } from '../components/ui';
import { type Photo, PhotoDialog } from '../components/PhotoDialog';
import { VehicleFormDialog, VehicleThumb } from '../components/VehicleDialogs';
import { useNow } from '../data/hooks';
import { type FleetKnown, type TruckView, useFleetViews } from '../data/vehicles';
import { ago, formatDay } from '../lib/dates';
import { paperViews } from '../lib/documents';
import { STATE_LABEL } from '../lib/fleet';
import { andList, count, decimal, number } from '../lib/format';
import { capacityText, hitchDays, makeLine, samePlate, trailerLabel, trailerTrucks, truckKey, type Vehicle } from '../lib/vehicles';
import { PAPER_STATE, STATE_TONE } from './states';

type View = 'camiones' | 'acoplados' | 'baja';
const VIEWS: { value: View; label: string }[] = [
  { value: 'camiones', label: 'Camiones' },
  { value: 'acoplados', label: 'Acoplados' },
  { value: 'baja', label: 'De baja' },
];

export const truckPath = (key: string) => `/flota/camion/${encodeURIComponent(key)}`;

export interface Notice {
  tone: 'ok' | 'warn';
  text: string;
}
/** What a card opened right after it was created says first: «Ficha … creada.» */
export const noticeOf = (state: unknown): Notice | null => (state && typeof state === 'object' && 'notice' in state ? ((state as { notice: Notice | null }).notice ?? null) : null);
export const trailerPath = (id: string) => `/flota/acoplado/${id}`;

/** The papers in one pill: how many are expired or close, or «Al día». */
export function PapersPill({ papers }: { papers: readonly { state: keyof typeof PAPER_STATE }[] }) {
  const late = papers.filter((p) => p.state === 'late').length;
  const soon = papers.filter((p) => p.state === 'soon').length;
  if (late > 0) return <Pill tone="red">{late === 1 ? '1 papel vencido' : `${count(late)} papeles vencidos`}</Pill>;
  if (soon > 0) return <Pill tone="amber">{soon === 1 ? '1 papel por vencer' : `${count(soon)} papeles por vencer`}</Pill>;
  return <span className="muted">{papers.length === 0 ? 'Sin papeles cargados' : 'Al día'}</span>;
}

/** The next service to do: late, coming up, or the next one planned. */
export function ServiceFact({ t }: { t: TruckView }) {
  const next = t.services[0];
  if (!next) return <span className="muted">Nada pendiente</span>;
  const state = next.status.state;
  const kind = next.kind || 'Service';
  if (state === 'late')
    return (
      <>
        <Pill tone="red">Vencido</Pill> {kind}
      </>
    );
  if (state === 'soon')
    return (
      <>
        <Pill tone="amber">Próximo</Pill> {kind}
      </>
    );
  return <span>{kind}</span>;
}

/** The tank, as Combustible estimates it. */
export function TankFact({ t }: { t: TruckView }) {
  const s = t.tank?.state;
  if (!s || s.status === 'unset') return <span className="muted">Sin tanque cargado</span>;
  if (s.status === 'waiting') return <span className="muted">Falta saber cuánto tiene</span>;
  if (s.status === 'unknown') return <Pill tone="amber">Revisar</Pill>;
  return s.low ? <Pill tone="red">≈ {decimal(s.liters, 0)} L · bajo</Pill> : <span>≈ {decimal(s.liters, 0)} L</span>;
}

function TruckRow({ t, known, onCreate, onPhoto }: { t: TruckView; known: FleetKnown; onCreate: (t: TruckView) => void; onPhoto: (p: Photo) => void }) {
  const live = known.live ? t.live : null;
  const line = t.card ? makeLine(t.card) : null;
  return (
    <li className="card vehicle-row">
      <VehicleThumb path={t.card?.photoPath ?? null} title={t.label} onOpen={onPhoto} />
      <div className="vehicle-main">
        <h2>
          <Link to={truckPath(t.key)}>{t.label}</Link>
        </h2>
        <p className="muted">
          {live ? <Pill tone={STATE_TONE[live.state]}>{STATE_LABEL[live.state]}</Pill> : null} {live?.trip && live.driver ? live.driver : t.card ? (line ?? 'Con ficha') : 'Sin ficha'}
          {!t.truck && ' · ya no está en la lista de camiones de la app'}
        </p>
      </div>
      <dl className="vehicle-facts">
        <div>
          <dt>Acoplado</dt>
          <dd>{t.trailer ? trailerLabel(t.trailer) : <span className="muted">Sin acoplado</span>}</dd>
        </div>
        <div>
          <dt>Kilómetros</dt>
          <dd>{!known.km ? '—' : t.km ? `≈ ${number(t.km.estimate)} km` : <span className="muted">Sin kilometraje</span>}</dd>
        </div>
        <div>
          <dt>Tanque</dt>
          <dd>{known.tank ? <TankFact t={t} /> : '—'}</dd>
        </div>
        <div>
          <dt>Service</dt>
          <dd>{known.services ? <ServiceFact t={t} /> : '—'}</dd>
        </div>
        <div>
          <dt>Papeles</dt>
          <dd>{known.papers ? <PapersPill papers={t.papers} /> : '—'}</dd>
        </div>
        <div>
          <dt>Este mes</dt>
          <dd>{known.month ? `${t.month?.trips === 1 ? '1 viaje' : `${count(t.month?.trips ?? 0)} viajes`} · ${number(t.month?.gpsKm ?? 0)} km` : '—'}</dd>
        </div>
      </dl>
      {t.card ? (
        <Link className="btn" to={truckPath(t.key)}>
          Ver ficha <Icon name="chevron" size={16} />
        </Link>
      ) : (
        <button type="button" className="btn" onClick={() => onCreate(t)}>
          <Icon name="plus" size={18} /> Crear ficha
        </button>
      )}
    </li>
  );
}

function TrailerRow({ v, on, papers, onPhoto }: { v: Vehicle; on: string | null; papers: readonly { state: keyof typeof PAPER_STATE }[] | null; onPhoto: (p: Photo) => void }) {
  const capacity = capacityText(v, number);
  return (
    <li className="card vehicle-row">
      <VehicleThumb path={v.photoPath} title={trailerLabel(v)} onOpen={onPhoto} />
      <div className="vehicle-main">
        <h2>
          <Link to={trailerPath(v.id)}>{trailerLabel(v)}</Link>
        </h2>
        <p className="muted">{[makeLine(v), capacity].filter(Boolean).join(' · ') || 'Sin datos'}</p>
      </div>
      <dl className="vehicle-facts vehicle-facts-short">
        <div>
          <dt>Camión</dt>
          <dd>{on ?? <span className="muted">Sin camión</span>}</dd>
        </div>
        <div>
          <dt>Papeles</dt>
          <dd>{papers ? <PapersPill papers={papers} /> : '—'}</dd>
        </div>
      </dl>
      <Link className="btn" to={trailerPath(v.id)}>
        Ver ficha <Icon name="chevron" size={16} />
      </Link>
    </li>
  );
}

export function Flota() {
  const now = useNow(30_000);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = VIEWS.find((v) => v.value === params.get('vista'))?.value ?? 'camiones';
  const { views, known, cards, catalog, docs, reads, waiting, refetch, isFetching, today } = useFleetViews(now);
  const [creating, setCreating] = useState<{ kind: 'truck'; t: TruckView } | { kind: 'trailer' } | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  // What the new card says when it opens.
  const created = useRef<Notice | null>(null);

  const trailers = useMemo(() => cards.vehicles.filter((v) => v.kind === 'trailer' && !v.leftOn).sort((a, b) => trailerLabel(a).localeCompare(trailerLabel(b), 'es')), [cards.vehicles]);
  const goneTrailers = useMemo(() => cards.vehicles.filter((v) => v.kind === 'trailer' && v.leftOn), [cards.vehicles]);
  // How each truck is named, by its key: where each trailer goes.
  const names = useMemo(() => new Map((views ? [...views.current, ...views.gone] : []).map((t) => [t.key, t.label])), [views]);
  // Every key in use: a new trailer's plate has to be its own.
  const taken = useMemo(() => new Set([...cards.vehicles.map((v) => v.key), ...(catalog.data ?? []).map(truckKey)]), [cards.vehicles, catalog.data]);
  // A trailer's papers are the ones with its plate, as Documentación loads them.
  const papersOf = (v: Vehicle) => (known.papers ? paperViews(docs.papers.filter((p) => p.scope === 'vehicle' && samePlate(p.vehicle, v.plate)), today) : null);

  const failed = reads.filter((r) => r.failed);
  const stale = reads.filter((r) => r.stale);
  const ready = views !== null && !waiting;
  const cardsFailed = cards.query.data === undefined && !!cards.query.error;
  const catalogFailed = catalog.data === undefined && !!catalog.error;
  const urgent = views ? views.current.filter((t) => t.attention !== null).length : 0;
  const travelling = views ? views.current.filter((t) => t.live?.trip).length : 0;

  return (
    <div className="page">
      <PageHead
        title="Flota"
        subtitle="La ficha de cada camión y de su acoplado, con lo que ya se sabe de cada uno. Los camiones son los de la lista que usa la app."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setCreating({ kind: 'trailer' })} disabled={!ready}>
            <Icon name="plus" size={18} /> Nuevo acoplado
          </button>
        }
      />
      {notice && (
        <p className={`notice notice-${notice.tone}`} role={notice.tone === 'ok' ? 'status' : 'alert'}>
          <Icon name={notice.tone === 'ok' ? 'check' : 'warning'} size={18} /> {notice.text}
        </p>
      )}
      {ready && failed.length > 0 && (
        <ErrorNote onRetry={() => failed.forEach((r) => void r.query.refetch())}>No se pudieron leer {andList(failed.map((r) => r.what))}: lo que depende de eso se ve con «—».</ErrorNote>
      )}
      {ready && stale.length > 0 && <StaleNote onRetry={() => stale.forEach((r) => void r.query.refetch())}>No se pudo actualizar: {andList(stale.map((r) => r.what))}. Se ve lo último que se leyó.</StaleNote>}
      {ready && views && (
        <div className="stats">
          <Stat tone="blue" icon="truck" label="Camiones" value={count(views.current.length)} detail={`${count(views.current.filter((t) => t.card).length)} con ficha`} />
          <Stat tone="green" icon="route" label="En viaje ahora" value={known.live ? count(travelling) : '—'} />
          <Stat tone={urgent > 0 ? 'amber' : 'green'} icon="warning" label="Para atender" value={count(urgent)} detail="Papeles, services o combustible" />
          <Stat tone="grey" icon="box" label="Acoplados" value={count(trailers.length)} />
        </div>
      )}

      <div className="list-bar">
        <div className="chips" role="group" aria-label="Vista">
          {VIEWS.map((v) => (
            <button key={v.value} type="button" className={`chip${view === v.value ? ' is-on' : ''}`} aria-pressed={view === v.value} onClick={() => setParams(v.value === 'camiones' ? {} : { vista: v.value }, { replace: true })}>
              {v.label} <span>{views ? count(v.value === 'camiones' ? views.current.length : v.value === 'acoplados' ? trailers.length : views.gone.length + goneTrailers.length) : '—'}</span>
            </button>
          ))}
        </div>
        <div className="list-info">
          {cards.query.dataUpdatedAt > 0 && <span className="updated">actualizado {ago(cards.query.dataUpdatedAt, now)}</span>}
          <RefreshButton onClick={refetch} busy={isFetching} />
        </div>
      </div>

      {cardsFailed || catalogFailed ? (
        <ErrorNote
          onRetry={() => {
            void cards.query.refetch();
            void catalog.refetch();
          }}
        >
          {cardsFailed ? 'No se pudieron leer las fichas de la flota.' : 'No se pudo leer la lista de camiones de la app.'}
        </ErrorNote>
      ) : !ready || !views ? (
        <div className="card card-body">
          <Skeleton lines={6} />
        </div>
      ) : view === 'camiones' ? (
        views.current.length === 0 ? (
          <div className="card">
            <Empty icon="truck" title="La lista de camiones de la app está vacía">
              Los camiones salen de esa lista: cuando tenga alguno, aparece acá para crearle la ficha.
            </Empty>
          </div>
        ) : (
          <ul className="vehicle-list" aria-label="Camiones">
            {views.current.map((t) => (
              <TruckRow key={t.key} t={t} known={known} onCreate={(x) => setCreating({ kind: 'truck', t: x })} onPhoto={setPhoto} />
            ))}
          </ul>
        )
      ) : view === 'acoplados' ? (
        trailers.length === 0 ? (
          <div className="card">
            <Empty icon="box" title="Todavía no hay acoplados">
              Cargá cada uno con «Nuevo acoplado» y engancháselo a su camión desde la ficha del camión.
            </Empty>
          </div>
        ) : (
          <ul className="vehicle-list" aria-label="Acoplados">
            {trailers.map((v) => {
              const at = trailerTrucks(v.id, cards.hitches).current;
              return <TrailerRow key={v.id} v={v} on={at ? `${names.get(at.truckKey) ?? at.truckKey} · ${hitchDays(at).toLowerCase()}` : null} papers={papersOf(v)} onPhoto={setPhoto} />;
            })}
          </ul>
        )
      ) : views.gone.length + goneTrailers.length === 0 ? (
        <div className="card">
          <Empty icon="truck" title="No hay camiones ni acoplados de baja">
            Cuando uno se vende o deja de usarse, se marca en su ficha: queda acá con todo su historial.
          </Empty>
        </div>
      ) : (
        <ul className="vehicle-list" aria-label="De baja">
          {views.gone.map((t) => (
            <li key={t.key} className="card vehicle-row vehicle-row-gone">
              <VehicleThumb path={t.card?.photoPath ?? null} title={t.label} onOpen={setPhoto} />
              <div className="vehicle-main">
                <h2>
                  <Link to={truckPath(t.key)}>{t.label}</Link>
                </h2>
                <p className="muted">{[`Desde el ${formatDay(t.card?.leftOn ?? '')}`, t.card?.leftReason].filter(Boolean).join(' · ')}</p>
              </div>
            </li>
          ))}
          {goneTrailers.map((v) => (
            <li key={v.id} className="card vehicle-row vehicle-row-gone">
              <VehicleThumb path={v.photoPath} title={trailerLabel(v)} onOpen={setPhoto} />
              <div className="vehicle-main">
                <h2>
                  <Link to={trailerPath(v.id)}>{trailerLabel(v)}</Link>
                </h2>
                <p className="muted">{[`Desde el ${formatDay(v.leftOn ?? '')}`, v.leftReason].filter(Boolean).join(' · ')}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="note">
        Los kilómetros y el tanque son estimados, como en Mantenimiento y en Combustible; los viajes y los kilómetros del mes, medidos por la app. Agregar o sacar camiones de la lista que usa la app pasa al panel con Configuración.
      </p>

      <PhotoDialog photo={photo} onClose={() => setPhoto(null)} />
      {creating && (
        <VehicleFormDialog
          vehicle={null}
          kind={creating.kind}
          truck={creating.kind === 'truck' ? creating.t.truck : null}
          label={creating.kind === 'truck' ? creating.t.label : ''}
          taken={taken}
          today={today}
          onClose={() => setCreating(null)}
          onDone={(text, tone = 'ok') => {
            created.current = { tone, text };
            setCreating(null);
            setNotice({ tone, text });
          }}
          onConflict={() => {
            setCreating(null);
            setNotice({ tone: 'warn', text: 'Otra persona creó esa ficha mientras la cargabas, y no se guardó nada: ya se ve la suya. Revisala y, si hace falta, corregila.' });
          }}
          onCreated={(saved) => navigate(saved.kind === 'trailer' ? trailerPath(saved.id) : truckPath(saved.vehicle_key), { state: { notice: created.current } })}
        />
      )}
    </div>
  );
}

