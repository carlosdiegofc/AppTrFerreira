// Choferes (decision of 22/10/2026): every driver with a card, and every app driver still without one, with this month's
// trips, the papers about to expire and how the month's salary goes. Salaries are seen only by the panel accounts.
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { DriverFormDialog } from '../components/DriverDialogs';
import { Icon } from '../components/Icon';
import { Empty, ErrorNote, PageHead, Pill, RefreshButton, Skeleton, StaleNote, Stat } from '../components/ui';
import { TOO_MANY } from '../data/api';
import { useDocuments, useDrivers, useFleetData, useNow, usePaperDrivers, usePresence, useTripList } from '../data/hooks';
import { ago, dayInZone, firstOfMonth, firstOfNextMonth, startOfDay } from '../lib/dates';
import { type DriverSummary, driverSummaries, monthLabel, monthStatus, pendingThisMonth } from '../lib/drivers';
import { count, money, number } from '../lib/format';
import { driverPresence } from '../lib/presence';
import { amountParts } from './fuelText';
import { presenceDetail } from './presenceText';
import { PAPER_STATE, PRESENCE_TONE } from './states';

type View = 'activos' | 'sin-ficha' | 'baja';
const VIEWS: { value: View; label: string }[] = [
  { value: 'activos', label: 'Con ficha' },
  { value: 'sin-ficha', label: 'Sin ficha' },
  { value: 'baja', label: 'Ya no trabajan' },
];

/** Each currency on its own line. */
const Lines = ({ parts }: { parts: string[] }) => (
  <span className="amount-lines">
    {parts.map((p) => (
      <span key={p}>{p}</span>
    ))}
  </span>
);

const inView = (s: DriverSummary, view: View) => (view === 'sin-ficha' ? s.driver === null : view === 'baja' ? s.driver?.active === false : s.driver?.active === true);

/** The papers in one pill: the licence first when it expired or is about to, else how many are expired or close. */
function PapersPill({ s }: { s: DriverSummary }) {
  if (s.license && (s.license.state === 'late' || s.license.state === 'soon')) {
    return <Pill tone={PAPER_STATE[s.license.state].tone}>{s.license.state === 'late' ? 'Libreta vencida' : 'Libreta por vencer'}</Pill>;
  }
  if (s.papers.late > 0) return <Pill tone="red">{s.papers.late === 1 ? '1 papel vencido' : `${count(s.papers.late)} papeles vencidos`}</Pill>;
  if (s.papers.soon > 0) return <Pill tone="amber">{s.papers.soon === 1 ? '1 papel por vencer' : `${count(s.papers.soon)} papeles por vencer`}</Pill>;
  return <span className="muted">Al día</span>;
}

function DriverRow({ s, now, onCreate }: { s: DriverSummary; now: number; onCreate: (s: DriverSummary) => void }) {
  const status = s.month ? monthStatus(s.month, money) : null;
  const app = s.presence ? presenceDetail(s.presence, now) : s.userId ? 'Usa la app; todavía no avisó cuándo la abrió' : 'Sin cuenta de la app';
  return (
    <li className="card driver-row">
      <div className="driver-main">
        <h2>{s.driver ? <Link to={`/choferes/${s.driver.id}`}>{s.name}</Link> : s.name}</h2>
        <p className="muted">
          {s.presence && <Pill tone={PRESENCE_TONE[s.presence.state]}>{s.presence.state === 'trip' ? 'En viaje' : s.presence.state === 'active' ? 'Activo' : 'Sin la app abierta'}</Pill>} {app}
        </p>
      </div>
      <dl className="driver-facts">
        <div>
          <dt>Este mes</dt>
          <dd>
            {s.trips === 1 ? '1 viaje' : `${count(s.trips)} viajes`} · {number(s.km)} km
          </dd>
        </div>
        <div>
          <dt>Papeles</dt>
          <dd>
            <PapersPill s={s} />
          </dd>
        </div>
        {status && (
          <div>
            <dt>Sueldo del mes</dt>
            <dd>{status.tone === 'muted' ? <span className="muted">{status.text}</span> : <Pill tone={status.tone === 'warn' ? 'amber' : status.tone === 'ok' ? 'green' : 'blue'}>{status.text}</Pill>}</dd>
          </div>
        )}
      </dl>
      {s.driver ? (
        <Link className="btn" to={`/choferes/${s.driver.id}`}>
          Ver ficha <Icon name="chevron" size={16} />
        </Link>
      ) : (
        <button type="button" className="btn" onClick={() => onCreate(s)}>
          <Icon name="plus" size={18} /> Crear ficha
        </button>
      )}
    </li>
  );
}

export function Choferes() {
  const now = useNow(30_000);
  const today = dayInZone(now);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = VIEWS.find((v) => v.value === params.get('vista'))?.value ?? 'activos';
  const { query, drivers, salaries, payments } = useDrivers();
  const app = usePaperDrivers(true);
  const presence = usePresence();
  const fleet = useFleetData();
  const { papers } = useDocuments();
  const month = firstOfMonth(today);
  const { trips } = useTripList(startOfDay(month), startOfDay(firstOfNextMonth(today)));
  const [creating, setCreating] = useState<{ preset?: { userId: string; name: string } } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const onTrip = useMemo(() => new Set((fleet.data?.active ?? []).map((t) => t.driver_id)), [fleet.data]);
  const present = useMemo(() => (presence.data ? driverPresence(presence.data, onTrip, now) : []), [presence.data, onTrip, now]);
  const appDrivers = useMemo(() => app.data ?? [], [app.data]);
  const list = useMemo(
    () => driverSummaries({ drivers, appDrivers, presence: present, trips, papers, salaries, payments }, today),
    [drivers, appDrivers, present, trips, papers, salaries, payments, today],
  );
  const shown = list.filter((s) => inView(s, view));
  const pending = pendingThisMonth(list);
  const linked = new Set(drivers.map((d) => d.userId).filter((id): id is string => id !== null));
  const ready = query.data !== undefined;

  return (
    <div className="page">
      <PageHead
        title="Choferes"
        subtitle="La ficha de cada chofer, su actividad del mes, sus papeles y su sueldo. Los sueldos los ven solo las cuentas del panel."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setCreating({})} disabled={!ready}>
            <Icon name="plus" size={18} /> Nueva ficha
          </button>
        }
      />
      {notice && (
        <p className="notice notice-ok" role="status">
          <Icon name="check" size={18} /> {notice}
        </p>
      )}
      {ready && (
        <div className="stats stats-money">
          <Stat tone="blue" icon="person" label="Con ficha" value={count(list.filter((s) => s.driver?.active).length)} detail={`${count(list.filter((s) => !s.driver).length)} de la app sin ficha`} />
          <Stat tone="green" icon="route" label="En viaje ahora" value={count(list.filter((s) => s.presence?.state === 'trip').length)} />
          <Stat
            tone={pending.UYU > 0 || pending.USD > 0 ? 'amber' : 'green'}
            icon="money"
            label={`Falta pagar de ${monthLabel(month).replace(/ de \d+$/, '')}`}
            value={<Lines parts={amountParts(pending, '$ 0')} />}
            detail="De los sueldos cargados"
          />
        </div>
      )}

      <div className="list-bar">
        <div className="chips" role="group" aria-label="Vista">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              className={`chip${view === v.value ? ' is-on' : ''}`}
              aria-pressed={view === v.value}
              onClick={() => setParams(v.value === 'activos' ? {} : { vista: v.value }, { replace: true })}
            >
              {v.label} <span>{count(list.filter((s) => inView(s, v.value)).length)}</span>
            </button>
          ))}
        </div>
        <div className="list-info">
          {query.dataUpdatedAt > 0 && <span className="updated">actualizado {ago(query.dataUpdatedAt, now)}</span>}
          <RefreshButton onClick={() => void query.refetch()} busy={query.isFetching} />
        </div>
      </div>

      {query.error && query.data !== undefined && <StaleNote onRetry={() => void query.refetch()} />}
      {query.error && query.data === undefined ? (
        <ErrorNote onRetry={() => void query.refetch()}>
          {(query.error as { code?: string }).code === TOO_MANY ? 'Hay demasiados pagos para leerlos de una vez.' : 'No se pudieron leer las fichas de los choferes.'}
        </ErrorNote>
      ) : !ready ? (
        <div className="card card-body">
          <Skeleton lines={6} />
        </div>
      ) : shown.length === 0 ? (
        <div className="card">
          <Empty icon="person" title={view === 'activos' ? 'Todavía no hay fichas' : view === 'sin-ficha' ? 'Todos los choferes de la app tienen su ficha' : 'Nadie dejó de trabajar'}>
            {view === 'activos' ? 'Creá la ficha de cada chofer con «Nueva ficha», o desde «Sin ficha» para los que ya usan la app.' : null}
          </Empty>
        </div>
      ) : (
        <ul className="driver-list" aria-label="Choferes">
          {shown.map((s) => (
            <DriverRow key={s.key} s={s} now={now} onCreate={(x) => setCreating({ preset: { userId: x.userId ?? '', name: x.name } })} />
          ))}
        </ul>
      )}
      <p className="note">Los viajes y los kilómetros son los del mes, medidos por la app. Las fichas, los sueldos y los pagos no los ve ningún chofer, ni siquiera el suyo.</p>

      {creating && (
        <DriverFormDialog
          driver={null}
          preset={creating.preset}
          appDrivers={appDrivers.filter((a) => !linked.has(a.id))}
          linkedElsewhere={linked}
          today={today}
          onClose={() => setCreating(null)}
          onDone={(text) => {
            setCreating(null);
            setNotice(text);
          }}
          onConflict={() => setCreating(null)}
          onCreated={(id) => navigate(`/choferes/${id}`)}
        />
      )}
    </div>
  );
}
