import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Icon } from '../components/Icon';
import { type Photo, PhotoDialog } from '../components/PhotoDialog';
import { TripMap } from '../components/TripMap';
import { Card, Empty, ErrorNote, PageHead, Pill, RefreshButton, Skeleton } from '../components/ui';
import { useCatalog, useRoute, useTripDetail } from '../data/hooks';
import { formatDay, formatDayTime, formatDuration } from '../lib/dates';
import { count, money, number } from '../lib/format';
import { documentLabel, sourceLabel, tripFacts } from '../lib/tripTable';
import { fuelFromReceipt, parseTripKey, routeStats } from '../lib/trips';
import { STATUS_TONE } from './states';

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
  const { trip, detail } = useTripDetail(kind, id);
  const catalog = useCatalog();
  const session = detail.data?.session ?? null;
  const route = useRoute(session ? { id: session.id, driver_id: session.driver_id, started_at: session.started_at, ended_at: session.ended_at } : null);
  const stats = useMemo(() => (route.data ? routeStats(route.data) : null), [route.data]);
  const fuel = useMemo(() => (detail.data?.fuel ?? []).map((f) => fuelFromReceipt(f, catalog.data ?? [])), [detail.data, catalog.data]);
  const documents = detail.data?.documents ?? [];
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);

  if (detail.isLoading) {
    return (
      <div className="page">
        <Back />
        <div className="card card-body">
          <Skeleton lines={8} />
        </div>
      </div>
    );
  }
  if (detail.error) {
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
      const day = trip.departureAt ? trip.departureAt.slice(0, 10) : 'sin-fecha';
      await downloadTripPdf(trip, { documents, fuel, stats }, `viaje_${day}_${trip.orderNumber ?? trip.key.slice(4, 12)}`);
    } catch (e) {
      console.error(e);
      setPdfFailed(true);
    } finally {
      setPdfBusy(false);
    }
  };

  const live = trip.active;
  const title = trip.orderNumber ? `Orden de carga ${trip.orderNumber}` : `Viaje de ${trip.driverName ?? 'chofer sin indicar'}`;
  const facts = tripFacts(trip);

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
            <RefreshButton onClick={() => void Promise.all([detail.refetch(), route.refetch()])} busy={detail.isFetching || route.isFetching} />
          </>
        }
      />
      {pdfFailed && <ErrorNote>No se pudo armar el PDF. Probá de nuevo.</ErrorNote>}

      <div className="trip-status">
        <Pill tone={STATUS_TONE[trip.status.code]}>{trip.status.label}</Pill>
        {trip.deleted && trip.deletedAt && <span>Está en la papelera desde el {formatDay(trip.deletedAt.slice(0, 10))}: no cuenta en los totales.</span>}
        {!trip.deleted && trip.status.missing.length > 0 && <span>Falta completar: {trip.status.missing.join(', ')}.</span>}
      </div>

      <div className="grid-2 trip-grid">
        <Card title="Orden de carga">
          <dl className="facts order-facts">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
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

        <Card title="Recorrido" padded={false} action={live ? <Pill tone="blue">En vivo · se actualiza cada 30 s</Pill> : undefined}>
          {trip.source === 'manual' && !trip.origin && !trip.destination ? (
            <div className="card-body">
              <Empty icon="route" title="Sin recorrido">Este viaje se cargó a mano: no tiene recorrido del GPS.</Empty>
            </div>
          ) : (
            <>
              <TripMap route={route.data ?? null} start={trip.gpsStart ?? trip.origin} end={trip.gpsEnd ?? trip.destination} live={live} label="Mapa del recorrido del viaje" />
              {trip.source === 'app' && (
                <dl className="facts facts-tight route-facts">
                  <div><dt>Puntos del recorrido</dt><dd>{stats ? count(stats.count) : '…'}</dd></div>
                  <div><dt>Duración</dt><dd>{stats?.durationMs != null ? formatDuration(stats.durationMs) : '—'}</dd></div>
                  <div><dt>Velocidad máxima</dt><dd>{stats?.maxSpeedKmh != null ? `${number(stats.maxSpeedKmh)} km/h` : '—'}</dd></div>
                </dl>
              )}
            </>
          )}
        </Card>
      </div>

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
                      <span>{[f.date ? formatDay(f.date.slice(0, 10)) : null, f.liters === null ? null : `${number(f.liters, 1)} L`, f.total === null ? null : money(f.total, f.currency)].filter(Boolean).join(' · ')}</span>
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

      <PhotoDialog photo={photo} onClose={() => setPhoto(null)} />
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
