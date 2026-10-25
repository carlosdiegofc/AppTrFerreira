// A truck's card (Flota, decision of 24/10/2026): its data and photo, the trailer it takes and the ones it took, where it
// is, its tank and kilometres, this month's work, its services and papers, and who drove it each month by its trips.
// Only the panel accounts read it.
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Icon } from '../components/Icon';
import { type Photo, PhotoDialog } from '../components/PhotoDialog';
import { Card, Empty, ErrorNote, PageHead, Pill, RefreshButton, Skeleton, StaleNote } from '../components/ui';
import { AnnulHitchDialog, HitchDialog, UnhitchDialog, VehicleFormDialog, VehicleThumb } from '../components/VehicleDialogs';
import { useFuel, useNow, useTripList } from '../data/hooks';
import { type TruckView, useFleetViews } from '../data/vehicles';
import { ago, calendarDay, firstOfMonth, firstOfNextMonth, formatDay, inDays, startOfDay } from '../lib/dates';
import { STATE_LABEL } from '../lib/fleet';
import { andList, count, decimal, money, number } from '../lib/format';
import { monthLabel } from '../lib/drivers';
import { litersPer100, monthsBefore, summarize } from '../lib/metrics';
import { capacityText, driversByMonth, type Hitch, hitchDays, makeLine, trailerLabel, truckKey, truckTrailers, type Vehicle } from '../lib/vehicles';
import { type Notice, noticeOf, TankFact, trailerPath } from './Flota';
import { PAPER_STATE, STATE_TONE } from './states';

function Back() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromList = location.key !== 'default';
  return (
    <button type="button" className="back-link" onClick={() => (fromList ? navigate(-1) : navigate('/flota'))}>
      <Icon name="chevron" size={16} className="flip" /> Flota
    </button>
  );
}

type Editing = { kind: 'card' } | { kind: 'hitch' } | { kind: 'unhitch'; hitch: Hitch } | { kind: 'annul'; hitch: Hitch };

/** Each fact of the card, or «Sin cargar». */
const fact = (value: string | null | undefined) => (value ? value : <span className="muted">Sin cargar</span>);

function TruckPage({ t, now }: { t: TruckView; now: number }) {
  const { views, known, cards, catalog, docs, reads, refetch, isFetching, today } = useFleetViews(now);
  const fuel = useFuel();
  const month = firstOfMonth(today);
  // Who drove it, by its trips of the last twelve months (this one too).
  const year = useTripList(startOfDay(monthsBefore(month, 11)), startOfDay(firstOfNextMonth(today)));
  const [editing, setEditing] = useState<Editing | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const location = useLocation();
  const [notice, setNotice] = useState<Notice | null>(() => noticeOf(location.state));

  const trailers = useMemo(() => cards.vehicles.filter((v) => v.kind === 'trailer'), [cards.vehicles]);
  const byId = useMemo(() => new Map(trailers.map((v) => [v.id, v])), [trailers]);
  const names = useMemo(() => new Map((views ? [...views.current, ...views.gone] : []).map((x) => [x.key, x.label])), [views]);
  const taken = useMemo(() => new Set([...cards.vehicles.filter((v) => v.id !== t.card?.id).map((v) => v.key), ...(catalog.data ?? []).map(truckKey).filter((k) => k !== t.key)]), [cards.vehicles, catalog.data, t.card?.id, t.key]);
  const history = truckTrailers(t.key, cards.hitches);

  // This month's trips by their day in Uruguay, as Viajes and Métricas count them.
  const monthTrips = useMemo(() => year.trips.filter((x) => x.vehicle === t.label && (calendarDay(x.departureAt) ?? '') >= month), [year.trips, t.label, month]);
  const monthFuel = useMemo(() => fuel.receipts.filter((r) => r.vehicle === t.label && r.date !== null && r.date >= month && r.date < firstOfNextMonth(today)), [fuel.receipts, t.label, month, today]);
  const work = summarize(monthTrips, monthFuel, 'vehicle').total;
  const ratio = litersPer100(work);
  const drivers = useMemo(() => driversByMonth(year.trips, t.label), [year.trips, t.label]);
  const activityRead = year.query.data !== undefined && fuel.query.data !== undefined;

  const done = (text: string, tone: 'ok' | 'warn' = 'ok') => {
    setEditing(null);
    setNotice({ tone, text });
  };
  const conflict = () => {
    setEditing(null);
    setNotice({ tone: 'warn', text: 'Otra persona lo cambió mientras lo tenías abierto, y no se guardó nada: ya se ven los datos nuevos. Revisalos y, si hace falta, volvé a cambiarlo.' });
  };
  const open = (e: Editing) => {
    setNotice(null);
    setEditing(e);
  };

  const failed = reads.filter((r) => r.failed);
  const stale = [...reads.filter((r) => r.stale), ...(year.query.data !== undefined && year.query.error ? [{ query: year.query, what: 'los viajes del año' }] : []), ...(fuel.query.data !== undefined && fuel.query.error ? [{ query: fuel.query, what: 'las boletas de combustible' }] : [])];
  const card = t.card;
  const live = known.live ? t.live : null;
  const trailer = t.trailer;
  const capacity = card ? capacityText(card, number) : null;
  const line = card ? makeLine(card) : null;

  return (
    <div className="page">
      <Back />
      <PageHead
        title={t.label}
        subtitle={[line, card?.leftOn ? `Dado de baja el ${formatDay(card.leftOn)}` : null, !t.truck ? 'Ya no está en la lista de camiones de la app' : null].filter(Boolean).join(' · ') || undefined}
        actions={
          <>
            <RefreshButton
              onClick={() => {
                refetch();
                void fuel.query.refetch();
                void year.query.refetch();
              }}
              busy={isFetching || fuel.query.isFetching || year.query.isFetching}
            />
            <button type="button" className={`btn${card ? '' : ' btn-primary'}`} onClick={() => open({ kind: 'card' })}>
              <Icon name={card ? 'edit' : 'plus'} size={18} /> {card ? 'Editar ficha' : 'Crear ficha'}
            </button>
          </>
        }
      />
      {failed.length > 0 && <ErrorNote onRetry={() => failed.forEach((r) => void r.query.refetch())}>No se pudieron leer {andList(failed.map((r) => r.what))}: lo que depende de eso se ve con «—».</ErrorNote>}
      {stale.length > 0 && <StaleNote onRetry={() => stale.forEach((r) => void r.query.refetch())}>No se pudo actualizar: {andList(stale.map((r) => r.what))}. Se ve lo último que se leyó.</StaleNote>}
      {notice && (
        <p className={`notice notice-${notice.tone}`} role={notice.tone === 'ok' ? 'status' : 'alert'}>
          <Icon name={notice.tone === 'ok' ? 'check' : 'warning'} size={18} /> {notice.text}
        </p>
      )}

      <div className="driver-grid">
        <Card title="Datos">
          {card ? (
            <div className="vehicle-data">
              <VehicleThumb path={card.photoPath} title={t.label} onOpen={setPhoto} />
              <dl className="facts facts-tight">
                <div>
                  <dt>Marca y modelo</dt>
                  <dd>{fact([card.brand, card.model].filter(Boolean).join(' '))}</dd>
                </div>
                <div>
                  <dt>Año</dt>
                  <dd>{fact(card.year === null ? null : String(card.year))}</dd>
                </div>
                <div>
                  <dt>Matrícula</dt>
                  <dd>{fact(card.plate)}</dd>
                </div>
                <div>
                  <dt>Chasis</dt>
                  <dd>{fact(card.chassis)}</dd>
                </div>
                <div>
                  <dt>Motor</dt>
                  <dd>{fact(card.engine)}</dd>
                </div>
                <div>
                  <dt>Capacidad de carga</dt>
                  <dd>{fact(capacity)}</dd>
                </div>
              </dl>
              {card.notes && <p className="note driver-notes">{card.notes}</p>}
              {card.leftOn && <p className="note">Se dio de baja el {formatDay(card.leftOn)}{card.leftReason ? ` (${card.leftReason.toLowerCase()})` : ''}: la ficha queda guardada, con su historial.</p>}
            </div>
          ) : (
            <p className="note">Todavía no tiene ficha. Creala para cargarle la foto, el año, los números de chasis y de motor y la capacidad de carga.</p>
          )}
        </Card>

        <Card
          title="Acoplado"
          action={
            // One given away takes no trailer.
            card?.leftOn ? undefined : (
              <button type="button" className="btn" onClick={() => open({ kind: 'hitch' })}>
                <Icon name={history.current ? 'edit' : 'plus'} size={18} /> {history.current ? 'Cambiar' : 'Enganchar'}
              </button>
            )
          }
        >
          {history.current ? (
            <>
              <p className="vehicle-trailer">
                {trailer ? <Link to={trailerPath(trailer.id)}>{trailerLabel(trailer)}</Link> : 'Un acoplado'}
                <span className="muted">
                  {[hitchDays(history.current), trailer ? capacityText(trailer, number) : null, history.current.notes || null].filter(Boolean).join(' · ')}
                </span>
              </p>
              <p className="vehicle-trailer-actions">
                <button type="button" className="link-button" onClick={() => history.current && open({ kind: 'unhitch', hitch: history.current })}>
                  Desenganchar
                </button>
                <button type="button" className="link-button" onClick={() => history.current && open({ kind: 'annul', hitch: history.current })} aria-label={`Anular el enganche de ${trailer ? trailerLabel(trailer) : 'ese acoplado'}, ${hitchDays(history.current).toLowerCase()}`}>
                  Anular
                </button>
              </p>
            </>
          ) : card?.leftOn ? (
            <p className="note">Se dio de baja: ya no lleva acoplado.</p>
          ) : (
            <p className="note">No lleva acoplado. Engancháselo cuando lo tenga: se anota desde qué día lo lleva.</p>
          )}
          {history.past.length > 0 && (
            <ul className="hitch-list" aria-label="Acoplados que llevó antes">
              {history.past.map((h) => {
                const v = byId.get(h.trailerId) ?? null;
                return (
                  <li key={h.id}>
                    <span>{v ? trailerLabel(v) : 'Acoplado'}</span>
                    <span className="muted">
                      {hitchDays(h)}
                      {h.notes ? ` · ${h.notes}` : ''}
                    </span>
                    <button type="button" className="link-button" onClick={() => open({ kind: 'annul', hitch: h })} aria-label={`Anular el enganche de ${v ? trailerLabel(v) : 'ese acoplado'}, ${hitchDays(h).toLowerCase()}`}>
                      Anular
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Ahora">
          <dl className="facts facts-tight vehicle-now">
            <div>
              <dt>GPS</dt>
              <dd>
                {!known.live ? (
                  '—'
                ) : live ? (
                  <>
                    <Pill tone={STATE_TONE[live.state]}>{STATE_LABEL[live.state]}</Pill> {live.driver && <span>{live.driver}</span>}{' '}
                    {live.at && <span className="muted">· {live.trip ? 'leído' : 'terminó su último viaje'} {ago(live.at, now)}</span>}{' '}
                    <Link className="link" to={`/gps?camion=${encodeURIComponent(live.key)}`}>
                      Ver en el GPS
                    </Link>
                  </>
                ) : known.lastTrip ? (
                  <span className="muted">Sin viajes con la app</span>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt>Tanque</dt>
              <dd>
                {known.tank ? <TankFact t={t} /> : '—'}{' '}
                <Link className="link" to="/combustible?vista=tanques">
                  Ver los tanques
                </Link>
              </dd>
            </div>
            <div>
              <dt>Kilómetros (estimados)</dt>
              <dd>
                {!known.km ? '—' : t.km ? `≈ ${number(t.km.estimate)} km, desde el service del ${formatDay(t.km.reference.day)}` : <span className="muted">Se estiman con el kilometraje de un service hecho</span>}
              </dd>
            </div>
          </dl>
        </Card>

        <Card title={`Actividad de ${monthLabel(month).replace(/ de \d+$/, '')}`} action={<Link className="link" to={`/viajes?periodo=mes&camion=${encodeURIComponent(t.label)}`}>Ver sus viajes</Link>}>
          {!activityRead ? (
            year.query.error || fuel.query.error ? (
              <ErrorNote
                onRetry={() => {
                  void year.query.refetch();
                  void fuel.query.refetch();
                }}
              >
                No se pudieron leer los viajes o las boletas.
              </ErrorNote>
            ) : (
              <Skeleton lines={4} />
            )
          ) : (
            <dl className="facts facts-tight">
              <div>
                <dt>Viajes</dt>
                <dd>{count(work.trips)}</dd>
              </div>
              <div>
                <dt>Kilómetros (GPS)</dt>
                <dd>{number(work.gpsKm)} km</dd>
              </div>
              <div>
                <dt>Litros cargados</dt>
                <dd>{decimal(work.liters, 0)} L</dd>
              </div>
              <div>
                <dt>Consumo</dt>
                <dd>{ratio === null ? <span className="muted">Pocos km para calcular</span> : `${decimal(ratio, 1)} L/100 km`}</dd>
              </div>
              <div>
                <dt>Facturado</dt>
                <dd>{[work.billed.UYU > 0 ? money(work.billed.UYU, 'UYU') : null, work.billed.USD > 0 ? money(work.billed.USD, 'USD') : null].filter(Boolean).join(' y ') || <span className="muted">Nada todavía</span>}</dd>
              </div>
            </dl>
          )}
        </Card>

        <Card title="Services" action={<Link className="link" to={`/mantenimiento?camion=${encodeURIComponent(t.label)}`}>Ir a Mantenimiento</Link>}>
          {!known.services ? (
            <p className="note">—</p>
          ) : t.services.length === 0 ? (
            <p className="note">No tiene services pendientes. Se cargan en Mantenimiento.</p>
          ) : (
            <ul className="driver-papers">
              {t.services.map((s) => (
                <li key={s.id}>
                  <span>{s.kind || 'Service'}</span>
                  <span className="muted">{[s.status.byDate, s.status.byKm].filter(Boolean).join(' · ') || 'Sin fecha ni kilómetros'}</span>
                  {s.status.state === 'late' ? <Pill tone="red">Vencido</Pill> : s.status.state === 'soon' ? <Pill tone="amber">Próximo</Pill> : <Pill tone="grey">Pendiente</Pill>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Papeles" action={<Link className="link" to={`/documentacion?de=${encodeURIComponent(`vehicle:${t.label}`)}`}>Ir a Documentación</Link>}>
          {!known.papers ? (
            docs.query.error ? (
              <ErrorNote onRetry={() => void docs.query.refetch()}>No se pudieron leer los papeles.</ErrorNote>
            ) : (
              <Skeleton lines={3} />
            )
          ) : t.papers.length === 0 ? (
            <p className="note">Todavía no tiene papeles cargados. Se cargan en Documentación.</p>
          ) : (
            <ul className="driver-papers">
              {t.papers.map((p) => (
                <li key={p.id}>
                  <span>{p.kind || 'Sin tipo'}</span>
                  <span className="muted">{p.expiresOn ? `${p.state === 'late' ? 'Venció' : 'Vence'} el ${formatDay(p.expiresOn)}${p.state === 'late' || p.state === 'soon' ? ` · ${inDays(p.expiresOn, today)}` : ''}` : 'Sin vencimiento'}</span>
                  <Pill tone={PAPER_STATE[p.state].tone}>{PAPER_STATE[p.state].label}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Quién lo manejó" padded={false}>
        {year.query.data === undefined ? (
          <div className="card-body">{year.query.error ? <ErrorNote onRetry={() => void year.query.refetch()}>No se pudieron leer los viajes del año.</ErrorNote> : <Skeleton lines={3} />}</div>
        ) : drivers.length === 0 ? (
          <div className="card-body">
            <p className="note">No tiene viajes en los últimos doce meses.</p>
          </div>
        ) : (
          <div className="statement-scroll">
            <table className="statement" aria-label="Choferes por mes">
              <thead>
                <tr>
                  <th scope="col">Mes</th>
                  <th scope="col">Choferes</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((m) => (
                  <tr key={m.month}>
                    <td>{monthLabel(m.month, true)}</td>
                    <td>{m.drivers.map((d) => `${d.name} (${d.trips === 1 ? '1 viaje' : `${count(d.trips)} viajes`}, ${number(d.km)} km)`).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="note">Los choferes salen de los viajes de la app y de los cargados en el panel, con las correcciones de la oficina. Los kilómetros y el tanque son estimados; los viajes y sus kilómetros, medidos por la app.</p>

      <PhotoDialog photo={photo} onClose={() => setPhoto(null)} />
      {editing?.kind === 'card' && (
        <VehicleFormDialog
          vehicle={card}
          kind="truck"
          truck={t.truck}
          label={t.label}
          taken={taken}
          today={today}
          hitched={history.current ? { what: `Lleva ${trailer ? `el ${trailerLabel(trailer)}` : 'un acoplado'}`, fromOn: history.current.fromOn } : null}
          onClose={() => setEditing(null)}
          onDone={done}
          onConflict={conflict}
        />
      )}
      {editing?.kind === 'hitch' && (
        <HitchDialog
          truck={{ key: t.key, label: t.label }}
          current={history.current}
          trailers={trailers.filter((v) => !v.leftOn)}
          hitches={cards.hitches}
          truckName={(key) => names.get(key) ?? key.replace(/^(plate|model):/, '').toUpperCase()}
          today={today}
          onClose={() => setEditing(null)}
          onDone={done}
          onConflict={conflict}
        />
      )}
      {editing?.kind === 'unhitch' && (
        <UnhitchDialog hitch={editing.hitch} trailer={byId.get(editing.hitch.trailerId) ?? null} truckLabel={t.label} today={today} onClose={() => setEditing(null)} onDone={done} onConflict={conflict} />
      )}
      {editing?.kind === 'annul' && (
        <AnnulHitchDialog
          hitch={editing.hitch}
          what={`${(byId.get(editing.hitch.trailerId) as Vehicle | undefined) ? trailerLabel(byId.get(editing.hitch.trailerId) as Vehicle) : 'El acoplado'} en el ${t.label}`}
          onClose={() => setEditing(null)}
          onDone={done}
          onConflict={conflict}
        />
      )}
    </div>
  );
}

export function Camion() {
  const { key = '' } = useParams();
  const now = useNow(30_000);
  const { views, cards, catalog } = useFleetViews(now);
  const t = views ? [...views.current, ...views.gone].find((x) => x.key === key) : undefined;
  // A card just created may not be in the list read before: wait for the list read again.
  if (!views || (!t && (cards.query.isFetching || catalog.isFetching))) {
    if ((cards.query.data === undefined && cards.query.error) || (catalog.data === undefined && catalog.error)) {
      return (
        <div className="page">
          <Back />
          <ErrorNote
            onRetry={() => {
              void cards.query.refetch();
              void catalog.refetch();
            }}
          >
            No se pudo leer la ficha.
          </ErrorNote>
        </div>
      );
    }
    return (
      <div className="page">
        <Back />
        <div className="card card-body">
          <Skeleton lines={8} />
        </div>
      </div>
    );
  }
  if (!t) {
    return (
      <div className="page">
        <Back />
        <div className="card">
          <Empty icon="truck" title="No encontramos ese camión">
            Puede que la dirección esté mal escrita. <Link className="link" to="/flota">Ver todos los camiones</Link>
          </Empty>
        </div>
      </div>
    );
  }
  // Another truck is another page: nothing of the previous one stays on screen.
  return <TruckPage key={t.key} t={t} now={now} />;
}
