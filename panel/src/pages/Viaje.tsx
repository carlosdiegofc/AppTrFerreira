import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExpenseFormDialog } from '../components/ExpenseFormDialog';
import { Icon } from '../components/Icon';
import { type Photo, PhotoDialog } from '../components/PhotoDialog';
import { TripFormDialog } from '../components/TripFormDialog';
import { TripMap } from '../components/TripMap';
import { CatalogNote, Card, Empty, ErrorNote, PageHead, Pill, RefreshButton, Skeleton, StaleNote } from '../components/ui';
import { ROUTE_REFRESH_MS } from '../config';
import { ConflictError, describeWriteError } from '../data/api';
import { useExpenses, useNow, useRoute, useRouteGaps, useSetTripDeleted, useTripDetail, useTripStops } from '../data/hooks';
import { clientKey } from '../lib/clients';
import { calendarDay, dayInZone, formatDay, formatDayTime, formatDuration, formatTime } from '../lib/dates';
import { type Expense, expensesLink, expenseTotals, NO_CHOICES, NO_NAMES, tripTargetName } from '../lib/expenses';
import { count, money, number } from '../lib/format';
import { documentLabel, sourceLabel, tripFacts } from '../lib/tripTable';
import { gapSummary, readingCuts, routeRuns } from '../lib/route';
import { inOrder, legs as stopLegs, STOP_STATE_LABEL, stopState, stopTitle, unloadMs } from '../lib/stops';
import { fuelFromReceipt, type LatLng, parseTripKey, routeStats } from '../lib/trips';
import { clientPath } from './clientText';
import { amounts } from './fuelText';
import { STATUS_TONE } from './states';

/** «12,3 km estimados en 2 tramos · 1 sin contar». */
function gapText({ filled, meters, open }: { filled: number; meters: number; open: number }): string {
  return [filled > 0 ? `${number(meters / 1000, 1)} km estimados en ${filled} ${filled === 1 ? 'tramo' : 'tramos'}` : null, open > 0 ? `${open} sin contar` : null].filter(Boolean).join(' · ');
}

const samePlace = (a: LatLng | null, b: LatLng | null) => a !== null && b !== null && a[0] === b[0] && a[1] === b[1];

/** What happened with the last change, shown on the page until the next one. */
interface Notice {
  tone: 'ok' | 'warn' | 'error';
  text: string;
}

const CONFLICT = 'Otra persona cambió este viaje mientras lo tenías abierto, y no se guardó nada: ya se ven sus datos nuevos. Revisalos y, si hace falta, volvé a cambiarlo.';

function Back() {
  const navigate = useNavigate();
  const location = useLocation();
  // Back to the list as it was (filters included) when the trip was opened from it; to the list otherwise.
  const fromList = location.key !== 'default';
  return (
    <button type="button" className="back-link" onClick={() => (fromList ? navigate(-1) : navigate('/viajes'))}>
      <Icon name="chevron" size={16} className="flip" /> Viajes
    </button>
  );
}

function Missing() {
  return (
    <div className="page">
      <Back />
      <div className="card">
        <Empty icon="route" title="No encontramos ese viaje">
          Puede que la dirección esté mal escrita o que esta cuenta no pueda verlo. <Link className="link" to="/viajes">Ver todos los viajes</Link>
        </Empty>
      </div>
    </div>
  );
}

function TripPage({ kind, id }: { kind: 'app' | 'web'; id: string }) {
  const { trip, detail, catalog } = useTripDetail(kind, id);
  const session = detail.data?.session ?? null;
  const routeTrip = session ? { id: session.id, driver_id: session.driver_id, started_at: session.started_at, ended_at: session.ended_at } : null;
  const route = useRoute(routeTrip);
  const stats = useMemo(() => (route.data ? routeStats(route.data) : null), [route.data]);
  // The stretches without signal: the kilometres the app estimated, and the cuts it left for the office to check.
  const gaps = useRouteGaps(routeTrip);
  const gapTotals = useMemo(() => gapSummary(gaps.data ?? []), [gaps.data]);
  const openGaps = (gaps.data ?? []).filter((g) => g.method === 'sin_rellenar');
  // The times the phone's GPS stopped with the truck moving (30/10/2026).
  const cuts = useMemo(() => (route.data ? readingCuts(route.data) : []), [route.data]);
  // The stops of a trip with several unloadings, and the kilometres of each leg between them.
  const stopsQuery = useTripStops(routeTrip);
  const stops = useMemo(() => inOrder(stopsQuery.data ?? []), [stopsQuery.data]);
  const stopLegsList = useMemo(() => (session && route.data ? stopLegs(route.data, stops, session.started_at, session.ended_at) : []), [session, route.data, stops]);
  const now = useNow(30_000);
  const dashed = useMemo(() => (route.data ? routeRuns(route.data).some((r) => r.estimated && r.points.length > 1) : false), [route.data]);
  const fuel = useMemo(() => (detail.data?.fuel ?? []).map((f) => fuelFromReceipt(f, catalog.data ?? [])), [detail.data, catalog.data]);
  const documents = detail.data?.documents ?? [];
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [binning, setBinning] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  // A trip typed by hand opens here right after it is saved, and says so once: reloading the page does not repeat it.
  const justSaved = (location.state as { saved?: boolean } | null)?.saved === true;
  const [notice, setNotice] = useState<Notice | null>(() => (justSaved ? { tone: 'ok', text: 'Viaje cargado.' } : null));
  useEffect(() => {
    if (justSaved) navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
  }, [justSaved, location.pathname, location.search, navigate]);
  const bin = useSetTripDeleted();
  // The trip's expenses, in Gastos: cash tolls, travel money, a repair on the road…
  const costs = useExpenses();
  const [costing, setCosting] = useState<{ expense: Expense | null } | null>(null);

  if (detail.isLoading || catalog.isLoading) {
    return (
      <div className="page">
        <Back />
        <div className="card card-body">
          <Skeleton lines={8} />
        </div>
      </div>
    );
  }
  // Only a first read that failed takes the page: after that, a failed refresh keeps the trip on screen with a note.
  if (detail.error && detail.data === undefined) {
    return (
      <div className="page">
        <Back />
        <ErrorNote onRetry={() => void detail.refetch()}>No se pudo leer el viaje.</ErrorNote>
      </div>
    );
  }
  if (!trip) return <Missing />;

  const downloadPdf = async () => {
    setPdfBusy(true);
    setPdfFailed(false);
    try {
      const { downloadTripPdf } = await import('../exports/trips');
      const day = calendarDay(trip.departureAt) ?? 'sin-fecha';
      await downloadTripPdf(trip, { documents, fuel, stats }, `viaje_${day}_${trip.orderNumber ?? trip.key.slice(4, 12)}`);
    } catch (e) {
      console.error(e);
      setPdfFailed(true);
    } finally {
      setPdfBusy(false);
    }
  };

  // To the trash and back. The trip is never deleted: what the phone sent and the GPS route stay.
  const setDeleted = async (deleted: boolean) => {
    setNotice(null);
    try {
      await bin.mutateAsync({ trip, deleted });
      setNotice({ tone: 'ok', text: deleted ? 'El viaje está en la papelera. Lo podés restaurar desde acá o desde «Eliminados».' : 'Viaje restaurado: vuelve a contar en la lista y en los totales.' });
    } catch (err) {
      console.error(err);
      setNotice(err instanceof ConflictError ? { tone: 'warn', text: CONFLICT } : { tone: 'error', text: describeWriteError(err) });
    } finally {
      setBinning(false);
    }
  };

  const live = trip.active;
  const tripExpenses = costs.expenses.filter((e) => !e.deleted && e.tripKey === trip.key).sort((a, b) => a.spentOn.localeCompare(b.spentOn) || a.createdAt.localeCompare(b.createdAt));
  const tripName = tripTargetName(trip);
  const today = dayInZone(Date.now());
  const title = trip.orderNumber ? `Orden de carga ${trip.orderNumber}` : `Viaje de ${trip.driverName ?? 'chofer sin indicar'}`;
  const facts = tripFacts(trip);
  // A trip in the trash is in no account.
  const account = trip.deleted ? null : clientKey(trip.client);
  // Without an origin typed in the panel, an app trip's origin is where the GPS saw it start: that one is measured.
  const declared = { origin: samePlace(trip.origin, trip.gpsStart) ? null : trip.origin, destination: trip.destination };
  const binDay = calendarDay(trip.deletedAt);

  return (
    <div className="page">
      <Back />
      <PageHead
        title={title}
        subtitle={[trip.departureAt ? formatDayTime(Date.parse(trip.departureAt)) : null, sourceLabel(trip)].filter(Boolean).join(' · ')}
        actions={
          <>
            <button type="button" className={`btn btn-quiet${pdfBusy ? ' is-busy' : ''}`} disabled={pdfBusy} onClick={() => void downloadPdf()}>
              <Icon name="doc" size={18} />
              <span className="btn-text">Descargar PDF</span>
            </button>
            <RefreshButton onClick={() => void Promise.all([detail.refetch(), route.refetch(), gaps.refetch()])} busy={detail.isFetching || route.isFetching} />
          </>
        }
      />
      {pdfFailed && <ErrorNote>No se pudo armar el PDF. Probá de nuevo.</ErrorNote>}
      {detail.error && <StaleNote onRetry={() => void detail.refetch()} />}
      {catalog.error && <CatalogNote onRetry={() => void catalog.refetch()} />}
      {notice && (
        <p className={`notice notice-${notice.tone}`} role={notice.tone === 'ok' ? 'status' : 'alert'}>
          <Icon name={notice.tone === 'ok' ? 'check' : 'warning'} size={18} /> {notice.text}
        </p>
      )}

      <div className="trip-status">
        <Pill tone={STATUS_TONE[trip.status.code]}>{trip.status.label}</Pill>
        {trip.deleted && binDay && <span>Está en la papelera desde el {formatDay(binDay)}: no cuenta en los totales.</span>}
        {!trip.deleted && trip.status.missing.length > 0 && <span>Falta completar: {trip.status.missing.join(', ')}.</span>}
        <div className="trip-actions">
          {trip.deleted ? (
            <button type="button" className={`btn btn-primary${bin.isPending ? ' is-busy' : ''}`} disabled={bin.isPending} onClick={() => void setDeleted(false)}>
              <Icon name="undo" size={18} /> Restaurar
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setNotice(null);
                  setEditing(true);
                }}
              >
                <Icon name="edit" size={18} /> {trip.panelId ? 'Editar datos' : 'Completar datos'}
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setBinning(true)}>
                <Icon name="trash" size={18} /> Mandar a la papelera
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid-2 trip-grid">
        <Card title="Orden de carga">
          <dl className="facts order-facts">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  {/* The client leads to its account in Cobros. */}
                  {label === 'Cliente' && account ? (
                    <Link className="link" to={clientPath(account)} title="Ver la cuenta del cliente en Cobros">
                      {value}
                    </Link>
                  ) : (
                    value
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {trip.notes && (
            <div className="trip-notes">
              <h3>Notas</h3>
              <p>{trip.notes}</p>
            </div>
          )}
        </Card>

        <Card title="Recorrido" padded={false} action={live ? <Pill tone="blue">En vivo · se actualiza cada {ROUTE_REFRESH_MS / 1000} s</Pill> : undefined}>
          {trip.source === 'manual' && !trip.origin && !trip.destination ? (
            <div className="card-body">
              <Empty icon="route" title="Sin recorrido">Este viaje se cargó a mano: no tiene recorrido del GPS.</Empty>
            </div>
          ) : (
            <>
              {trip.source === 'app' && route.error && (
                <div className="card-body route-error">
                  <ErrorNote onRetry={() => void route.refetch()}>{route.data ? 'No se pudo actualizar el recorrido del GPS.' : 'No se pudo leer el recorrido del GPS.'}</ErrorNote>
                </div>
              )}
              <TripMap route={route.data ?? null} start={trip.gpsStart} end={trip.gpsEnd} declared={declared} live={live} stops={stops} label="Mapa del recorrido del viaje" />
              <p className="map-legend">
                {trip.source === 'app' && (
                  <span>
                    <i className="lg-gps" aria-hidden="true" /> Medido por el GPS
                  </span>
                )}
                {trip.source === 'app' && dashed && (
                  <span>
                    <i className="lg-gap" aria-hidden="true" /> Sin señal: el camino estimado
                  </span>
                )}
                {(declared.origin || declared.destination) && (
                  <span>
                    <i className="lg-declared" aria-hidden="true" /> {trip.source === 'app' ? 'Origen y destino declarados por la oficina o el chofer' : 'Origen y destino declarados al cargar el viaje a mano (sin GPS)'}
                  </span>
                )}
              </p>
              {trip.source === 'app' && (
                <dl className="facts facts-tight route-facts">
                  <div><dt>Puntos del recorrido</dt><dd>{stats ? count(stats.count) : route.error ? '—' : '…'}</dd></div>
                  <div><dt>Duración</dt><dd>{stats?.durationMs != null ? formatDuration(stats.durationMs) : '—'}</dd></div>
                  <div><dt>Velocidad máxima</dt><dd>{stats?.maxSpeedKmh != null ? `${number(stats.maxSpeedKmh)} km/h` : '—'}</dd></div>
                  {(gaps.data?.length ?? 0) > 0 && (
                    <div>
                      <dt>Sin señal</dt>
                      <dd>{gapText(gapTotals)}</dd>
                    </div>
                  )}
                </dl>
              )}
              {trip.source === 'app' &&
                openGaps.map((g) => (
                  <p key={g.id} className="notice notice-warn route-gap">
                    <Icon name="warning" size={18} /> Sin señal desde el {formatDayTime(Date.parse(g.from_at))} durante {formatDuration(Date.parse(g.to_at) - Date.parse(g.from_at))}: ese tramo quedó sin contar, porque pasaron más de 3 horas o el salto fue más largo de lo que anda un camión. Revisá los km del viaje.
                  </p>
                ))}
              {trip.source === 'app' && cuts.length > 0 && (
                <div className="notice notice-warn route-cuts">
                  <Icon name="warning" size={18} />
                  <div>
                    <p>
                      El GPS del teléfono no registró con el camión en marcha {cuts.length === 1 ? 'una vez' : `${cuts.length} veces`}. Pasa cuando el teléfono duerme la app para ahorrar batería: en la app, Mi cuenta › Revisar GPS tiene los pasos para evitarlo.
                    </p>
                    <ul>
                      {cuts.map((c) => (
                        <li key={c.from}>
                          De {formatDayTime(Date.parse(c.from))} a {formatTime(Date.parse(c.to))} ({formatDuration(Date.parse(c.to) - Date.parse(c.from))}), unos {Math.max(1, Math.round(c.meters / 1000))} km en línea recta
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {trip.source === 'app' && stops.length > 0 && (
        <Card title={`Paradas de descarga (${stops.length})`} padded={false}>
          <ul className="item-list stop-list">
            {stops.map((st, i) => {
              const state = stopState(st);
              const ms = unloadMs(st, now);
              const leg = stopLegsList.length > 0 ? stopLegsList.find((l) => l.to === stopTitle(st)) : undefined;
              return (
                <li key={st.id}>
                  <span className="item-main">
                    <strong>
                      {i + 1} · {stopTitle(st)}
                    </strong>
                    <span>
                      {state === 'waiting'
                        ? 'Todavía no llegó'
                        : [
                            `Llegó ${formatDayTime(Date.parse(st.arrived_at as string))}`,
                            st.finished_at ? `terminó ${formatDayTime(Date.parse(st.finished_at))}${st.finished_by === 'movimiento' ? ' (el camión arrancó)' : ''}` : null,
                            ms !== null ? `${formatDuration(ms)} descargando` : null,
                            st.kg !== null ? `${number(st.kg, 0)} kg` : null,
                            leg && leg.meters > 0 ? `${number(leg.meters / 1000, 1)} km desde ${leg.from === 'Salida' ? 'la salida' : leg.from}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                    </span>
                  </span>
                  <Pill tone={state === 'done' ? 'green' : state === 'unloading' ? 'amber' : 'grey'}>{STOP_STATE_LABEL[state]}</Pill>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {trip.source === 'app' && (
        <div className="grid-2">
          <Card title={`Remitos (${documents.length})`}>
            {documents.length === 0 ? (
              <p className="note">El chofer no cargó remitos en este viaje.</p>
            ) : (
              <ul className="item-list">
                {documents.map((d) => (
                  <li key={d.id}>
                    <span className="item-main">
                      <strong>{documentLabel(d)}</strong>
                      {d.stop_id && stops.some((st) => st.id === d.stop_id) && <span>Parada: {stopTitle(stops.find((st) => st.id === d.stop_id) as (typeof stops)[number])}</span>}
                      <span>{[d.cargo_type || null, d.kg === null ? null : `${number(d.kg, 0)} kg`].filter(Boolean).join(' · ') || 'Sin datos de carga'}</span>
                    </span>
                    {d.object_path ? (
                      <button type="button" className="btn btn-quiet" onClick={() => setPhoto({ bucket: 'trf-trip-documents', path: d.object_path as string, title: documentLabel(d) })}>
                        Ver foto
                      </button>
                    ) : (
                      <span className="muted">Sin foto</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Combustible en el viaje (${fuel.length})`}>
            {fuel.length === 0 ? (
              <p className="note">No hay cargas de combustible asociadas a este viaje.</p>
            ) : (
              <ul className="item-list">
                {fuel.map((f) => (
                  <li key={f.id}>
                    <span className="item-main">
                      <strong>{f.station ?? 'Estación sin indicar'}</strong>
                      <span>{[f.date ? formatDay(f.date) : null, f.liters === null ? null : `${number(f.liters, 1)} L`, f.total === null ? null : money(f.total, f.currency)].filter(Boolean).join(' · ')}</span>
                    </span>
                    {f.objectPath ? (
                      <button type="button" className="btn btn-quiet" onClick={() => setPhoto({ bucket: 'trf-fuel-receipts', path: f.objectPath as string, title: `Boleta de ${f.station ?? 'combustible'}` })}>
                        Ver boleta
                      </button>
                    ) : (
                      <span className="muted">Sin foto</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <Card
        title={`Gastos del viaje (${tripExpenses.length})`}
        action={
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setNotice(null);
              setCosting({ expense: null });
            }}
          >
            <Icon name="plus" size={18} /> Anotar un gasto
          </button>
        }
      >
        {costs.query.data === undefined ? (
          costs.query.error ? (
            <ErrorNote onRetry={() => void costs.query.refetch()}>No se pudieron leer los gastos del viaje.</ErrorNote>
          ) : (
            <Skeleton lines={2} />
          )
        ) : tripExpenses.length === 0 ? (
          <p className="note">No hay gastos anotados en este viaje: peajes en efectivo, viáticos, una reparación en el camino… El combustible va con sus boletas.</p>
        ) : (
          <>
            <ul className="item-list">
              {tripExpenses.map((e) => (
                <li key={e.id}>
                  <span className="item-main">
                    <strong>{e.category}</strong>
                    <span>{[formatDay(e.spentOn), e.supplier || null, money(e.amount, e.currency), e.file ? null : 'sin factura'].filter(Boolean).join(' · ')}</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => {
                      setNotice(null);
                      setCosting({ expense: e });
                    }}
                    aria-label={`Corregir ${e.category.toLowerCase()} del ${formatDay(e.spentOn)}`}
                  >
                    Corregir
                  </button>
                </li>
              ))}
            </ul>
            <p className="note">
              En total {amounts(expenseTotals(tripExpenses).amounts)}.{' '}
              <Link className="link" to={expensesLink(`viaje:${trip.key}`)}>
                Ver en Gastos y finanzas
              </Link>
            </p>
          </>
        )}
      </Card>

      <PhotoDialog photo={photo} onClose={() => setPhoto(null)} />
      {costing && (
        <ExpenseFormDialog
          expense={costing.expense}
          origin={costing.expense ? { fixedName: tripName } : { target: 'trip', ref: trip.key, spentOn: calendarDay(trip.arrivalAt ?? trip.departureAt) ?? today, fixedName: tripName }}
          today={today}
          choices={NO_CHOICES}
          names={NO_NAMES}
          expenses={costs.expenses}
          onClose={() => setCosting(null)}
          onDone={(text, tone) => {
            setCosting(null);
            setNotice({ tone: tone ?? 'ok', text });
          }}
          onConflict={() => {
            setCosting(null);
            setNotice({ tone: 'warn', text: 'Otra persona cambió ese gasto mientras lo tenías abierto, y no se guardó nada: ya se ven sus datos nuevos. Revisalo y, si hace falta, volvé a corregirlo.' });
          }}
        />
      )}
      {editing && (
        <TripFormDialog
          trip={trip}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setNotice({ tone: 'ok', text: 'Datos guardados.' });
          }}
          onConflict={() => {
            setEditing(false);
            setNotice({ tone: 'warn', text: CONFLICT });
          }}
        />
      )}
      {binning && (
        <ConfirmDialog title="¿Mandar este viaje a la papelera?" confirmLabel="Mandar a la papelera" danger busy={bin.isPending} onConfirm={() => void setDeleted(true)} onCancel={() => setBinning(false)}>
          <p>
            Deja de contar en la lista y en los totales.{' '}
            {trip.source === 'app' ? 'El recorrido del GPS y lo que mandó el chofer no se borran. ' : ''}Lo podés restaurar cuando quieras desde «Eliminados».
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

export function Viaje() {
  const { key } = useParams();
  const parsed = parseTripKey(key);
  if (!parsed) return <Missing />;
  // A new key is a new page: nothing of the previous trip stays on screen.
  return <TripPage key={key} kind={parsed.kind} id={parsed.id} />;
}
