// A client's account (decisions of 26/10/2026 and 27/10/2026): its statement in each currency, from the opening balance
// on, with each trip billed and each collection and the balance after each line, like a station's in Combustible. The
// trips billed without saying the client have a page too: a plain list, to complete them.
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { CollectionFormDialog } from '../components/CollectionFormDialog';
import { Icon } from '../components/Icon';
import { Card, CatalogNote, Empty, ErrorNote, PageHead, Pill, RefreshButton, Skeleton, StaleNote } from '../components/ui';
import { useClients, useNow } from '../data/hooks';
import { type Client, type ClientMovement, NO_CLIENT, parseClientKey, statement } from '../lib/clients';
import { dayInZone, formatDay } from '../lib/dates';
import { count, money } from '../lib/format';
import { CURRENCIES, type Currency } from '../lib/fuel';
import { clientBalanceText, clientBalanceTone, clientsReadError, methodText, tripConcept } from './clientText';

const CURRENCY_TITLE: Record<Currency, string> = { UYU: 'Cuenta en pesos', USD: 'Cuenta en dólares' };
const TRIPS_TITLE: Record<Currency, string> = { UYU: 'Viajes en pesos', USD: 'Viajes en dólares' };

function Back() {
  const navigate = useNavigate();
  const location = useLocation();
  // Back to Cobros as it was (filters included) when the client was opened from it.
  const fromList = location.key !== 'default';
  return (
    <button type="button" className="back-link" onClick={() => (fromList ? navigate(-1) : navigate('/finanzas/cobros'))}>
      <Icon name="chevron" size={16} className="flip" /> Cobros
    </button>
  );
}

function Missing() {
  return (
    <div className="page">
      <Back />
      <div className="card">
        <Empty icon="person" title="No encontramos ese cliente">
          Puede que la dirección esté mal escrita o que ya no tenga viajes ni cobros. <Link className="link" to="/finanzas/cobros">Ver todos los clientes</Link>
        </Empty>
      </div>
    </div>
  );
}

type Editing = { kind: 'payment' | 'opening'; movement: ClientMovement | null; currency: Currency };

/**
 * A client's statement of account in one currency. The trips billed without a client have no account: they show as a
 * plain list, to complete them.
 */
function StatementCard({ client, currency, accountable, onEdit }: { client: Client; currency: Currency; accountable: boolean; onEdit: (e: Editing) => void }) {
  const s = statement(client, currency);
  const account = client.accounts.find((a) => a.currency === currency);
  const opening = s.opening;
  const running = s.lines.filter((l) => l.trip?.active && l.amount === null).length;
  const label = currency === 'USD' ? 'dólares' : 'pesos';
  return (
    <Card title={accountable ? CURRENCY_TITLE[currency] : TRIPS_TITLE[currency]} action={account && <Pill tone={clientBalanceTone(account)}>{clientBalanceText(account)}</Pill>} padded={false}>
      {accountable && (
        <div className="card-body account-facts">
          <dl className="facts facts-tight">
            <div>
              <dt>Saldo inicial</dt>
              <dd>{opening ? `${money(opening.amount, currency)} al ${formatDay(opening.day)}` : 'Sin saldo inicial: la cuenta empieza con el primer viaje'}</dd>
            </div>
            <div>
              <dt>Facturado</dt>
              <dd>{money(s.billed, currency)}</dd>
            </div>
            <div>
              <dt>Cobrado</dt>
              <dd>{money(s.paid, currency)}</dd>
            </div>
            <div>
              <dt>Saldo</dt>
              <dd>{money(s.balance, currency)}</dd>
            </div>
          </dl>
          {s.earlier > 0 && opening && (
            <p className="note">
              {s.earlier === 1 ? 'Un viaje o cobro anterior' : `${count(s.earlier)} viajes o cobros anteriores`} al {formatDay(opening.day)} {s.earlier === 1 ? 'está' : 'están'} dentro del saldo inicial.
            </p>
          )}
          {s.withoutAmount > 0 && <p className="note">{s.withoutAmount === 1 ? 'Un viaje no tiene importe: no suma hasta que lo completes en el viaje.' : `${count(s.withoutAmount)} viajes no tienen importe: no suman hasta que los completes en cada viaje.`}</p>}
          {running > 0 && <p className="note">{running === 1 ? 'Un viaje sigue en curso, todavía sin importe.' : `${count(running)} viajes siguen en curso, todavía sin importe.`}</p>}
        </div>
      )}
      {s.lines.length === 0 ? (
        <div className="card-body">
          <p className="note">Todavía no hay movimientos en esta cuenta.</p>
        </div>
      ) : (
        // On a phone the statement scrolls sideways inside its card; the page does not.
        <div className="statement-scroll">
          <table className={`statement${accountable ? '' : ' statement-plain'}`} aria-label={accountable ? `Estado de cuenta en ${label}` : TRIPS_TITLE[currency]}>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Concepto</th>
                <th scope="col" className="num">
                  Importe
                </th>
                {accountable && (
                  <th scope="col" className="num">
                    Saldo
                  </th>
                )}
                <th scope="col">
                  <span className="visually-hidden">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {s.lines.map((line) => {
                const t = line.trip;
                const m = line.movement;
                const concept =
                  line.kind === 'opening'
                    ? m && m.amount < 0
                      ? 'Saldo inicial a favor del cliente'
                      : 'Saldo inicial'
                    : line.kind === 'payment' && m
                      ? [`Cobro · ${methodText(m)}`, m.notes || null].filter(Boolean).join(' · ')
                      : t
                        ? tripConcept(t)
                        : '';
                return (
                  <tr key={line.key} className={`st-${line.kind}`}>
                    <td>{line.day ? formatDay(line.day) : 'Sin fecha'}</td>
                    <td>
                      {concept}
                      {t?.active && (
                        <>
                          {' '}
                          <Pill tone="blue">En curso</Pill>
                        </>
                      )}
                    </td>
                    <td className="num">{line.amount === null ? <span className="muted">Sin importe</span> : money(line.amount, currency)}</td>
                    {accountable && <td className="num st-balance">{money(line.balance, currency)}</td>}
                    <td className="st-actions">
                      {t ? (
                        <Link className="link-button" to={`/viajes/${t.key}`}>
                          {line.amount === null ? 'Completar' : 'Ver viaje'}
                        </Link>
                      ) : (
                        <button type="button" className="link-button" onClick={() => onEdit({ kind: line.kind === 'opening' ? 'opening' : 'payment', movement: m ?? null, currency })}>
                          Corregir
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ClientPage({ clientKey }: { clientKey: string }) {
  const now = useNow(60_000);
  const today = dayInZone(now);
  const { clients, query, tripsQuery, catalog, lists } = useClients();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const refresh = () => void Promise.all([query.refetch(), tripsQuery.refetch(), lists.refetch()]);

  if (query.isLoading || tripsQuery.isLoading || catalog.isLoading || lists.isLoading) {
    return (
      <div className="page">
        <Back />
        <div className="card card-body">
          <Skeleton lines={8} />
        </div>
      </div>
    );
  }
  if ((query.error && query.data === undefined) || (tripsQuery.error && tripsQuery.data === undefined)) {
    return (
      <div className="page">
        <Back />
        <ErrorNote onRetry={refresh}>{clientsReadError(query.error ?? tripsQuery.error)}</ErrorNote>
      </div>
    );
  }
  const client = clients.find((c) => c.key === clientKey);
  if (!client) return <Missing />;

  const accountable = client.key !== NO_CLIENT;
  // Without an account (trips billed without a client), the currencies of its trips.
  const used: Currency[] = accountable ? client.accounts.map((a) => a.currency) : CURRENCIES.filter((c) => client.trips.some((t) => t.currency === c));
  const currencies: Currency[] = used.length > 0 ? used : ['UYU'];
  const done = (text: string) => {
    setEditing(null);
    setNotice({ tone: 'ok', text });
  };
  const conflict = () => {
    setEditing(null);
    setNotice({ tone: 'warn', text: 'Otra persona lo cambió mientras lo tenías abierto, y no se guardó nada: ya se ven sus datos nuevos. Revisalos y, si hace falta, volvé a cambiarlo.' });
  };
  // A new opening balance, in the first currency of the client that has none (a client billed in dollars starts there);
  // the ones there are get corrected from their line.
  const openOpening = () => {
    const free = [...currencies, ...CURRENCIES].find((c) => !client.openings.some((o) => o.currency === c)) ?? 'UYU';
    setNotice(null);
    setEditing({ kind: 'opening', movement: null, currency: free });
  };
  const origin = client.listed ? 'De la lista de clientes de la app' : accountable ? 'Escrito en los viajes' : 'Viajes que no dicen el cliente';
  const subtitle = [origin, client.lastTrip ? `último viaje el ${formatDay(client.lastTrip)}` : 'sin viajes todavía', `${count(client.trips.length)} viaje${client.trips.length === 1 ? '' : 's'}`].join(' · ');

  return (
    <div className="page">
      <Back />
      <PageHead
        title={client.name}
        subtitle={subtitle}
        actions={
          <>
            <RefreshButton onClick={refresh} busy={query.isFetching || tripsQuery.isFetching} />
            {accountable && (
              <>
                <button type="button" className="btn" onClick={openOpening}>
                  <Icon name="edit" size={18} /> Saldo inicial
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setNotice(null);
                    setEditing({ kind: 'payment', movement: null, currency: currencies[0] ?? 'UYU' });
                  }}
                >
                  <Icon name="money" size={18} /> Registrar cobro
                </button>
              </>
            )}
          </>
        }
      />
      {((query.error && query.data !== undefined) || (tripsQuery.error && tripsQuery.data !== undefined)) && <StaleNote onRetry={refresh} />}
      {catalog.error && <CatalogNote onRetry={() => void catalog.refetch()} />}
      {notice && (
        <p className={`notice notice-${notice.tone}`} role={notice.tone === 'ok' ? 'status' : 'alert'}>
          <Icon name={notice.tone === 'ok' ? 'check' : 'warning'} size={18} /> {notice.text}
        </p>
      )}
      {!accountable && <p className="notice notice-warn">Estos viajes no dicen el cliente: completá en cada uno el cliente, y el importe si falta, para que sumen en su cuenta.</p>}

      <div className="statements">
        {currencies.map((c) => (
          <StatementCard
            key={c}
            client={client}
            currency={c}
            accountable={accountable}
            onEdit={(e) => {
              setNotice(null);
              setEditing(e);
            }}
          />
        ))}
      </div>

      {editing && (
        <CollectionFormDialog
          kind={editing.kind}
          movement={editing.movement}
          client={client.name}
          currency={editing.currency}
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

export function Cliente() {
  const { key } = useParams();
  const parsed = parseClientKey(key);
  if (!parsed) return <Missing />;
  // A new client is a new page: nothing of the previous one stays on screen.
  return <ClientPage key={parsed} clientKey={parsed} />;
}
