// A driver's card (Choferes, decision of 22/10/2026): the data, the licence and the papers, this month's work and the
// salary month by month with every payment. Only the panel accounts read it.
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { DriverFormDialog, PaymentFormDialog, SalaryFormDialog } from '../components/DriverDialogs';
import { Icon } from '../components/Icon';
import { Card, Empty, ErrorNote, PageHead, Pill, RefreshButton, Skeleton, StaleNote } from '../components/ui';
import { useDocuments, useDrivers, useFleetData, useFuel, useNow, usePaperDrivers, usePresence, useTripList } from '../data/hooks';
import { ago, dayInZone, firstOfMonth, firstOfNextMonth, formatDay, inDays, startOfDay } from '../lib/dates';
import { paperViews } from '../lib/documents';
import {
  accountNames,
  belongsTo,
  conceptLabel,
  type Driver,
  isLicense,
  latestLicense,
  type MonthLine,
  monthLabel,
  monthLines,
  monthStatus,
  moneyYears,
  type Payment,
  type Salary,
  salaryFor,
  seniority,
  yearMonths,
} from '../lib/drivers';
import { count, decimal, money, number } from '../lib/format';
import { PAYMENT_METHODS } from '../lib/fuel';
import { litersPer100, summarize } from '../lib/metrics';
import { driverPresence, PRESENCE_LABEL } from '../lib/presence';
import { presenceLine } from './presenceText';
import { PAPER_STATE, PRESENCE_TONE } from './states';

const methodLabel = (m: string | null) => PAYMENT_METHODS.find((p) => p.value === m)?.label ?? null;

function Back() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromList = location.key !== 'default';
  return (
    <button type="button" className="back-link" onClick={() => (fromList ? navigate(-1) : navigate('/choferes'))}>
      <Icon name="chevron" size={16} className="flip" /> Choferes
    </button>
  );
}

type Editing =
  | { kind: 'card' }
  | { kind: 'salary'; salary: Salary | null }
  | { kind: 'payment'; payment: Payment | null };

function MonthTable({ lines, onPayment }: { lines: MonthLine[]; onPayment: (p: Payment) => void }) {
  return (
    <div className="statement-scroll">
      <table className="statement money-months" aria-label="Sueldo por mes">
        <thead>
          <tr>
            <th scope="col">Mes</th>
            <th scope="col" className="num">
              Sueldo
            </th>
            <th scope="col" className="num">
              Pagado
            </th>
            <th scope="col">Cómo va</th>
            <th scope="col">Pagos del mes</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const status = monthStatus(l, money);
            return (
              <tr key={l.month}>
                <td>{monthLabel(l.month, true)}</td>
                <td className="num">{l.salary ? money(l.salary.amount, l.salary.currency) : <span className="muted">—</span>}</td>
                <td className="num">{l.salary || l.paid > 0 ? money(l.paid, l.currency) : <span className="muted">—</span>}</td>
                <td>{status.tone === 'muted' ? <span className="muted">{status.text}</span> : <Pill tone={status.tone === 'warn' ? 'amber' : status.tone === 'ok' ? 'green' : 'blue'}>{status.text}</Pill>}</td>
                <td>
                  {l.payments.length === 0 ? (
                    <span className="muted">Sin pagos</span>
                  ) : (
                    <ul className="month-payments">
                      {l.payments.map((p) => (
                        <li key={p.id}>
                          <button type="button" className="link-button" onClick={() => onPayment(p)} aria-label={`Corregir ${conceptLabel(p.concept).toLowerCase()} del ${formatDay(p.paidOn)} por ${money(p.amount, p.currency)}`}>
                            {formatDay(p.paidOn)}
                          </button>{' '}
                          · {conceptLabel(p.concept)} · {money(p.amount, p.currency)}
                          {p.notes ? <span className="muted"> · {p.notes}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  {l.others.length > 0 && (
                    <p className="hint month-others">
                      Aparte del sueldo: {l.others.map((o) => `${o.label} ${money(o.amount, o.currency)}`).join(' · ')}
                    </p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DriverPage({ driver, today, now }: { driver: Driver; today: string; now: number }) {
  const navigate = useNavigate();
  const { query, drivers, salaries: allSalaries, payments: allPayments } = useDrivers();
  const app = usePaperDrivers(true);
  const presence = usePresence();
  const fleet = useFleetData();
  const docs = useDocuments();
  const fuel = useFuel();
  const month = firstOfMonth(today);
  const tripList = useTripList(startOfDay(month), startOfDay(firstOfNextMonth(today)));
  const { papers } = docs;
  const { receipts } = fuel;
  const { trips } = tripList;
  // Until each read answers, nothing shows as zero or as missing; a read that failed says so.
  const activityRead = tripList.query.data !== undefined && fuel.query.data !== undefined;
  const papersRead = docs.query.data !== undefined;
  const presenceRead = presence.data !== undefined && fleet.data !== undefined;
  const [editing, setEditing] = useState<Editing | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const salaries = useMemo(() => allSalaries.filter((s) => s.driverId === driver.id), [allSalaries, driver.id]);
  const payments = useMemo(() => allPayments.filter((p) => p.driverId === driver.id), [allPayments, driver.id]);
  // Who stopped working has no salary after that month.
  const history = { salaries, payments, leftOn: driver.leftOn };
  const years = moneyYears(history, today);
  // The newest year with something, and a valid one when the history changes (a driver who left in an earlier year).
  const [chosenYear, setYear] = useState<number | null>(null);
  const year = chosenYear !== null && years.includes(chosenYear) ? chosenYear : (years[0] ?? Number(today.slice(0, 4)));
  const lines = monthLines(salaries, payments, yearMonths(year, today, history), driver.leftOn);
  // Who left before this month: the salary of the month they left is the last one, not a current one.
  const salaryMonth = driver.leftOn && firstOfMonth(driver.leftOn) < month ? firstOfMonth(driver.leftOn) : month;
  const current = salaryFor(salaries, salaryMonth);
  const later = salaries.filter((s) => !s.deleted && s.startsOn > salaryMonth).sort((a, b) => a.startsOn.localeCompare(b.startsOn));

  const onTrip = useMemo(() => new Set((fleet.data?.active ?? []).map((t) => t.driver_id)), [fleet.data]);
  const present = useMemo(() => (presence.data && driver.userId ? (driverPresence(presence.data, onTrip, now).find((p) => p.driverId === driver.userId) ?? null) : null), [presence.data, onTrip, now, driver.userId]);
  // The names the account used in the app count for the trips typed by hand, as in the list and in Viajes.
  const who = { userId: driver.userId, name: driver.name, aliases: accountNames(trips, driver.userId) };
  const mine = (row: { driverId: string | null; driverName: string | null }) => belongsTo(who, row);
  const work = summarize(
    trips.filter((t) => mine(t)),
    receipts.filter((r) => r.date !== null && r.date >= month && r.date < firstOfNextMonth(today) && mine({ driverId: r.driverId, driverName: r.driverName })),
    'driver',
  ).total;
  const ratio = litersPer100(work);
  const myPapers = paperViews(
    papers.filter((p) => p.scope === 'driver' && mine({ driverId: p.driverId, driverName: p.driverName })),
    today,
  );
  const license = latestLicense(myPapers);
  const linked = new Set(drivers.filter((d) => d.id !== driver.id).map((d) => d.userId).filter((id): id is string => id !== null));
  const roster = (app.data ?? []).filter((a) => !linked.has(a.id));
  // The card's own account stays a choice even when the list of app accounts does not bring it.
  const appDrivers = driver.userId && !roster.some((a) => a.id === driver.userId) ? [...roster, { id: driver.userId, name: driver.name }] : roster;
  const appName = driver.userId ? (app.data?.find((a) => a.id === driver.userId)?.name ?? null) : null;
  // The month's trips as this card counts them: the account's under any name, and the ones typed with its name.
  const tripsLink = `/viajes?periodo=mes&nombre=${encodeURIComponent(driver.name)}${driver.userId ? `&cuenta=${encodeURIComponent(driver.userId)}` : ''}`;
  const papersLink = driver.userId ? `/documentacion?de=${encodeURIComponent(`driver:${driver.userId}`)}` : '/documentacion?vista=choferes';

  const done = (text: string) => {
    setEditing(null);
    setNotice({ tone: 'ok', text });
  };
  const conflict = () => {
    setEditing(null);
    setNotice({ tone: 'warn', text: 'Otra persona lo cambió mientras lo tenías abierto, y no se guardó nada: ya se ven los datos nuevos. Revisalos y, si hace falta, volvé a cambiarlo.' });
  };
  const open = (e: Editing) => {
    setNotice(null);
    setEditing(e);
  };

  const since = driver.hiredOn ? seniority(driver.hiredOn, driver.leftOn ?? today) : null;
  // Everything the page shows, read again together.
  const reads = [query, app, presence, fleet, docs.query, fuel.query, tripList.query];
  const refresh = () => reads.forEach((r) => void r.refetch());
  const pay = [methodLabel(driver.payMethod), driver.bank, driver.bankAccount && `cuenta ${driver.bankAccount}`].filter(Boolean).join(' · ');

  return (
    <div className="page">
      <Back />
      <PageHead
        title={driver.name}
        subtitle={[driver.active ? null : driver.leftOn ? `Dejó de trabajar el ${formatDay(driver.leftOn)}` : 'Ya no trabaja en la empresa', driver.userId ? (present && presenceRead ? presenceLine(present, now) : 'Usa la app') : 'Sin cuenta de la app'].filter(Boolean).join(' · ')}
        actions={
          <>
            <RefreshButton onClick={refresh} busy={reads.some((r) => r.isFetching)} />
            <button type="button" className="btn" onClick={() => open({ kind: 'card' })}>
              <Icon name="edit" size={18} /> Editar ficha
            </button>
            <button type="button" className="btn btn-primary" onClick={() => open({ kind: 'payment', payment: null })}>
              <Icon name="money" size={18} /> Registrar pago
            </button>
          </>
        }
      />
      {query.error && <StaleNote onRetry={() => void query.refetch()} />}
      {driver.userId && !presenceRead && (presence.error || fleet.error) && (
        <ErrorNote
          onRetry={() => {
            void presence.refetch();
            void fleet.refetch();
          }}
        >
          No se pudo leer si tiene la app abierta o está de viaje: se ve con «—».
        </ErrorNote>
      )}
      {notice && (
        <p className={`notice notice-${notice.tone}`} role={notice.tone === 'ok' ? 'status' : 'alert'}>
          <Icon name={notice.tone === 'ok' ? 'check' : 'warning'} size={18} /> {notice.text}
        </p>
      )}

      <div className="driver-grid">
        <Card title="Datos">
          <dl className="facts facts-tight">
            <div>
              <dt>Teléfono</dt>
              <dd>{driver.phone ? <a href={`tel:${driver.phone.replace(/[^\d+]/g, '')}`}>{driver.phone}</a> : <span className="muted">Sin cargar</span>}</dd>
            </div>
            <div>
              <dt>Cédula</dt>
              <dd>{driver.documentId || <span className="muted">Sin cargar</span>}</dd>
            </div>
            <div>
              <dt>Ingreso</dt>
              <dd>{driver.hiredOn ? `${formatDay(driver.hiredOn)}${since ? ` · ${since}` : ''}` : <span className="muted">Sin cargar</span>}</dd>
            </div>
            {driver.leftOn && (
              <div>
                <dt>Egreso</dt>
                <dd>{formatDay(driver.leftOn)}</dd>
              </div>
            )}
            <div>
              <dt>Libreta</dt>
              <dd>
                {driver.licenseCategory ? `Categoría ${driver.licenseCategory}` : <span className="muted">Sin categoría</span>}
                {license ? (
                  <>
                    {' · '}
                    <Pill tone={PAPER_STATE[license.state].tone}>{license.expiresOn ? `${license.state === 'late' ? 'Venció' : 'Vence'} el ${formatDay(license.expiresOn)}` : 'Sin vencimiento'}</Pill>
                  </>
                ) : papersRead ? (
                  <span className="muted"> · sin cargar en Documentación</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>Cómo se le paga</dt>
              <dd>{pay || <span className="muted">Sin cargar</span>}</dd>
            </div>
            <div>
              <dt>Cuenta de la app</dt>
              <dd>{driver.userId ? (appName ?? 'Vinculada') : <span className="muted">Sin cuenta: se le encuentra por el nombre</span>}</dd>
            </div>
          </dl>
          {driver.notes && <p className="note driver-notes">{driver.notes}</p>}
        </Card>

        <Card title={`Actividad de ${monthLabel(month).replace(/ de \d+$/, '')}`} action={<Link className="link" to={tripsLink}>Ver sus viajes</Link>}>
          {!activityRead ? (
            tripList.query.error || fuel.query.error ? (
              <ErrorNote
                onRetry={() => {
                  void tripList.query.refetch();
                  void fuel.query.refetch();
                }}
              >
                No se pudieron leer los viajes o las boletas del mes.
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
              <div>
                <dt>La app</dt>
                <dd>
                  {present && presenceRead ? (
                    <>
                      <Pill tone={PRESENCE_TONE[present.state]}>{PRESENCE_LABEL[present.state]}</Pill> <span className="muted">abierta {ago(present.seenAt, now)}</span>
                    </>
                  ) : (
                    <span className="muted">{driver.userId ? (presenceRead ? 'Sin aviso todavía' : '—') : 'No usa la app'}</span>
                  )}
                </dd>
              </div>
            </dl>
          )}
        </Card>

        <Card title="Papeles" action={<Link className="link" to={papersLink}>Ir a Documentación</Link>}>
          {!papersRead ? (
            docs.query.error ? (
              <ErrorNote onRetry={() => void docs.query.refetch()}>No se pudieron leer los papeles.</ErrorNote>
            ) : (
              <Skeleton lines={3} />
            )
          ) : myPapers.length === 0 ? (
            <p className="note">Todavía no tiene papeles cargados. Se cargan en Documentación, o los sube el chofer desde la app.</p>
          ) : (
            <ul className="driver-papers">
              {myPapers.map((p) => (
                <li key={p.id}>
                  <span>{p.kind || 'Sin tipo'}</span>
                  <span className="muted">{p.expiresOn ? `${p.state === 'late' ? 'Venció' : 'Vence'} el ${formatDay(p.expiresOn)}${p.state === 'late' || p.state === 'soon' ? ` · ${inDays(p.expiresOn, today)}` : ''}` : 'Sin vencimiento'}</span>
                  {isLicense(p) && p !== license ? <Pill tone="grey">Renovada</Pill> : <Pill tone={PAPER_STATE[p.state].tone}>{PAPER_STATE[p.state].label}</Pill>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title="Sueldo"
        padded={false}
        action={
          <button type="button" className="btn" onClick={() => open({ kind: 'salary', salary: null })}>
            <Icon name="edit" size={18} /> {current || later.length > 0 ? 'Cambiar sueldo' : 'Cargar sueldo'}
          </button>
        }
      >
        <div className="card-body account-facts">
          <dl className="facts facts-tight">
            <div>
              <dt>{salaryMonth < month ? 'Último sueldo' : 'Sueldo por mes'}</dt>
              <dd>{current ? `${money(current.amount, current.currency)} desde ${monthLabel(current.startsOn)}` : <span className="muted">Sin sueldo cargado: los pagos se anotan igual</span>}</dd>
            </div>
            {later.map((s) => (
              <div key={s.id}>
                <dt>Desde {monthLabel(s.startsOn)}</dt>
                <dd>{money(s.amount, s.currency)}</dd>
              </div>
            ))}
          </dl>
          {salaries.some((s) => !s.deleted) && (
            <p className="note">
              Sueldos cargados:{' '}
              {salaries
                .filter((s) => !s.deleted)
                .sort((a, b) => b.startsOn.localeCompare(a.startsOn))
                .map((s, i) => (
                  <span key={s.id}>
                    {i > 0 && ' · '}
                    <button type="button" className="link-button" onClick={() => open({ kind: 'salary', salary: s })}>
                      {money(s.amount, s.currency)} desde {monthLabel(s.startsOn)}
                    </button>
                  </span>
                ))}
            </p>
          )}
          <p className="note">Los adelantos y el sueldo pagado se restan del sueldo del mes al que corresponden; el aguinaldo, la licencia y los viáticos se muestran aparte. Pesos y dólares no se mezclan.</p>
          {driver.leftOn && <p className="note">Dejó de trabajar el {formatDay(driver.leftOn)}: los meses siguientes no llevan sueldo.</p>}
          {years.length > 1 && (
            <div className="chips" role="group" aria-label="Año">
              {years.map((y) => (
                <button key={y} type="button" className={`chip${year === y ? ' is-on' : ''}`} aria-pressed={year === y} onClick={() => setYear(y)}>
                  {y}
                </button>
              ))}
            </div>
          )}
        </div>
        {lines.length === 0 ? (
          <div className="card-body">
            <p className="note">Nada en {year}.</p>
          </div>
        ) : (
          <MonthTable lines={lines} onPayment={(p) => open({ kind: 'payment', payment: p })} />
        )}
      </Card>

      {editing?.kind === 'card' && (
        <DriverFormDialog driver={driver} appDrivers={appDrivers} linkedElsewhere={linked} today={today} onClose={() => setEditing(null)} onDone={done} onConflict={conflict} />
      )}
      {editing?.kind === 'salary' && (
        <SalaryFormDialog driver={driver} salary={editing.salary} salaries={salaries} current={current} today={today} onClose={() => setEditing(null)} onDone={done} onConflict={conflict} />
      )}
      {editing?.kind === 'payment' && (
        <PaymentFormDialog driver={driver} payment={editing.payment} salary={current} today={today} onClose={() => setEditing(null)} onDone={done} onConflict={conflict} />
      )}
      {!driver.active && (
        <p className="note">
          Ya no trabaja en la empresa{driver.leftOn ? ` desde el ${formatDay(driver.leftOn)}` : ''}: su ficha y sus pagos quedan guardados.{' '}
          <button type="button" className="link-button" onClick={() => navigate('/choferes?vista=baja')}>
            Ver los que ya no trabajan
          </button>
        </p>
      )}
    </div>
  );
}

export function Chofer() {
  const { id } = useParams();
  const now = useNow(30_000);
  const today = dayInZone(now);
  const { query, drivers } = useDrivers();
  const driver = drivers.find((d) => d.id === id);
  // A card just created may not be in the list read before: wait for the list read again.
  if (query.isLoading || (!driver && query.isFetching)) {
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
  if (!driver) {
    return (
      <div className="page">
        <Back />
        <div className="card">
          <Empty icon="person" title="No encontramos esa ficha">
            Puede que la dirección esté mal escrita. <Link className="link" to="/choferes">Ver todos los choferes</Link>
          </Empty>
        </div>
      </div>
    );
  }
  // Another driver is another page: nothing of the previous one stays on screen.
  return <DriverPage key={driver.id} driver={driver} today={today} now={now} />;
}
