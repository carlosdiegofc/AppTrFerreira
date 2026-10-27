// Cobros (decisions of 26/10/2026 and 27/10/2026), in Gastos y finanzas: each client's account, like a station's in
// Combustible: what its trips billed adds and what it paid subtracts, from an opening balance with its date. The list of
// clients with what each owes, the collections of a period and the annulled ones, to bring them back. The filters live
// in the address (?vista=cobros&periodo=mes…): going back from a client, reloading or sharing the link keeps them.
import { type ReactNode, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CollectionFormDialog } from '../components/CollectionFormDialog';
import { FinanceTabs } from '../components/FinanceTabs';
import { Icon } from '../components/Icon';
import { Empty, ErrorNote, PageHead, Pill, RefreshButton, Skeleton, StaleNote, Stat } from '../components/ui';
import { ConflictError, DataError, describeWriteError } from '../data/api';
import { useClients, useNow, useSetClientMovementDeleted } from '../data/hooks';
import { billedAmount, billedInPeriod, type Client, clientBalances, type ClientMovement, collectionTotals, filterClients, filterCollections, NO_CLIENT, periodSums, withoutAmount } from '../lib/clients';
import { ago, dayInZone, formatDay } from '../lib/dates';
import { count, money } from '../lib/format';
import { useAddressFilters } from './addressFilters';
import { clientBalanceText, clientBalanceTone, clientPath, clientsReadError, methodText } from './clientText';
import { PERIODS, rangeOf } from './financePeriods';
import { amountParts, amounts } from './fuelText';

const VIEWS = [
  { value: 'clientes', label: 'Clientes' },
  { value: 'cobros', label: 'Cobros' },
  { value: 'anulados', label: 'Anulados' },
] as const;

const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;

/** Each currency on its own line. */
const Lines = ({ parts }: { parts: string[] }) => (
  <span className="amount-lines">
    {parts.map((p) => (
      <span key={p}>{p}</span>
    ))}
  </span>
);

/** A client with what it was billed and paid in the period and its balance: the same rows as the stations of Combustible. */
function ClientRow({ client, from, to }: { client: Client; from?: string; to?: string }) {
  const none = client.key === NO_CLIENT;
  const billed = billedInPeriod(client.trips, from, to);
  const paid = none ? null : periodSums([client], from, to);
  const pending = client.accounts.reduce((n, a) => n + a.withoutAmount, 0);
  const running = client.trips.filter((t) => t.active && billedAmount(t) === null).length;
  const origin = client.listed ? 'De la lista de la app' : none ? 'Viajes facturados que no dicen el cliente' : 'Escrito en los viajes';
  return (
    <li>
      <Link className="fuel-station" to={clientPath(client.key)}>
        <span className="fs-name">
          <strong>{client.name}</strong>
          <small>{[origin, client.lastTrip ? `último viaje el ${formatDay(client.lastTrip)}` : 'sin viajes'].join(' · ')}</small>
        </span>
        <span className="fs-period">
          <strong>{billed.trips > 0 ? amounts(billed.billed) : 'Sin viajes facturados en el período'}</strong>
          <small>
            {[
              billed.trips > 0 ? plural(billed.trips, 'viaje', 'viajes') : null,
              paid && paid.payments > 0 ? `cobrado ${amounts(paid.paid)}` : null,
              pending > 0 ? plural(pending, 'viaje sin importe', 'viajes sin importe') : null,
              running > 0 ? plural(running, 'viaje en curso', 'viajes en curso') : null,
            ]
              .filter(Boolean)
              .join(' · ') || ' '}
          </small>
        </span>
        <span className="fs-balance">
          {client.accounts.length === 0 ? (
            <small>{none ? 'No suma en ninguna cuenta' : 'Sin movimientos todavía'}</small>
          ) : (
            client.accounts.map((a) => (
              <Pill key={a.currency} tone={clientBalanceTone(a)}>
                {clientBalanceText(a)}
              </Pill>
            ))
          )}
        </span>
        <Icon name="chevron" size={18} className="fs-go" />
      </Link>
    </li>
  );
}

/**
 * A collection or an annulled opening balance, as the expenses of Gastos show. An annulled one of a client that has
 * nothing else (one written wrong, say) leads to no account until it is restored.
 */
function CollectionRow({ movement, name, linked, onOpen, action }: { movement: ClientMovement; name: string; linked: boolean; onOpen?: () => void; action?: ReactNode }) {
  const m = movement;
  const opening = m.kind === 'opening';
  const body = (
    <>
      <span className="ex-date">
        <strong>{formatDay(m.day)}</strong>
        <small>{opening ? 'Saldo inicial' : methodText(m)}</small>
      </span>
      <span className="ex-main">
        <strong>{name}</strong>
        <small title={m.notes || undefined}>{m.notes || (opening ? (m.amount < 0 ? 'A favor del cliente' : 'Lo que debía ese día') : 'Cobro')}</small>
      </span>
      <span className="ex-amount">
        <strong>{money(Math.abs(m.amount), m.currency)}</strong>
      </span>
      <span className="ex-flags">{m.deleted && <Pill tone="grey">Anulado</Pill>}</span>
    </>
  );
  return (
    <li className="expense-row">
      {onOpen ? (
        <button type="button" className="ex-open" onClick={onOpen} aria-label={`Cobro del ${formatDay(m.day)} de ${name}`}>
          {body}
        </button>
      ) : (
        <div className="ex-open">{body}</div>
      )}
      <span className="ex-actions">
        {linked && (
          <Link className="link" to={clientPath(m.clientKey)}>
            Ver su cuenta
          </Link>
        )}
        {action}
      </span>
    </li>
  );
}

type Editing = { kind: 'payment' | 'opening'; movement: ClientMovement | null };

export function Cobros() {
  const now = useNow(60_000);
  const today = dayInZone(now);
  const { params, set, typed, search } = useAddressFilters();
  const { clients, movements, query, tripsQuery, lists } = useClients();
  const restore = useSetClientMovementDeleted();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);

  const view = VIEWS.find((v) => v.value === params.get('vista')) ?? VIEWS[0];
  const period = PERIODS.find((p) => p.value === params.get('periodo')) ?? PERIODS[0];
  const range = rangeOf(period.value, today, params);
  const badRange = range !== null && range.to < range.from;
  const from = badRange ? undefined : range?.from;
  const to = badRange ? undefined : range?.to;

  const names = useMemo(() => new Map(clients.map((c) => [c.key, c.name])), [clients]);
  const shownClients = useMemo(() => filterClients(clients, typed), [clients, typed]);
  // Dates the wrong way round give no period at all, not every collection.
  const collections = useMemo(() => (badRange ? [] : filterCollections(movements, { from, to, q: typed, names, annulled: view.value === 'anulados' })), [movements, from, to, typed, names, view.value, badRange]);
  const inPeriod = useMemo(() => (badRange ? [] : filterCollections(movements, { from, to })), [movements, from, to, badRange]);
  const annulled = useMemo(() => (badRange ? [] : filterCollections(movements, { from, to, annulled: true })), [movements, from, to, badRange]);
  const sums = periodSums(clients, from, to);
  const { owed, credit, owing } = clientBalances(clients);
  const missing = withoutAmount(clients);
  const loose = clients.find((c) => c.key === NO_CLIENT)?.trips.length ?? 0;
  const shownTotals = collectionTotals(collections);

  const done = (text: string) => {
    setEditing(null);
    setNotice({ tone: 'ok', text });
  };
  const conflict = () => {
    setEditing(null);
    setNotice({ tone: 'warn', text: 'Otra persona lo cambió mientras lo tenías abierto, y no se guardó nada: ya se ven sus datos nuevos. Revisalos y, si hace falta, volvé a cambiarlo.' });
  };
  const open = (e: Editing) => {
    setNotice(null);
    setEditing(e);
  };
  const restoreMovement = async (m: ClientMovement) => {
    setNotice(null);
    try {
      await restore.mutateAsync({ movement: m, deleted: false });
      setNotice({ tone: 'ok', text: m.kind === 'opening' ? 'Saldo inicial restaurado: la cuenta vuelve a empezar en su fecha.' : 'Cobro restaurado: vuelve a descontar del saldo.' });
    } catch (err) {
      console.error(err);
      setNotice(
        err instanceof ConflictError
          ? { tone: 'warn', text: 'Otra persona lo cambió: ya se ven sus datos nuevos.' }
          : err instanceof DataError && err.code === '23505'
            ? { tone: 'warn', text: `Ese cliente ya tiene otro saldo inicial en ${m.currency === 'USD' ? 'dólares' : 'pesos'}: quitá ese antes de restaurar este.` }
            : { tone: 'error', text: describeWriteError(err, 'cobros') },
      );
    }
  };

  // The app's list of clients too: without it, the clients without trips would show up a moment later.
  const loading = query.isLoading || tripsQuery.isLoading || lists.isLoading;
  const failed = (query.error && query.data === undefined) || (tripsQuery.error && tripsQuery.data === undefined);
  const ready = !loading && query.data !== undefined && tripsQuery.data !== undefined;
  const loadedAt = Math.min(query.dataUpdatedAt || Infinity, tripsQuery.dataUpdatedAt || Infinity);
  const refresh = () => void Promise.all([query.refetch(), tripsQuery.refetch(), lists.refetch()]);

  return (
    <div className="page">
      <PageHead
        title="Gastos y finanzas"
        subtitle="La cuenta de cada cliente: lo facturado en sus viajes suma y lo cobrado resta, desde un saldo inicial con fecha. Pesos y dólares por separado."
        actions={
          <>
            <button type="button" className="btn" onClick={() => open({ kind: 'opening', movement: null })} disabled={!ready}>
              <Icon name="edit" size={18} /> Saldo inicial
            </button>
            <button type="button" className="btn btn-primary" onClick={() => open({ kind: 'payment', movement: null })} disabled={!ready}>
              <Icon name="money" size={18} /> Registrar cobro
            </button>
          </>
        }
      />
      <FinanceTabs />
      {notice && (
        <p className={`notice notice-${notice.tone}`} role={notice.tone === 'ok' ? 'status' : 'alert'}>
          <Icon name={notice.tone === 'ok' ? 'check' : 'warning'} size={18} /> {notice.text}
        </p>
      )}
      {ready && loose > 0 && (
        <p className="notice notice-warn notice-with-action">
          <Icon name="warning" size={18} />
          <span>{loose === 1 ? 'Un viaje facturado no dice el cliente: no suma en ninguna cuenta hasta que lo completes.' : `${count(loose)} viajes facturados no dicen el cliente: no suman en ninguna cuenta hasta que los completes.`}</span>
          <Link className="link-button notice-action" to={clientPath(NO_CLIENT)}>
            {loose === 1 ? 'Ver el viaje' : 'Ver los viajes'}
          </Link>
        </p>
      )}

      {ready && (
        <div className="stats stats-money">
          <Stat
            featured
            label="A cobrar"
            value={<Lines parts={amountParts(owed, '$ 0')} />}
            detail={[owing > 0 ? `Lo que deben ${plural(owing, 'cliente', 'clientes')}` : 'Ningún cliente debe', credit.UYU > 0 || credit.USD > 0 ? `a favor de clientes: ${amounts(credit)}` : null].filter(Boolean).join(' · ')}
            tone="blue"
            icon="money"
          />
          <Stat label="Facturado en el período" value={badRange ? '—' : <Lines parts={amountParts(sums.billed, '$ 0')} />} detail={badRange ? 'Revisá las fechas' : plural(sums.trips, 'viaje', 'viajes')} tone="grey" icon="route" />
          <Stat label="Cobrado en el período" value={badRange ? '—' : <Lines parts={amountParts(sums.paid, '$ 0')} />} detail={badRange ? 'Revisá las fechas' : plural(sums.payments, 'cobro', 'cobros')} tone="grey" icon="check" />
          <Stat label="Viajes sin importe" value={count(missing)} detail={missing > 0 ? 'Completalos para que sumen' : 'Todos tienen importe'} tone={missing > 0 ? 'red' : 'green'} icon="warning" />
        </div>
      )}

      <section className="card filters" aria-label="Filtros">
        <label className="field">
          <span>Período</span>
          <select
            value={period.value}
            onChange={(e) => (e.target.value === 'fechas' ? set({ periodo: 'fechas', desde: range?.from ?? today, hasta: range?.to ?? today }) : set({ periodo: e.target.value === 'mes' ? null : e.target.value, desde: null, hasta: null }))}
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {period.value === 'fechas' && range && (
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
        <label className="field field-wide">
          <span>Buscar</span>
          <input type="search" placeholder={view.value === 'clientes' ? 'Cliente…' : 'Cliente, nota, forma de cobro…'} value={typed} onChange={(e) => search(e.target.value)} />
        </label>
      </section>

      <div className="list-bar">
        <div className="chips" role="group" aria-label="Vista">
          {VIEWS.map((v) => (
            <button key={v.value} type="button" className={`chip${view.value === v.value ? ' is-on' : ''}`} aria-pressed={view.value === v.value} onClick={() => set({ vista: v.value === 'clientes' ? null : v.value })}>
              {v.label} <span>{count(v.value === 'clientes' ? clients.filter((c) => c.key !== NO_CLIENT).length : v.value === 'cobros' ? inPeriod.length : annulled.length)}</span>
            </button>
          ))}
        </div>
        <div className="list-info">
          {Number.isFinite(loadedAt) && <span className="updated">actualizado {ago(loadedAt, now)}</span>}
          <RefreshButton onClick={refresh} busy={query.isFetching || tripsQuery.isFetching} />
        </div>
      </div>

      {((query.error && query.data !== undefined) || (tripsQuery.error && tripsQuery.data !== undefined)) && <StaleNote onRetry={refresh} />}
      {lists.error && lists.data === undefined && <StaleNote onRetry={() => void lists.refetch()}>No se pudo leer la lista de clientes de la app: faltan los que todavía no tienen viajes ni cobros.</StaleNote>}

      {badRange ? (
        <ErrorNote>Revisá las fechas: «hasta» no puede ser antes de «desde».</ErrorNote>
      ) : failed ? (
        <ErrorNote onRetry={refresh}>{clientsReadError(query.error ?? tripsQuery.error)}</ErrorNote>
      ) : !ready ? (
        <div className="card card-body">
          <Skeleton lines={6} />
        </div>
      ) : view.value === 'clientes' ? (
        shownClients.length === 0 ? (
          <div className="card">
            <Empty icon="person" title={typed ? `No hay clientes con «${typed}»` : 'Todavía no hay clientes'}>
              {typed ? 'Probá escribiéndolo de otra manera.' : 'Los clientes salen del nombre escrito en cada viaje y de la lista de la app. También podés empezar la cuenta de uno con «Saldo inicial».'}
            </Empty>
          </div>
        ) : (
          <ul className="card fuel-stations" aria-label="Clientes">
            {shownClients.map((c) => (
              <ClientRow key={c.key} client={c} from={from} to={to} />
            ))}
          </ul>
        )
      ) : collections.length === 0 ? (
        <div className="card">
          <Empty icon="money" title={view.value === 'anulados' ? 'No hay cobros anulados en este período' : 'No hay cobros en este período'}>
            {typed ? 'Probá con otro cliente o búsqueda.' : view.value === 'anulados' ? null : 'Registrá el primero con «Registrar cobro».'}
          </Empty>
        </div>
      ) : (
        <>
          <p className="list-total">
            {plural(shownTotals.count, view.value === 'anulados' ? 'anulado' : 'cobro', view.value === 'anulados' ? 'anulados' : 'cobros')} · {amounts(shownTotals.amounts, '$ 0')}
            {view.value === 'anulados' ? ' · no cuentan en los saldos' : ''}
          </p>
          <ul className="card expense-list" aria-label={view.value === 'anulados' ? 'Anulados' : 'Cobros'}>
            {collections.map((m) => (
              <CollectionRow
                key={m.id}
                movement={m}
                name={names.get(m.clientKey) ?? m.clientName}
                linked={names.has(m.clientKey)}
                onOpen={view.value === 'anulados' ? undefined : () => open({ kind: 'payment', movement: m })}
                action={
                  view.value === 'anulados' ? (
                    <button type="button" className="btn btn-quiet" disabled={restore.isPending} onClick={() => void restoreMovement(m)}>
                      <Icon name="undo" size={18} /> Restaurar
                    </button>
                  ) : undefined
                }
              />
            ))}
          </ul>
        </>
      )}
      <p className="note">Lo facturado sale del importe de cada viaje, como lo completa la oficina en Viajes; los viajes en la papelera no cuentan. La ganancia de cada viaje y el simulador de fletes llegan en la próxima entrega.</p>

      {editing && (
        <CollectionFormDialog
          kind={editing.kind}
          movement={editing.movement}
          client={editing.movement ? (names.get(editing.movement.clientKey) ?? editing.movement.clientName) : ''}
          currency={editing.movement?.currency}
          clients={clients}
          today={today}
          onClose={() => setEditing(null)}
          onDone={done}
          onConflict={conflict}
        />
      )}
    </div>
  );
}
