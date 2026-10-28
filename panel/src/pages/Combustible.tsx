import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigationType, useSearchParams } from 'react-router';
import { Icon } from '../components/Icon';
import { MovementFormDialog } from '../components/MovementFormDialog';
import { type Photo, PhotoDialog } from '../components/PhotoDialog';
import { ReceiptFormDialog } from '../components/ReceiptFormDialog';
import { CatalogNote, Empty, ErrorNote, PageHead, Pill, RefreshButton, Skeleton, StaleNote, Stat } from '../components/ui';
import { ConflictError, describeWriteError } from '../data/api';
import { useFuel, useNow, useUpdateReceipt } from '../data/hooks';
import { moneyTrend, type PeriodName, periodBefore, trend } from '../lib/change';
import { ago, dayInZone, formatDay } from '../lib/dates';
import { count, decimal, money } from '../lib/format';
import { balances, filterReceipts, isFuture, NO_STATION, type Receipt, receiptVehicles, type Station, totals } from '../lib/fuel';
import { type PeriodKind, periodRange } from '../lib/trips';
import { lowTanks, useTanks } from '../data/tanks';
import { amountParts, amounts, balanceText, balanceTone, fuelReadError, NO_LIST, stationPath } from './fuelText';
import { TanksView } from './Tanques';

// The filters live in the address (?vista=boletas&periodo=mes…): going back from a station, reloading or sharing the
// link keeps them.
const PERIODS: { value: string; kind: PeriodKind | 'all'; label: string }[] = [
  { value: '30', kind: '30', label: 'Últimos 30 días' },
  { value: 'mes', kind: 'month', label: 'Este mes' },
  { value: 'mes-anterior', kind: 'prev-month', label: 'Mes anterior' },
  { value: '90', kind: '90', label: 'Últimos 90 días' },
  { value: 'todo', kind: 'all', label: 'Todo' },
  { value: 'fechas', kind: 'custom', label: 'Elegir fechas…' },
];

const VIEWS = [
  { value: 'estaciones', label: 'Por estación' },
  { value: 'boletas', label: 'Boletas' },
  { value: 'papelera', label: 'Papelera' },
  { value: 'tanques', label: 'Tanques' },
] as const;

const withChosen = (values: string[], chosen: string) => (chosen && !values.includes(chosen) ? [chosen, ...values] : values);

/** Each currency on its own line. */
const Lines = ({ parts }: { parts: string[] }) => (
  <span className="amount-lines">
    {parts.map((p) => (
      <span key={p}>{p}</span>
    ))}
  </span>
);

function StationRow({ station, period }: { station: Station; period: Receipt[] }) {
  const t = totals(period);
  return (
    <li>
      <Link className="fuel-station" to={stationPath(station.key)}>
        <span className="fs-name">
          <strong>{station.name}</strong>
          <small>{[station.listed ? 'De la lista de la app' : station.key === NO_STATION ? 'Boletas sin estación' : 'Escrita a mano', station.lastDay ? `última carga el ${formatDay(station.lastDay)}` : 'sin cargas'].join(' · ')}</small>
        </span>
        <span className="fs-period">
          <strong>{t.receipts > 0 ? amounts(t.amounts, 'Sin importe') : 'Sin cargas en el período'}</strong>
          {t.receipts > 0 && <small>{`${count(t.receipts)} boleta${t.receipts === 1 ? '' : 's'} · ${decimal(t.liters, 1)} L en el período`}</small>}
        </span>
        <span className="fs-balance">
          {station.accounts.length === 0 ? (
            <small>{station.key === NO_STATION ? 'No suma en ninguna cuenta' : 'Sin cuenta todavía'}</small>
          ) : (
            station.accounts.map((a) => (
              <Pill key={a.currency} tone={balanceTone(a)}>
                {balanceText(a)}
              </Pill>
            ))
          )}
        </span>
        <Icon name="chevron" size={18} className="fs-go" />
      </Link>
    </li>
  );
}

function ReceiptRow({ receipt, stationName, today, onOpen, onPhoto, action }: { receipt: Receipt; stationName: string; today: string; onOpen?: () => void; onPhoto: () => void; action?: ReactNode }) {
  // Under the date, so that it shows on a phone too.
  const future = !receipt.archived && isFuture(receipt, today);
  const body = (
    <>
      <span className={`fr-date${future ? ' is-future' : ''}`}>
        <strong>{receipt.date ? formatDay(receipt.date) : 'Sin fecha'}</strong>
        <small>{future ? 'Fecha futura' : receipt.tripId ? 'En un viaje' : 'Sin viaje'}</small>
      </span>
      <span className="fr-station">
        <strong>{stationName}</strong>
        <small>{[receipt.driverName, receipt.vehicle].filter(Boolean).join(' · ') || 'Sin camión'}</small>
      </span>
      <span className="fr-amount">
        <strong>{receipt.total === null ? 'Sin importe' : money(receipt.total, receipt.currency)}</strong>
        <small>{receipt.liters === null ? '— L' : `${decimal(receipt.liters, 2)} L`}</small>
      </span>
      <span className="fr-flags">
        {receipt.fullTank && <Pill tone="green">Tanque lleno</Pill>}
        {receipt.updatedAt && !receipt.archived && <Pill tone="blue">Corregida</Pill>}
      </span>
    </>
  );
  return (
    <li className="fuel-receipt">
      {onOpen ? (
        <button type="button" className="fr-open" onClick={onOpen} aria-label={`Boleta del ${receipt.date ? formatDay(receipt.date) : 'día sin indicar'} en ${stationName}`}>
          {body}
        </button>
      ) : (
        <div className="fr-open">{body}</div>
      )}
      <span className="fr-actions">
        {receipt.objectPath ? (
          <button type="button" className="btn btn-quiet" onClick={onPhoto}>
            Ver boleta
          </button>
        ) : (
          <span className="muted">Sin foto</span>
        )}
        {receipt.tripId && (
          <Link className="link" to={`/viajes/app:${receipt.tripId}`}>
            Ver viaje
          </Link>
        )}
        {action}
      </span>
    </li>
  );
}

export function Combustible() {
  const now = useNow(30_000);
  const today = dayInZone(now);
  const [params, setParams] = useSearchParams();
  const { receipts, stations, catalogStations, query, catalog, lists } = useFuel();
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState<Receipt | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const restore = useUpdateReceipt();
  const tanks = useTanks();
  const low = lowTanks(tanks.rows);

  const view = VIEWS.find((v) => v.value === params.get('vista')) ?? VIEWS[0];
  const period = PERIODS.find((p) => p.value === params.get('periodo')) ?? PERIODS[0]!;
  const range = period.kind === 'all' ? null : period.kind === 'custom' ? { from: params.get('desde') ?? today, to: params.get('hasta') ?? today } : periodRange(period.kind, today);
  const badRange = range !== null && range.to < range.from;
  // The search box keeps its own text and the address follows it; an address that comes from elsewhere (the side menu,
  // a link, going back or forward) brings its own search.
  const location = useLocation();
  const q = params.get('buscar') ?? '';
  const [typed, setTyped] = useState(q);
  const fromHere = useNavigationType() === 'REPLACE' && (location.state as { filters?: boolean } | null)?.filters === true;
  useEffect(() => {
    if (!fromHere) setTyped(q);
  }, [location.key, fromHere, q]);
  const vehicle = params.get('camion') ?? '';
  const station = params.get('estacion') ?? '';

  // The router updates the address in the background: changes made before it does build on each other.
  const pending = useRef<URLSearchParams | null>(null);
  useEffect(() => {
    pending.current = null;
  }, [params]);
  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(pending.current ?? params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    pending.current = next;
    setParams(next, { replace: true, state: { filters: true } });
  };

  // "Todo" has no days: every receipt counts.
  const from = badRange ? undefined : range?.from;
  const to = badRange ? undefined : range?.to;
  const names = useMemo(() => new Map(stations.map((s) => [s.key, s.name])), [stations]);
  const nameOf = (r: Receipt) => names.get(r.stationKey) ?? r.station ?? 'Estación sin indicar';
  // Dates the wrong way round give no period at all, not every receipt.
  const inPeriod = useMemo(() => (badRange ? [] : filterReceipts(receipts, { from, to })), [receipts, from, to, badRange]);
  const shown = useMemo(() => filterReceipts(receipts, { from, to, q: typed, vehicle, station, bin: view.value === 'papelera', names }), [receipts, from, to, typed, vehicle, station, view.value, names]);
  const byStation = useMemo(() => {
    const map = new Map<string, Receipt[]>();
    for (const r of inPeriod) map.set(r.stationKey, [...(map.get(r.stationKey) ?? []), r]);
    return map;
  }, [inPeriod]);
  // The trash also offers the stations whose receipts are all in it (the stations are made without them); a station
  // chosen there stays in the list after leaving it.
  const stationChoices = useMemo(() => {
    const choices = stations.map((s) => ({ key: s.key, name: s.name }));
    const known = new Set(choices.map((c) => c.key));
    for (const r of receipts) {
      if (!r.archived || known.has(r.stationKey) || (view.value !== 'papelera' && r.stationKey !== station)) continue;
      known.add(r.stationKey);
      choices.push({ key: r.stationKey, name: r.station || 'Estación sin indicar' });
    }
    return choices;
  }, [stations, receipts, view.value, station]);
  const periodTotals = totals(inPeriod);
  // The period before, of the same length, for «↑ 6 % más que setiembre».
  const before = useMemo(() => (from && to ? periodBefore(period.value as PeriodName, { from, to }, today) : null), [period.value, from, to, today]);
  const totalsBefore = useMemo(() => (before ? totals(filterReceipts(receipts, { from: before.from, to: before.to })) : null), [receipts, before]);
  // A period that goes on after today compares only up to today, as the period before is cut on the same day: a receipt
  // dated later shows in the period but not in the change.
  const totalsSoFar = useMemo(() => (before && to && before.upTo < to ? totals(filterReceipts(receipts, { from, to: before.upTo })) : null), [receipts, before, from, to]);
  const { owed, credit } = balances(stations);
  const missing = receipts.filter((r) => !r.archived && r.total === null).length;
  const future = receipts.filter((r) => !r.archived && isFuture(r, today)).length;
  const binned = receipts.filter((r) => r.archived).length;
  // The periods end today: only «Todo» without other filters shows the receipts dated after it.
  const showingAll = view.value === 'boletas' && period.kind === 'all' && !typed && !vehicle && !station;
  const showFuture = () => {
    setTyped('');
    set({ vista: 'boletas', periodo: 'todo', desde: null, hasta: null, buscar: null, camion: null, estacion: null });
  };
  const shownTotals = totals(shown);
  const written = useMemo(() => stations.filter((s) => !s.listed && s.key !== NO_STATION).map((s) => s.name), [stations]);

  const done = (text: string) => {
    setAdding(false);
    setPaying(false);
    setEditing(null);
    setNotice({ tone: 'ok', text });
  };
  const conflict = () => {
    setEditing(null);
    setPaying(false);
    setNotice({ tone: 'warn', text: 'Otra persona cambió esa boleta mientras la tenías abierta, y no se guardó nada: ya se ven sus datos nuevos. Revisala y, si hace falta, volvé a corregirla.' });
  };
  const restoreReceipt = async (r: Receipt) => {
    setNotice(null);
    try {
      await restore.mutateAsync({ receipt: r, changes: { archived: false } });
      setNotice({ tone: 'ok', text: 'Boleta restaurada: vuelve a contar en los totales y en la cuenta de la estación.' });
    } catch (err) {
      console.error(err);
      setNotice(err instanceof ConflictError ? { tone: 'warn', text: 'Otra persona cambió esa boleta: ya se ven sus datos nuevos.' } : { tone: 'error', text: describeWriteError(err, 'boletas') });
    }
  };

  const loadedAt = query.dataUpdatedAt || null;
  const loading = query.isLoading || catalog.isLoading || lists.isLoading;
  // Without the app's list of stations, receipts that name a listed station would make an account of their own.
  const noList = lists.error !== null && lists.data === undefined;
  const ready = !loading && query.data !== undefined && !noList;

  return (
    <div className="page">
      <PageHead
        title="Combustible"
        subtitle="Las boletas de la app y las cargadas acá, agrupadas por estación, con la cuenta de cada una."
        actions={
          <>
            <button type="button" className="btn" onClick={() => setPaying(true)} disabled={!ready}>
              <Icon name="money" size={18} /> Registrar pago
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)} disabled={!ready}>
              <Icon name="plus" size={18} /> Nueva boleta
            </button>
          </>
        }
      />
      {notice && (
        <p className={`notice notice-${notice.tone}`} role={notice.tone === 'ok' ? 'status' : 'alert'}>
          <Icon name={notice.tone === 'ok' ? 'check' : 'warning'} size={18} /> {notice.text}
        </p>
      )}
      {low.length > 0 && view.value !== 'tanques' && (
        <p className="notice notice-warn notice-with-action notice-fuel">
          <Icon name="fuel" size={18} />
          <span>Combustible bajo: {low.map((t) => `${t.settings.name} (≈ ${decimal(t.liters, 0)} L)`).join(', ')}.</span>
          <button type="button" className="link-button notice-action" onClick={() => set({ vista: 'tanques' })}>
            Ver los tanques
          </button>
        </p>
      )}
      {future > 0 && (
        <p className="notice notice-warn notice-with-action">
          <Icon name="warning" size={18} />
          <span>{future === 1 ? 'Una boleta tiene fecha posterior a hoy y ya suma en la cuenta de su estación: abrila y corregí la fecha.' : `${count(future)} boletas tienen fecha posterior a hoy y ya suman en la cuenta de su estación: abrilas y corregí la fecha.`}</span>
          {!showingAll && (
            <button type="button" className="link-button notice-action" onClick={showFuture}>
              {future === 1 ? 'Ver la boleta' : 'Ver las boletas'}
            </button>
          )}
        </p>
      )}

      {ready && (
        <div className="stats stats-money">
          <Stat
            featured
            label="Cargado en el período"
            value={badRange ? '—' : <Lines parts={amountParts(periodTotals.amounts, '$ 0')} />}
            detail={badRange ? 'Revisá las fechas' : `${count(periodTotals.receipts)} boleta${periodTotals.receipts === 1 ? '' : 's'}`}
            trend={before && totalsBefore ? moneyTrend((totalsSoFar ?? periodTotals).amounts, totalsBefore.amounts, before.than, 'down') : null}
            tone="blue"
            icon="fuel"
          />
          <Stat
            label="Litros en el período"
            value={badRange ? '—' : decimal(periodTotals.liters, 1)}
            trend={before && totalsBefore ? trend((totalsSoFar ?? periodTotals).liters, totalsBefore.liters, before.than, 'neither') : null}
            tone="grey"
            icon="chart"
          />
          <Stat label="Saldo con las estaciones" value={<Lines parts={amountParts(owed, '$ 0')} />} detail={credit.UYU > 0 || credit.USD > 0 ? `Lo que se les debe · a favor: ${amounts(credit)}` : 'Lo que se les debe'} tone={owed.UYU > 0 || owed.USD > 0 ? 'amber' : 'green'} icon="money" />
          <Stat label="Boletas sin importe" value={count(missing)} detail={missing > 0 ? 'Completalas para que sumen' : 'Todas tienen importe'} tone={missing > 0 ? 'red' : 'green'} icon="warning" />
        </div>
      )}

      {view.value !== 'tanques' && (
      <section className="card filters" aria-label="Filtros">
        <label className="field">
          <span>Período</span>
          <select
            value={period.value}
            onChange={(e) => (e.target.value === 'fechas' ? set({ periodo: 'fechas', desde: range?.from ?? today, hasta: range?.to ?? today }) : set({ periodo: e.target.value === '30' ? null : e.target.value, desde: null, hasta: null }))}
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {period.kind === 'custom' && range && (
          <>
            <label className="field">
              <span>Desde</span>
              <input type="date" value={range.from} max={range.to} onChange={(e) => set({ desde: e.target.value })} />
            </label>
            <label className="field">
              <span>Hasta</span>
              <input type="date" value={range.to} min={range.from} onChange={(e) => set({ hasta: e.target.value })} />
            </label>
          </>
        )}
        {view.value !== 'estaciones' && (
          <>
            <label className="field field-wide">
              <span>Buscar</span>
              <input
                type="search"
                placeholder="Estación, chofer, camión…"
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                  set({ buscar: e.target.value });
                }}
              />
            </label>
            <label className="field">
              <span>Estación</span>
              <select value={station} onChange={(e) => set({ estacion: e.target.value })}>
                <option value="">Todas las estaciones</option>
                {stationChoices.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Camión</span>
              <select value={vehicle} onChange={(e) => set({ camion: e.target.value })}>
                <option value="">Todos los camiones</option>
                {withChosen(receiptVehicles(receipts), vehicle).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </section>
      )}

      <div className="list-bar">
        <div className="chips" role="group" aria-label="Vista">
          {VIEWS.map((v) => (
            <button key={v.value} type="button" className={`chip${view.value === v.value ? ' is-on' : ''}`} aria-pressed={view.value === v.value} onClick={() => set({ vista: v.value === 'estaciones' ? null : v.value })}>
              {v.label}{' '}
              <span>{v.value === 'tanques' ? (tanks.rows ? count(tanks.rows.length) : '—') : count(v.value === 'estaciones' ? stations.length : v.value === 'papelera' ? binned : receipts.length - binned)}</span>
            </button>
          ))}
        </div>
        <div className="list-info">
          {loadedAt !== null && <span className="updated">actualizado {ago(loadedAt, now)}</span>}
          <RefreshButton onClick={() => (view.value === 'tanques' ? tanks.refetch() : void query.refetch())} busy={view.value === 'tanques' ? tanks.isFetching : query.isFetching} />
        </div>
      </div>

      {query.error && query.data !== undefined && <StaleNote onRetry={() => void query.refetch()} />}
      {catalog.error && <CatalogNote onRetry={() => void catalog.refetch()} />}
      {lists.error && !noList && <StaleNote onRetry={() => void lists.refetch()}>No se pudo actualizar la lista de estaciones de la app: se usa la que se leyó antes.</StaleNote>}
      {view.value === 'tanques' ? (
        <TanksView />
      ) : badRange ? (
        <ErrorNote>Revisá las fechas: «hasta» no puede ser antes de «desde».</ErrorNote>
      ) : query.error && query.data === undefined ? (
        <ErrorNote onRetry={() => void query.refetch()}>{fuelReadError(query.error)}</ErrorNote>
      ) : noList ? (
        <ErrorNote onRetry={() => void lists.refetch()}>{NO_LIST}</ErrorNote>
      ) : loading ? (
        <div className="card card-body">
          <Skeleton lines={6} />
        </div>
      ) : view.value === 'estaciones' ? (
        stations.length === 0 ? (
          <div className="card">
            <Empty icon="fuel" title="Todavía no hay boletas ni estaciones">
              Las boletas que carguen los choferes en la app aparecen solas. También podés cargar una con «Nueva boleta».
            </Empty>
          </div>
        ) : (
          <ul className="card fuel-stations" aria-label="Estaciones">
            {stations.map((s) => (
              <StationRow key={s.key} station={s} period={byStation.get(s.key) ?? []} />
            ))}
          </ul>
        )
      ) : shown.length === 0 ? (
        <div className="card">
          <Empty icon="fuel" title={view.value === 'papelera' ? 'No hay boletas en la papelera en este período' : 'No hay boletas en este período'}>
            {q || vehicle || station ? 'Probá con otra estación, camión o búsqueda.' : null}
          </Empty>
        </div>
      ) : (
        <>
          <p className="list-total">
            {count(shownTotals.receipts)} boleta{shownTotals.receipts === 1 ? '' : 's'} · {decimal(shownTotals.liters, 1)} L · {amounts(shownTotals.amounts, '$ 0')}
            {shownTotals.withoutAmount > 0 ? ` · ${count(shownTotals.withoutAmount)} sin importe` : ''}
          </p>
          <ul className="card fuel-receipts" aria-label={view.value === 'papelera' ? 'Boletas en la papelera' : 'Boletas'}>
            {shown.map((r) => (
              <ReceiptRow
                key={r.id}
                receipt={r}
                stationName={nameOf(r)}
                today={today}
                onOpen={view.value === 'papelera' ? undefined : () => {
                  setNotice(null);
                  setEditing(r);
                }}
                onPhoto={() => setPhoto({ bucket: 'trf-fuel-receipts', path: r.objectPath as string, title: `Boleta de ${nameOf(r)}` })}
                action={
                  view.value === 'papelera' ? (
                    <button type="button" className="btn btn-quiet" disabled={restore.isPending} onClick={() => void restoreReceipt(r)}>
                      <Icon name="undo" size={18} /> Restaurar
                    </button>
                  ) : undefined
                }
              />
            ))}
          </ul>
        </>
      )}

      <PhotoDialog photo={photo} onClose={() => setPhoto(null)} />
      {(adding || editing) && (
        <ReceiptFormDialog
          receipt={editing}
          today={today}
          stations={catalogStations}
          writtenStations={written}
          trucks={catalog.data ?? []}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onDone={done}
          onConflict={conflict}
        />
      )}
      {paying && <MovementFormDialog kind="payment" movement={null} station={station} stations={stations} today={today} onClose={() => setPaying(false)} onDone={done} onConflict={conflict} />}
    </div>
  );
}
