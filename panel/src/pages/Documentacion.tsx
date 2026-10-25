import { useMemo, useState } from 'react';
import { DocumentFormDialog } from '../components/DocumentFormDialog';
import { Icon } from '../components/Icon';
import { type Photo, PhotoDialog } from '../components/PhotoDialog';
import { CatalogNote, Empty, ErrorNote, PageHead, Pill, RefreshButton, Skeleton, StaleNote, Stat } from '../components/ui';
import { TOO_MANY } from '../data/api';
import { useDocuments, useNow, useVehicles } from '../data/hooks';
import { ago, dayInZone, formatDay, inDays } from '../lib/dates';
import { filterPapers, groupPapers, type Paper, type PaperListView, paperOwner, type PaperStateFilter, paperVehicles, type PaperView, paperViews } from '../lib/documents';
import { count } from '../lib/format';
import { trailerLabel } from '../lib/vehicles';
import { useAddressFilters } from './addressFilters';
import { PAPER_STATE } from './states';

const VIEWS: { value: PaperListView; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'camiones', label: 'Camiones' },
  { value: 'choferes', label: 'Choferes' },
];

const STATES: { value: PaperStateFilter; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'late', label: 'Vencidos' },
  { value: 'soon', label: 'Por vencer' },
  { value: 'ok', label: 'Vigentes' },
  { value: 'nodate', label: 'Sin fecha' },
];

function detail(p: PaperView, today: string): string {
  if (p.expiresOn === null) return 'Sin fecha de vencimiento';
  if (p.state === 'late') return `Venció el ${formatDay(p.expiresOn)} · ${inDays(p.expiresOn, today)}`;
  if (p.state === 'soon') return `Vence el ${formatDay(p.expiresOn)} · ${inDays(p.expiresOn, today)}`;
  return `Vence el ${formatDay(p.expiresOn)}`;
}

function PaperRow({ paper, today, onOpen, onFile }: { paper: PaperView; today: string; onOpen: () => void; onFile: () => void }) {
  const state = PAPER_STATE[paper.state];
  return (
    <li className="paper-row">
      <button type="button" className="pr-open" onClick={onOpen} aria-label={`${paper.kind}, ${paperOwner(paper)}: ${state.label}`}>
        <span className={`sv-icon tone-${state.tone}`}>
          <Icon name={paper.scope === 'vehicle' ? 'truck' : 'person'} size={18} />
        </span>
        <span className="sv-main">
          <strong>{paper.kind || 'Sin tipo'}</strong>
          <small className="sv-detail">{detail(paper, today)}</small>
          {paper.notes && <small className="sv-notes">{paper.notes}</small>}
        </span>
        <Pill tone={state.tone}>{state.label}</Pill>
      </button>
      <span className="pr-file">
        {paper.file ? (
          <button type="button" className="btn btn-quiet" onClick={onFile}>
            <Icon name="doc" size={18} /> {paper.file.type === 'pdf' ? 'Ver PDF' : 'Ver foto'}
          </button>
        ) : (
          <span className="muted">Sin archivo</span>
        )}
      </span>
    </li>
  );
}

export function Documentacion() {
  const now = useNow(60_000);
  const today = dayInZone(now);
  const { params, set, typed, search } = useAddressFilters();
  const { papers, query, catalog } = useDocuments();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Paper | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  const view = VIEWS.find((v) => v.value === params.get('vista')) ?? VIEWS[0]!;
  const state = STATES.find((s) => s.value === params.get('estado')) ?? STATES[0]!;
  const owner = params.get('de') ?? '';
  const views = useMemo(() => paperViews(papers, today), [papers, today]);
  const vehicles = useMemo(() => paperVehicles(papers, catalog.data ?? []), [papers, catalog.data]);
  // The trailers in use (Flota) go apart, after the trucks: their papers are loaded like a truck's.
  const fleetCards = useVehicles();
  const trailers = useMemo(() => fleetCards.vehicles.filter((v) => v.kind === 'trailer' && !v.leftOn).map(trailerLabel).sort((a, b) => a.localeCompare(b, 'es')), [fleetCards.vehicles]);
  const trucks = useMemo(() => vehicles.filter((v) => !trailers.includes(v)), [vehicles, trailers]);
  const shown = useMemo(() => filterPapers(views, { view: view.value, state: state.value, owner, q: typed }), [views, view.value, state.value, owner, typed]);
  const groups = useMemo(() => groupPapers(shown), [shown]);
  // Whose papers there are, to choose one: the trucks first.
  const owners = useMemo(() => groupPapers(views).map((g) => ({ key: g.key, label: `${g.scope === 'vehicle' ? (trailers.includes(g.owner) ? 'Acoplado' : 'Camión') : 'Chofer'}: ${g.owner}` })), [views, trailers]);
  const late = views.filter((p) => p.state === 'late').length;
  const soon = views.filter((p) => p.state === 'soon').length;
  const ok = views.filter((p) => p.state === 'ok').length;
  const noFile = views.filter((p) => !p.file).length;

  const done = (text: string, tone: 'ok' | 'warn' = 'ok') => {
    setAdding(false);
    setEditing(null);
    setNotice({ tone, text });
  };
  const conflict = () => {
    setEditing(null);
    setNotice({ tone: 'warn', text: 'Otra persona cambió o borró ese documento mientras lo tenías abierto, y no se guardó nada: ya se ven los datos nuevos. Revisalo y, si hace falta, volvé a cambiarlo.' });
  };

  const loadedAt = query.dataUpdatedAt || null;
  const loading = query.isLoading || catalog.isLoading;
  // A new paper waits for the trailers too, so a trailer is not missing from the choices without notice.
  const trailersRead = fleetCards.query.data !== undefined || !!fleetCards.query.error;
  const ready = !loading && query.data !== undefined && trailersRead;

  return (
    <div className="page">
      <PageHead
        title="Documentación"
        subtitle="Los papeles de los camiones y de los choferes, con su archivo y su vencimiento. Son los mismos de la app."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)} disabled={!ready}>
            <Icon name="plus" size={18} /> Nuevo documento
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
          <Stat tone={late > 0 ? 'red' : 'green'} icon="warning" label="Vencidos" value={count(late)} />
          <Stat tone="amber" icon="clock" label="Por vencer" value={count(soon)} detail="En los próximos 30 días" />
          <Stat tone="green" icon="check" label="Vigentes" value={count(ok)} />
          <Stat tone="grey" icon="doc" label="Sin archivo" value={count(noFile)} detail={noFile > 0 ? 'Podés subir la foto o el PDF' : 'Todos tienen su archivo'} />
        </div>
      )}

      <section className="card filters" aria-label="Filtros">
        <label className="field field-wide">
          <span>Buscar</span>
          <input type="search" placeholder="Tipo, camión, chofer, notas…" value={typed} onChange={(e) => search(e.target.value)} />
        </label>
        <label className="field">
          <span>Estado</span>
          <select value={state.value} onChange={(e) => set({ estado: e.target.value })}>
            {STATES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>De quién</span>
          <select value={owner} onChange={(e) => set({ de: e.target.value })}>
            <option value="">Todos</option>
            {(owner && !owners.some((o) => o.key === owner) ? [{ key: owner, label: owner.replace(/^\w+:/, '') }, ...owners] : owners).map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="list-bar">
        <div className="chips" role="group" aria-label="Vista">
          {VIEWS.map((v) => (
            <button key={v.value} type="button" className={`chip${view.value === v.value ? ' is-on' : ''}`} aria-pressed={view.value === v.value} onClick={() => set({ vista: v.value === 'todos' ? null : v.value })}>
              {v.label} <span>{count(filterPapers(views, { view: v.value }).length)}</span>
            </button>
          ))}
        </div>
        <div className="list-info">
          {loadedAt !== null && <span className="updated">actualizado {ago(loadedAt, now)}</span>}
          <RefreshButton onClick={() => void query.refetch()} busy={query.isFetching} />
        </div>
      </div>

      {query.error && query.data !== undefined && <StaleNote onRetry={() => void query.refetch()} />}
      {catalog.error && <CatalogNote onRetry={() => void catalog.refetch()} />}
      {fleetCards.query.error && fleetCards.query.data === undefined && (
        <ErrorNote onRetry={() => void fleetCards.query.refetch()}>No se pudieron leer los acoplados de Flota: no aparecen para elegirlos en «Nuevo documento».</ErrorNote>
      )}
      {query.error && query.data === undefined ? (
        <ErrorNote onRetry={() => void query.refetch()}>{(query.error as { code?: string }).code === TOO_MANY ? 'Hay demasiados documentos para leerlos de una vez.' : 'No se pudieron leer los documentos.'}</ErrorNote>
      ) : loading ? (
        <div className="card card-body">
          <Skeleton lines={6} />
        </div>
      ) : groups.length === 0 ? (
        <div className="card">
          <Empty icon="doc" title={papers.length === 0 ? 'Todavía no hay documentos' : 'No hay documentos con esos filtros'}>
            {papers.length === 0 ? 'Cargá el SOA, la patente o la habilitación de cada camión, y la licencia y el carné de salud de cada chofer, con «Nuevo documento».' : 'Probá con otro estado, camión, chofer o búsqueda.'}
          </Empty>
        </div>
      ) : (
        <ul className="paper-groups" aria-label="Documentos">
          {groups.map((g) => (
            <li key={g.key} className="card paper-group">
              <header className="card-head">
                <h2 className="card-title">
                  <Icon name={g.scope === 'vehicle' ? 'truck' : 'person'} size={18} /> {g.owner}
                </h2>
                {owner !== g.key && (
                  <button type="button" className="link-button" onClick={() => set({ de: g.key })}>
                    Ver solo {g.scope === 'vehicle' ? 'este camión' : 'este chofer'}
                  </button>
                )}
              </header>
              <ul className="paper-list" aria-label={`Documentos de ${g.owner}`}>
                {g.papers.map((p) => (
                  <PaperRow
                    key={p.id}
                    paper={p}
                    today={today}
                    onOpen={() => {
                      setNotice(null);
                      setEditing(p);
                    }}
                    onFile={() => p.file && setPhoto({ bucket: 'trf-documents', path: p.file.path, title: `${p.kind} · ${paperOwner(p)}` })}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <p className="note">
        Se marcan por vencer 30 días antes, como en la app. Los archivos quedan en una carpeta privada: los abren las cuentas del panel, y la app los va a mostrar en una próxima versión.
      </p>

      <PhotoDialog photo={photo} onClose={() => setPhoto(null)} />
      {(adding || editing) && (
        <DocumentFormDialog
          paper={editing}
          vehicles={trucks} trailers={trailers}
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

