// Ganancia (decisions of 26/10/2026 and 27/10/2026), in Gastos y finanzas: what the company left in a month and how it got
// there. What each truck billed minus its fuel, its tolls and its expenses; then the general expenses, the salaries and
// the viáticos of the month. The month's trips with what each left, and the last 12 months. The month lives in the
// address (?mes=2026-09): going back, reloading or sharing the link keeps it.
import { type ReactNode, useMemo } from 'react';
import { Link } from 'react-router';
import { FinanceTabs } from '../components/FinanceTabs';
import { Icon } from '../components/Icon';
import { Empty, ErrorNote, PageHead, Pill, RefreshButton, Skeleton, StaleNote, Stat } from '../components/ui';
import { DataError, TOO_MANY } from '../data/api';
import { useNow, useProfit } from '../data/hooks';
import { monthBefore, moneyTrend } from '../lib/change';
import { tripDay } from '../lib/clients';
import { addDays, ago, dayInZone, firstOfMonth, firstOfNextMonth, formatDay } from '../lib/dates';
import { monthLabel } from '../lib/drivers';
import { count, money } from '../lib/format';
import { type CompanyMonth, generalTotal, type Money, monthCosts, monthlyProfit, monthsUpTo, NO_TRUCK_KEY, type TripProfit, tripProfits, type TruckMonth } from '../lib/profit';
import { useAddressFilters } from './addressFilters';

const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;

/** An amount that can be a loss: «−$ 6.400». */
const signed = (n: number, c: 'UYU' | 'USD') => (n < 0 ? `−${money(-n, c)}` : money(n, c));

/** Pesos and dollars, each on its own line; «$ 0» when there is neither. */
function parts(m: Money, sign = false): string[] {
  const say = sign ? signed : money;
  const list = [m.UYU !== 0 ? say(m.UYU, 'UYU') : null, m.USD !== 0 ? say(m.USD, 'USD') : null].filter((p): p is string => p !== null);
  return list.length > 0 ? list : ['$ 0'];
}

const Lines = ({ m, sign = false }: { m: Money; sign?: boolean }) => (
  <span className="amount-lines">
    {parts(m, sign).map((p) => (
      <span key={p}>{p}</span>
    ))}
  </span>
);

const isLoss = (m: Money) => m.UYU < 0 || m.USD < 0;
const tollMoney = (pesos: number): Money => ({ UYU: pesos, USD: 0 });

/** The months to choose from: the last two years, the newest first. */
const choices = (today: string) => monthsUpTo(today, 24).reverse();

/** «2026-09» of the address as the first day of that month; the month going on when it is missing or later. */
function chosenMonth(raw: string | null, today: string): string {
  const current = firstOfMonth(today);
  if (!raw || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return current;
  const month = `${raw}-01`;
  return month > current ? current : month;
}

/** Why the profit could not be read, in the office's words. */
function profitReadError(e: unknown): string {
  return e instanceof DataError && e.code === TOO_MANY
    ? 'Hay demasiados viajes, boletas o gastos para leerlos todos de una vez, y una ganancia con una parte daría mal. Avisá para pasar las cuentas a la base.'
    : 'No se pudo leer todo lo que hace falta para la ganancia: los viajes, el combustible, los peajes, los gastos, la flota y los sueldos.';
}

/** A line of the way to the profit: what it is, where it comes from, and its amounts. */
function Step({ label, source, m, sign = false, total = false, minus = false }: { label: string; source?: string; m: Money; sign?: boolean; total?: boolean; minus?: boolean }) {
  return (
    <tr className={total ? 'is-total' : undefined}>
      <td>
        <span className="pf-step">
          {minus && <span aria-hidden="true">− </span>}
          {label}
        </span>
        {source && <small className="pf-source">{source}</small>}
      </td>
      <td className="num">{m.UYU === 0 && !total ? '—' : sign ? signed(m.UYU, 'UYU') : money(m.UYU, 'UYU')}</td>
      <td className="num">{m.USD === 0 && !total ? '—' : sign ? signed(m.USD, 'USD') : money(m.USD, 'USD')}</td>
    </tr>
  );
}

/** How a month gets to its profit: the fleet's, then the rest of the company's costs. */
function Breakdown({ m }: { m: CompanyMonth }) {
  const g = m.general;
  return (
    <section className="card">
      <header className="card-head">
        <h2 className="card-title">Cómo se llega a la ganancia</h2>
        <span className="updated">{monthLabel(m.month, true)}</span>
      </header>
      <div className="statement-scroll">
        <table className="metrics-table pf-steps" aria-label={`Cómo se llega a la ganancia de ${monthLabel(m.month)}`}>
          <thead>
            <tr>
              <th scope="col">Concepto</th>
              <th scope="col" className="num">
                Pesos
              </th>
              <th scope="col" className="num">
                Dólares
              </th>
            </tr>
          </thead>
          <tbody>
            <Step label="Facturado" source="Declarado: el importe de cada viaje, como lo completó la oficina" m={m.fleet.billed} />
            <Step minus label="Combustible" source="Declarado: las boletas del mes" m={m.fleet.fuel} />
            <Step minus label="Peajes" source="Estimado: los pasos que vio el GPS, con la tarifa de cada camión" m={tollMoney(m.fleet.tolls)} />
            <Step minus label="Gastos de camiones, acoplados y viajes" source="Declarado: lo cargado en Gastos" m={m.fleet.expenses} />
            <Step total sign label="Lo que dejó la flota" m={m.fleet.result} />
            <Step minus label="Gastos de la empresa" m={g.company} />
            <Step minus label="Gastos de los choferes" m={g.drivers} />
            {(g.trailers.UYU !== 0 || g.trailers.USD !== 0) && <Step minus label="Gastos de acoplados que no iban enganchados" source="Ese día ningún camión los llevaba, según Flota" m={g.trailers} />}
            <Step minus label="Sueldos del mes" source="El sueldo de cada chofer para ese mes, en Choferes, se haya pagado o no" m={m.salaries} />
            <Step minus label="Viáticos del mes" source="Lo pagado a los choferes como viático de ese mes, en Choferes" m={m.viaticos} />
            <Step total sign label="Ganancia de la empresa" m={m.result} />
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TruckRow({ t, foot = false }: { t: TruckMonth; foot?: boolean }) {
  const cells = (
    <>
      <td title={t.label}>{t.label}</td>
      <td className="num">{count(t.trips)}</td>
      <td className="num">
        <Lines m={t.billed} />
      </td>
      <td className="num">
        <Lines m={t.fuel} />
      </td>
      <td className="num">{t.tolls === 0 ? '$ 0' : money(t.tolls, 'UYU')}</td>
      <td className="num">
        <Lines m={t.expenses} />
      </td>
      <td className={`num${isLoss(t.result) ? ' is-loss' : ''}`}>
        <Lines m={t.result} sign />
      </td>
    </>
  );
  return foot ? <tr>{cells}</tr> : <tr className={t.key === NO_TRUCK_KEY ? 'is-unnamed' : undefined}>{cells}</tr>;
}

function Trucks({ m }: { m: CompanyMonth }) {
  return (
    <section className="card metrics-table-card">
      <header className="card-head">
        <h2 className="card-title">Cada camión</h2>
        <span className="updated">Sin los sueldos ni los gastos generales</span>
      </header>
      {m.trucks.length === 0 ? (
        <Empty icon="truck" title="Ningún camión viajó ni tuvo gastos este mes" />
      ) : (
        <div className="statement-scroll">
          <table className="metrics-table" aria-label={`Ganancia de cada camión en ${monthLabel(m.month)}`}>
            <thead>
              <tr>
                <th scope="col">Camión</th>
                <th scope="col" className="num">
                  Viajes
                </th>
                <th scope="col" className="num">
                  Facturado
                </th>
                <th scope="col" className="num">
                  Combustible
                </th>
                <th scope="col" className="num">
                  Peajes
                </th>
                <th scope="col" className="num">
                  Gastos
                </th>
                <th scope="col" className="num">
                  Lo que dejó
                </th>
              </tr>
            </thead>
            <tbody>
              {m.trucks.map((t) => (
                <TruckRow key={t.key} t={t} />
              ))}
            </tbody>
            <tfoot>
              <TruckRow foot t={m.fleet} />
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

const tripName = (t: TripProfit['trip']) => [t.orderNumber ? `Orden ${t.orderNumber}` : null, t.client, [t.originName, t.destinationName].filter(Boolean).join(' → ') || null].filter(Boolean).join(' · ') || 'Viaje sin datos';

function Trips({ list, month }: { list: TripProfit[]; month: string }) {
  return (
    <section className="card metrics-table-card">
      <header className="card-head">
        <h2 className="card-title">Cada viaje</h2>
        <span className="updated">Con su combustible, sus peajes y sus gastos, de cualquier día</span>
      </header>
      {list.length === 0 ? (
        <Empty icon="route" title={`No hubo viajes en ${monthLabel(month)}`} />
      ) : (
        <div className="statement-scroll">
          <table className="metrics-table" aria-label={`Ganancia de cada viaje de ${monthLabel(month)}`}>
            <thead>
              <tr>
                <th scope="col">Viaje</th>
                <th scope="col">Camión</th>
                <th scope="col" className="num">
                  Facturado
                </th>
                <th scope="col" className="num">
                  Combustible
                </th>
                <th scope="col" className="num">
                  Peajes
                </th>
                <th scope="col" className="num">
                  Gastos
                </th>
                <th scope="col" className="num">
                  Lo que dejó
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const day = tripDay(p.trip);
                return (
                  <tr key={p.trip.key}>
                    <td title={tripName(p.trip)}>
                      <Link to={`/viajes/${p.trip.key}`}>{day ? formatDay(day) : 'Sin fecha'}</Link> <span className="muted">{tripName(p.trip)}</span>
                    </td>
                    <td>{p.trip.vehicle ?? 'Sin camión'}</td>
                    <td className="num">{p.missing ? <Pill tone="red">Sin importe</Pill> : p.trip.active && p.billed.UYU === 0 && p.billed.USD === 0 ? <Pill tone="blue">En curso</Pill> : <Lines m={p.billed} />}</td>
                    <td className="num">
                      <Lines m={p.fuel} />
                    </td>
                    <td className="num">
                      {p.tolls === 0 ? '$ 0' : money(p.tolls, 'UYU')}
                      {p.tollsWithoutRate > 0 && <small className="pf-source">{plural(p.tollsWithoutRate, 'paso sin tarifa', 'pasos sin tarifa')}</small>}
                    </td>
                    <td className="num">
                      <Lines m={p.expenses} />
                    </td>
                    <td className={`num${isLoss(p.result) ? ' is-loss' : ''}`}>
                      <Lines m={p.result} sign />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Months({ list, chosen, onChoose }: { list: CompanyMonth[]; chosen: string; onChoose: (month: string) => void }) {
  return (
    <section className="card metrics-table-card">
      <header className="card-head">
        <h2 className="card-title">Mes a mes</h2>
        <span className="updated">Los últimos 12 meses hasta el elegido</span>
      </header>
      <div className="statement-scroll">
        <table className="metrics-table" aria-label="Ganancia de la empresa mes a mes">
          <thead>
            <tr>
              <th scope="col">Mes</th>
              <th scope="col" className="num">
                Facturado
              </th>
              <th scope="col" className="num">
                Costos de la flota
              </th>
              <th scope="col" className="num">
                Gastos generales
              </th>
              <th scope="col" className="num">
                Sueldos y viáticos
              </th>
              <th scope="col" className="num">
                Ganancia
              </th>
            </tr>
          </thead>
          <tbody>
            {[...list].reverse().map((m) => {
              const fleetCosts: Money = { UYU: m.fleet.fuel.UYU + m.fleet.tolls + m.fleet.expenses.UYU, USD: m.fleet.fuel.USD + m.fleet.expenses.USD };
              const people: Money = { UYU: m.salaries.UYU + m.viaticos.UYU, USD: m.salaries.USD + m.viaticos.USD };
              return (
                <tr key={m.month} className={m.month === chosen ? 'is-chosen' : undefined} aria-current={m.month === chosen ? 'true' : undefined}>
                  <td>
                    <button type="button" className="link-button" onClick={() => onChoose(m.month)}>
                      {monthLabel(m.month, true)}
                    </button>
                  </td>
                  <td className="num">
                    <Lines m={m.fleet.billed} />
                  </td>
                  <td className="num">
                    <Lines m={fleetCosts} />
                  </td>
                  <td className="num">
                    <Lines m={generalTotal(m.general)} />
                  </td>
                  <td className="num">
                    <Lines m={people} />
                  </td>
                  <td className={`num${isLoss(m.result) ? ' is-loss' : ''}`}>
                    <Lines m={m.result} sign />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function Ganancia() {
  const now = useNow(60_000);
  const today = dayInZone(now);
  const { params, set } = useAddressFilters();
  const { input, reads } = useProfit();
  const month = chosenMonth(params.get('mes'), today);
  const current = firstOfMonth(today);
  const before = monthBefore(month, today);

  const all = [reads.trips, reads.fuel, reads.tolls, reads.expenses, reads.vehicles, reads.drivers];
  const loading = all.some((r) => r.isLoading) || reads.catalog.isLoading;
  const failed = all.find((r) => r.error && r.data === undefined);
  const ready = !loading && !failed && all.every((r) => r.data !== undefined);
  const stale = all.some((r) => r.error && r.data !== undefined);
  const loadedAt = Math.min(...all.map((r) => r.dataUpdatedAt || Infinity));
  const refresh = () => void Promise.all(all.map((r) => r.refetch()));

  const months = useMemo(() => (ready ? monthlyProfit(input, monthsUpTo(month, 12)) : []), [ready, input, month]);
  // The month going on goes against the same days of the month before; a past one, against the whole month before.
  const [prev] = useMemo(() => (ready ? monthlyProfit(input, [before.from], new Map([[before.from, before.to]])) : []), [ready, input, before.from, before.to]);
  const chosen = months.at(-1);
  const trips = useMemo(
    () =>
      ready
        ? tripProfits(
            input.trips.filter((t) => {
              const day = tripDay(t);
              return day !== null && firstOfMonth(day) === month;
            }),
            input,
          ).sort((a, b) => (a.trip.departureAt ?? '').localeCompare(b.trip.departureAt ?? ''))
        : [],
    [ready, input, month],
  );

  const choose = (m: string) => set({ mes: m === current ? null : m.slice(0, 7) });
  // A month older than the list (from a link) is offered too; any month has the one before it.
  const options = choices(today).includes(month) ? choices(today) : [...choices(today), month];
  const older = firstOfMonth(addDays(month, -1));
  const newer = month < current ? firstOfNextMonth(month) : undefined;
  const costs = chosen ? monthCosts(chosen) : null;
  const notes: ReactNode[] = [];
  if (chosen && chosen.fleet.missing > 0)
    notes.push(
      <p key="missing" className="notice notice-warn">
        <Icon name="warning" size={18} /> {chosen.fleet.missing === 1 ? 'Un viaje terminado no tiene importe: lo que dejó no se sabe hasta completarlo en Viajes.' : `${count(chosen.fleet.missing)} viajes terminados no tienen importe: lo que dejaron no se sabe hasta completarlos en Viajes.`}
      </p>,
    );
  if (chosen && chosen.fleet.tollsWithoutRate > 0)
    notes.push(
      <p key="rates" className="notice notice-warn">
        <Icon name="warning" size={18} /> {chosen.fleet.tollsWithoutRate === 1 ? 'Un paso por un peaje no tiene tarifa: no suma.' : `${count(chosen.fleet.tollsWithoutRate)} pasos por peajes no tienen tarifa: no suman.`} Cargá la tarifa de cada camión en GPS, en su cuenta.
      </p>,
    );

  return (
    <div className="page">
      <PageHead title="Gastos y finanzas" subtitle="Lo que dejó cada mes: lo facturado menos el combustible, los peajes y los gastos de cada camión, y después los gastos generales, los sueldos y los viáticos. Pesos y dólares por separado." />
      <FinanceTabs />

      <section className="card filters" aria-label="Elegir el mes">
        <label className="field">
          <span>Mes</span>
          <select value={month} onChange={(e) => choose(e.target.value)}>
            {options.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m, true)}
                {m === current ? ' (en curso)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="pf-month-nav">
          <button type="button" className="btn btn-quiet" onClick={() => choose(older)}>
            <Icon name="chevron" size={16} className="flip" /> Mes anterior
          </button>
          <button type="button" className="btn btn-quiet" disabled={!newer} onClick={() => newer && choose(newer)}>
            Mes siguiente <Icon name="chevron" size={16} />
          </button>
        </div>
        <div className="list-info">
          {Number.isFinite(loadedAt) && <span className="updated">actualizado {ago(loadedAt, now)}</span>}
          <RefreshButton onClick={refresh} busy={all.some((r) => r.isFetching)} />
        </div>
      </section>

      {stale && <StaleNote onRetry={refresh} />}

      {failed ? (
        <ErrorNote onRetry={refresh}>{profitReadError(failed.error)}</ErrorNote>
      ) : !ready || !chosen || !costs || !prev ? (
        <div className="card card-body">
          <Skeleton lines={8} />
        </div>
      ) : (
        <>
          <div className="stats stats-money">
            <Stat
              featured
              label={month === current ? 'Ganancia del mes, hasta hoy' : 'Ganancia del mes'}
              value={<Lines m={chosen.result} sign />}
              detail="Lo facturado menos todos los costos"
              trend={moneyTrend(chosen.result, prev.result, before.than, 'up')}
              tone="blue"
              icon="money"
            />
            <Stat label="Facturado" value={<Lines m={chosen.fleet.billed} />} detail={plural(chosen.fleet.trips, 'viaje', 'viajes')} trend={moneyTrend(chosen.fleet.billed, prev.fleet.billed, before.than, 'up')} tone="grey" icon="route" />
            <Stat label="Costos" value={<Lines m={costs} />} detail="Combustible, peajes, gastos, sueldos y viáticos" trend={moneyTrend(costs, monthCosts(prev), before.than, 'down')} tone="grey" icon="chart" />
            <Stat
              label="Viajes sin importe"
              value={count(chosen.fleet.missing)}
              detail={chosen.fleet.missing > 0 ? 'Completalos para que sumen' : 'Todos tienen importe'}
              tone={chosen.fleet.missing > 0 ? 'red' : 'green'}
              icon="warning"
            />
          </div>
          {notes}
          <Breakdown m={chosen} />
          <Trucks m={chosen} />
          <Trips list={trips} month={month} />
          <Months list={months} chosen={month} onChoose={choose} />
          <p className="note">
            En el mes, cada cosa cuenta en su día: el viaje en el de su salida, la boleta en el suyo, el peaje en el del paso y el gasto en el que se hizo. El gasto de un viaje va con el camión de ese viaje, y el de un acoplado con el camión que lo llevaba ese día, según Flota. Los sueldos no se reparten entre los camiones: se restan en el total de la empresa. Los viajes en la papelera, las boletas en la papelera y los gastos anulados no cuentan.
          </p>
        </>
      )}
    </div>
  );
}
