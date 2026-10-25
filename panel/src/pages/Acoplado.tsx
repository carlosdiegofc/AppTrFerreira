// A trailer's card (Flota, decision of 24/10/2026): its data and photo, the truck it goes on and the ones it went on, and
// its papers, which are loaded in Documentación with its plate. Only the panel accounts read it.
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Icon } from '../components/Icon';
import { type Photo, PhotoDialog } from '../components/PhotoDialog';
import { Card, Empty, ErrorNote, PageHead, Pill, RefreshButton, Skeleton, StaleNote } from '../components/ui';
import { AnnulHitchDialog, VehicleFormDialog, VehicleThumb } from '../components/VehicleDialogs';
import { useCatalog, useDocuments, useNow, useVehicles } from '../data/hooks';
import { dayInZone, formatDay, inDays } from '../lib/dates';
import { paperViews } from '../lib/documents';
import { truckLabel } from '../lib/fleet';
import { andList, number } from '../lib/format';
import { capacityText, cardTruckLabel, type Hitch, hitchDays, makeLine, samePlate, takenKeys, trailerLabel, trailerTrucks, truckKey, type Vehicle } from '../lib/vehicles';
import { type Notice, noticeOf, PapersPill, truckPath } from './Flota';
import { PAPER_STATE } from './states';

function Back() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromList = location.key !== 'default';
  return (
    <button type="button" className="back-link" onClick={() => (fromList ? navigate(-1) : navigate('/flota?vista=acoplados'))}>
      <Icon name="chevron" size={16} className="flip" /> Flota
    </button>
  );
}

const fact = (value: string | null | undefined) => (value ? value : <span className="muted">Sin cargar</span>);

function TrailerPage({ v, now }: { v: Vehicle; now: number }) {
  const today = dayInZone(now);
  const { query, vehicles, hitches } = useVehicles();
  const catalog = useCatalog();
  const docs = useDocuments();
  const [editing, setEditing] = useState<{ kind: 'card' } | { kind: 'annul'; hitch: Hitch } | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const location = useLocation();
  const [notice, setNotice] = useState<Notice | null>(() => noticeOf(location.state));
  const title = trailerLabel(v);
  // How each truck is named: the catalog's name, or its card's when it is no longer in the catalog.
  const names = useMemo(() => {
    const out = new Map<string, string>();
    for (const t of catalog.data ?? []) out.set(truckKey(t), truckLabel(t));
    for (const c of vehicles) if (c.kind === 'truck' && !out.has(c.key)) out.set(c.key, cardTruckLabel(c));
    return out;
  }, [catalog.data, vehicles]);
  const nameOf = (key: string) => names.get(key) ?? key.replace(/^(plate|model):/, '').toUpperCase();
  const history = trailerTrucks(v.id, hitches);
  const papers = paperViews(
    docs.papers.filter((p) => p.scope === 'vehicle' && samePlate(p.vehicle, v.plate)),
    today,
  );
  const capacity = capacityText(v, number);
  // A read that answered before and fails to refresh: what shows is the last one read.
  const stale = [
    { query, what: 'la ficha', stale: query.data !== undefined && !!query.error },
    { query: docs.query, what: 'los papeles', stale: docs.query.data !== undefined && !!docs.query.error },
    { query: catalog, what: 'la lista de camiones de la app', stale: catalog.data !== undefined && !!catalog.error },
  ].filter((r) => r.stale);

  const done = (text: string, tone: 'ok' | 'warn' = 'ok') => {
    setEditing(null);
    setNotice({ tone, text });
  };
  const conflict = () => {
    setEditing(null);
    setNotice({ tone: 'warn', text: 'Otra persona lo cambió mientras lo tenías abierto, y no se guardó nada: ya se ven los datos nuevos. Revisalos y, si hace falta, volvé a cambiarlo.' });
  };

  return (
    <div className="page">
      <Back />
      <PageHead
        title={title}
        subtitle={[makeLine(v), v.leftOn ? `Dado de baja el ${formatDay(v.leftOn)}` : null].filter(Boolean).join(' · ') || undefined}
        actions={
          <>
            <RefreshButton
              onClick={() => {
                void query.refetch();
                void docs.query.refetch();
                void catalog.refetch();
              }}
              busy={query.isFetching || docs.query.isFetching || catalog.isFetching}
            />
            <button
              type="button"
              className="btn"
              onClick={() => {
                setNotice(null);
                setEditing({ kind: 'card' });
              }}
            >
              <Icon name="edit" size={18} /> Editar ficha
            </button>
          </>
        }
      />
      {notice && (
        <p className={`notice notice-${notice.tone}`} role={notice.tone === 'ok' ? 'status' : 'alert'}>
          <Icon name={notice.tone === 'ok' ? 'check' : 'warning'} size={18} /> {notice.text}
        </p>
      )}
      {stale.length > 0 && <StaleNote onRetry={() => stale.forEach((r) => void r.query.refetch())}>No se pudo actualizar: {andList(stale.map((r) => r.what))}. Se ve lo último que se leyó.</StaleNote>}

      <div className="driver-grid">
        <Card title="Datos">
          <div className="vehicle-data">
            <VehicleThumb path={v.photoPath} title={title} onOpen={setPhoto} />
            <dl className="facts facts-tight">
              <div>
                <dt>Tipo</dt>
                <dd>{fact(v.body)}</dd>
              </div>
              <div>
                <dt>Marca y modelo</dt>
                <dd>{fact([v.brand, v.model].filter(Boolean).join(' '))}</dd>
              </div>
              <div>
                <dt>Año</dt>
                <dd>{fact(v.year === null ? null : String(v.year))}</dd>
              </div>
              <div>
                <dt>Matrícula</dt>
                <dd>{v.plate}</dd>
              </div>
              <div>
                <dt>Chasis</dt>
                <dd>{fact(v.chassis)}</dd>
              </div>
              <div>
                <dt>Capacidad de carga</dt>
                <dd>{fact(capacity)}</dd>
              </div>
            </dl>
            {v.notes && <p className="note driver-notes">{v.notes}</p>}
            {v.leftOn && <p className="note">Se dio de baja el {formatDay(v.leftOn)}{v.leftReason ? ` (${v.leftReason.toLowerCase()})` : ''}: la ficha queda guardada, con su historial.</p>}
          </div>
        </Card>

        <Card title="Camión">
          {history.current ? (
            <>
              <p className="vehicle-trailer">
                <Link to={truckPath(history.current.truckKey)}>{nameOf(history.current.truckKey)}</Link>
                <span className="muted">{[hitchDays(history.current), history.current.notes || null].filter(Boolean).join(' · ')}</span>
              </p>
              <p className="vehicle-trailer-actions">
                <button type="button" className="link-button" onClick={() => history.current && setEditing({ kind: 'annul', hitch: history.current })} aria-label={`Anular el enganche en el ${nameOf(history.current.truckKey)}, ${hitchDays(history.current).toLowerCase()}`}>
                  Anular
                </button>
              </p>
            </>
          ) : v.leftOn ? (
            <p className="note">Se dio de baja: ya no va en ningún camión.</p>
          ) : (
            <p className="note">No va en ningún camión. Se engancha desde la ficha del camión.</p>
          )}
          {history.past.length > 0 && (
            <ul className="hitch-list" aria-label="Camiones en los que fue antes">
              {history.past.map((h) => (
                <li key={h.id}>
                  <span>{nameOf(h.truckKey)}</span>
                  <span className="muted">
                    {hitchDays(h)}
                    {h.notes ? ` · ${h.notes}` : ''}
                  </span>
                  <button type="button" className="link-button" onClick={() => setEditing({ kind: 'annul', hitch: h })} aria-label={`Anular el enganche en el ${nameOf(h.truckKey)}, ${hitchDays(h).toLowerCase()}`}>
                    Anular
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Papeles" action={<Link className="link" to={`/documentacion?de=${encodeURIComponent(`vehicle:${title}`)}`}>Ir a Documentación</Link>}>
          {docs.query.data === undefined ? (
            docs.query.error ? (
              <ErrorNote onRetry={() => void docs.query.refetch()}>No se pudieron leer los papeles.</ErrorNote>
            ) : (
              <Skeleton lines={3} />
            )
          ) : papers.length === 0 ? (
            <p className="note">Todavía no tiene papeles. Se cargan en Documentación: «De un camión», eligiendo este acoplado.</p>
          ) : (
            <>
              <ul className="driver-papers">
                {papers.map((p) => (
                  <li key={p.id}>
                    <span>{p.kind || 'Sin tipo'}</span>
                    <span className="muted">{p.expiresOn ? `${p.state === 'late' ? 'Venció' : 'Vence'} el ${formatDay(p.expiresOn)}${p.state === 'late' || p.state === 'soon' ? ` · ${inDays(p.expiresOn, today)}` : ''}` : 'Sin vencimiento'}</span>
                    <Pill tone={PAPER_STATE[p.state].tone}>{PAPER_STATE[p.state].label}</Pill>
                  </li>
                ))}
              </ul>
              <p className="hint">
                <PapersPill papers={papers} />
              </p>
            </>
          )}
        </Card>
      </div>

      <PhotoDialog photo={photo} onClose={() => setPhoto(null)} />
      {editing?.kind === 'card' && (
        <VehicleFormDialog
          vehicle={v}
          kind="trailer"
          truck={null}
          label={v.plate}
          taken={(except) => takenKeys(vehicles, catalog.data ?? [], except)}
          today={today}
          hitched={history.current ? { what: `Va en el ${nameOf(history.current.truckKey)}`, fromOn: history.current.fromOn } : null}
          history={history}
          onClose={() => setEditing(null)}
          onDone={done}
          onConflict={conflict}
        />
      )}
      {editing?.kind === 'annul' && <AnnulHitchDialog hitch={editing.hitch} what={`${title} en el ${nameOf(editing.hitch.truckKey)}`} onClose={() => setEditing(null)} onDone={done} onConflict={conflict} />}
    </div>
  );
}

export function Acoplado() {
  const { id } = useParams();
  const now = useNow(60_000);
  const { query, vehicles } = useVehicles();
  const v = vehicles.find((x) => x.id === id && x.kind === 'trailer');
  // A card just created may not be in the list read before: wait for the list read again.
  if (query.isLoading || (!v && query.isFetching)) {
    return (
      <div className="page">
        <Back />
        <div className="card card-body">
          <Skeleton lines={8} />
        </div>
      </div>
    );
  }
  if (query.error && query.data === undefined) {
    return (
      <div className="page">
        <Back />
        <ErrorNote onRetry={() => void query.refetch()}>No se pudo leer la ficha.</ErrorNote>
      </div>
    );
  }
  if (!v) {
    return (
      <div className="page">
        <Back />
        <div className="card">
          <Empty icon="box" title="No encontramos ese acoplado">
            Puede que la dirección esté mal escrita. <Link className="link" to="/flota?vista=acoplados">Ver todos los acoplados</Link>
          </Empty>
        </div>
      </div>
    );
  }
  return <TrailerPage key={v.id} v={v} now={now} />;
}
