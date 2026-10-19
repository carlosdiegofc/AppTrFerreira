import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Icon } from '../components/Icon';
import { MovementFormDialog } from '../components/MovementFormDialog';
import { type Photo, PhotoDialog } from '../components/PhotoDialog';
import { ReceiptFormDialog } from '../components/ReceiptFormDialog';
import { Card, CatalogNote, Empty, ErrorNote, PageHead, Pill, RefreshButton, Skeleton, StaleNote } from '../components/ui';
import { useFuel, useNow } from '../data/hooks';
import { dayInZone, formatDay } from '../lib/dates';
import { count, decimal, money } from '../lib/format';
import { type Currency, type Movement, NO_STATION, PAYMENT_METHODS, parseStationKey, type Receipt, type Station, statement } from '../lib/fuel';
import { balanceText, balanceTone } from './fuelText';

const CURRENCY_TITLE: Record<Currency, string> = { UYU: 'Cuenta en pesos', USD: 'Cuenta en dólares' };

function Back() {
  const navigate = useNavigate();
  const location = useLocation();
  // Back to Combustible as it was (filters included) when the station was opened from it.
  const fromList = location.key !== 'default';
  return (
    <button type="button" className="back-link" onClick={() => (fromList ? navigate(-1) : navigate('/combustible'))}>
      <Icon name="chevron" size={16} className="flip" /> Combustible
    </button>
  );
}

function Missing() {
  return (
    <div className="page">
      <Back />
      <div className="card">
        <Empty icon="fuel" title="No encontramos esa estación">
          Puede que la dirección esté mal escrita o que ya no tenga boletas ni pagos. <Link className="link" to="/combustible">Ver todas las estaciones</Link>
        </Empty>
      </div>
    </div>
  );
}

type Editing = { kind: 'payment' | 'opening'; movement: Movement | null; currency: Currency } | { kind: 'receipt'; receipt: Receipt };

function StatementCard({ station, currency, onEdit, onPhoto }: { station: Station; currency: Currency; onEdit: (e: Editing) => void; onPhoto: (r: Receipt) => void }) {
  const s = statement(station, currency);
  const account = station.accounts.find((a) => a.currency === currency);
  const opening = account?.opening ?? null;
  const method = (m: Movement) => PAYMENT_METHODS.find((p) => p.value === m.method)?.label ?? 'Pago';
  return (
    <Card
      title={CURRENCY_TITLE[currency]}
      action={account && <Pill tone={balanceTone(account)}>{balanceText(account)}</Pill>}
      padded={false}
    >
      <div className="card-body account-facts">
        <dl className="facts facts-tight">
          <div>
            <dt>Saldo inicial</dt>
            <dd>{opening ? `${money(opening.amount, currency)} al ${formatDay(opening.day)}` : 'Sin saldo inicial: la cuenta empieza con la primera boleta'}</dd>
          </div>
          <div>
            <dt>Cargas</dt>
            <dd>{money(account?.loaded ?? 0, currency)}</dd>
          </div>
          <div>
            <dt>Pagos</dt>
            <dd>{money(account?.paid ?? 0, currency)}</dd>
          </div>
          <div>
            <dt>Saldo</dt>
            <dd>{money(s.balance, currency)}</dd>
          </div>
        </dl>
        {s.earlier > 0 && opening && (
          <p className="note">
            {count(s.earlier)} {s.earlier === 1 ? 'boleta o pago anterior' : 'boletas o pagos anteriores'} al {formatDay(opening.day)} {s.earlier === 1 ? 'está' : 'están'} dentro del saldo inicial.
          </p>
        )}
        {account && account.withoutAmount > 0 && <p className="note">{count(account.withoutAmount)} {account.withoutAmount === 1 ? 'boleta no tiene' : 'boletas no tienen'} importe: no suman hasta que las corrijas.</p>}
      </div>
      {s.lines.length === 0 ? (
        <div className="card-body">
          <p className="note">Todavía no hay movimientos en esta cuenta.</p>
        </div>
      ) : (
        // On a phone the statement scrolls sideways inside its card; the page does not.
        <div className="statement-scroll">
        <table className="statement" aria-label={`Estado de cuenta en ${currency === 'USD' ? 'dólares' : 'pesos'}`}>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Concepto</th>
              <th scope="col" className="num">
                Importe
              </th>
              <th scope="col" className="num">
                Saldo
              </th>
              <th scope="col">
                <span className="visually-hidden">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((line) => {
              const r = line.receipt;
              const m = line.movement;
              const concept =
                line.kind === 'opening'
                  ? 'Saldo inicial'
                  : line.kind === 'payment' && m
                    ? [`Pago · ${method(m)}`, m.notes].filter(Boolean).join(' · ')
                    : r
                      ? ['Boleta', r.driverName, r.vehicle, r.liters === null ? null : `${decimal(r.liters, 2)} L`].filter(Boolean).join(' · ')
                      : '';
              return (
                <tr key={line.key} className={`st-${line.kind}`}>
                  <td>{formatDay(line.day)}</td>
                  <td>
                    {concept}
                    {r?.updatedAt && (
                      <>
                        {' '}
                        <Pill tone="blue">Corregida</Pill>
                      </>
                    )}
                  </td>
                  <td className="num">{line.amount === null ? <span className="muted">Sin importe</span> : money(line.amount, currency)}</td>
                  <td className="num st-balance">{money(line.balance, currency)}</td>
                  <td className="st-actions">
                    {r?.objectPath && (
                      <button type="button" className="link-button" onClick={() => onPhoto(r)}>
                        Ver boleta
                      </button>
                    )}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => onEdit(r ? { kind: 'receipt', receipt: r } : { kind: line.kind === 'opening' ? 'opening' : 'payment', movement: m ?? null, currency })}
                    >
                      Corregir
                    </button>
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

function StationPage({ stationKey }: { stationKey: string }) {
  const now = useNow(30_000);
  const today = dayInZone(now);
  const { stations, catalogStations, query, catalog, lists } = useFuel();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  if (query.isLoading || catalog.isLoading || lists.isLoading) {
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
        <ErrorNote onRetry={() => void query.refetch()}>No se pudo leer el combustible.</ErrorNote>
      </div>
    );
  }
  const station = stations.find((s) => s.key === stationKey);
  if (!station) return <Missing />;

  const accountable = station.key !== NO_STATION;
  const currencies: Currency[] = station.accounts.length > 0 ? station.accounts.map((a) => a.currency) : ['UYU'];
  const written = stations.filter((s) => !s.listed && s.key !== NO_STATION).map((s) => s.name);
  const done = (text: string) => {
    setEditing(null);
    setNotice({ tone: 'ok', text });
  };
  const conflict = () => {
    setEditing(null);
    setNotice({ tone: 'warn', text: 'Otra persona lo cambió mientras lo tenías abierto, y no se guardó nada: ya se ven sus datos nuevos. Revisalos y, si hace falta, volvé a cambiarlo.' });
  };
  // A new opening balance, in the first currency that has none; the ones there are get corrected from their line.
  const openOpening = () => {
    const free = (['UYU', 'USD'] as const).find((c) => !station.openings.some((o) => o.currency === c)) ?? 'UYU';
    setNotice(null);
    setEditing({ kind: 'opening', movement: null, currency: free });
  };
  const subtitle = [station.listed ? 'De la lista de estaciones de la app' : accountable ? 'Escrita a mano en las boletas' : 'Boletas que no dicen la estación', station.lastDay ? `última carga el ${formatDay(station.lastDay)}` : 'sin cargas todavía', `${count(station.receipts.length)} boleta${station.receipts.length === 1 ? '' : 's'}`].join(' · ');

  return (
    <div className="page">
      <Back />
      <PageHead
        title={station.name}
        subtitle={subtitle}
        actions={
          <>
            <RefreshButton onClick={() => void query.refetch()} busy={query.isFetching} />
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
                  <Icon name="money" size={18} /> Registrar pago
                </button>
              </>
            )}
          </>
        }
      />
      {query.error && <StaleNote onRetry={() => void query.refetch()} />}
      {catalog.error && <CatalogNote onRetry={() => void catalog.refetch()} />}
      {notice && (
        <p className={`notice notice-${notice.tone}`} role={notice.tone === 'ok' ? 'status' : 'alert'}>
          <Icon name={notice.tone === 'ok' ? 'check' : 'warning'} size={18} /> {notice.text}
        </p>
      )}
      {!accountable && <p className="notice notice-warn">Estas boletas no dicen en qué estación se cargaron: corregilas para que cuenten en la cuenta de su estación.</p>}

      <div className="statements">
        {currencies.map((c) => (
          <StatementCard
            key={c}
            station={station}
            currency={c}
            onEdit={(e) => {
              setNotice(null);
              setEditing(e);
            }}
            onPhoto={(r) => setPhoto({ bucket: 'trf-fuel-receipts', path: r.objectPath as string, title: `Boleta de ${station.name}` })}
          />
        ))}
      </div>

      <PhotoDialog photo={photo} onClose={() => setPhoto(null)} />
      {editing?.kind === 'receipt' && (
        <ReceiptFormDialog receipt={editing.receipt} today={today} stations={catalogStations} writtenStations={written} trucks={catalog.data ?? []} onClose={() => setEditing(null)} onDone={done} onConflict={conflict} />
      )}
      {editing && editing.kind !== 'receipt' && (
        <MovementFormDialog kind={editing.kind} movement={editing.movement} station={station.key} currency={editing.currency} stations={stations} today={today} onClose={() => setEditing(null)} onDone={done} onConflict={conflict} />
      )}
    </div>
  );
}

export function Estacion() {
  const { key } = useParams();
  const parsed = parseStationKey(key);
  if (!parsed) return <Missing />;
  // A new station is a new page: nothing of the previous one stays on screen.
  return <StationPage key={parsed} stationKey={parsed} />;
}
