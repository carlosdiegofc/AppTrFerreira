// Métricas (decision of 21/10/2026): what each truck and each driver did in a period, with the numbers of «Rendimiento»
// in the app. The kilometres come from the GPS (measured), the kilos, billable kilometres, amounts and receipts from the
// office and the drivers (declared), and the consumption is a calculation (estimated): the page says which is which.
import { type ReactNode, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BarRows, type BarRow, ChartData, type Column, Columns, Legend, TipLine } from '../components/Charts';
import { Icon } from '../components/Icon';
import { CatalogNote, Empty, ErrorNote, PageHead, RefreshButton, Skeleton, StaleNote, Stat } from '../components/ui';
import { useBilledTrips, useFuel, useNow, useTripList } from '../data/hooks';
import type { MetricsFormat } from '../exports/metrics';
import { ago, dayInZone, firstOfMonth, firstOfNextMonth, formatDay, startOfDay } from '../lib/dates';
import { truckLabel } from '../lib/fleet';
import { count, decimal, money, number, percent } from '../lib/format';
import type { Currency } from '../lib/fuel';
import { billingByMonth, fuelInPeriod, idleTrucks, kmByDay, litersPer100, loadedShare, type MetricsBy, type MetricsRow, monthsBefore, niceTicks, type SortKey, sortRows, summarize } from '../lib/metrics';
import { METRICS_NOTE, moneyParts, TABLE_COLUMNS } from '../lib/metricsTable';
import { type PeriodKind, periodRange, periodToIso } from '../lib/trips';
import { useAddressFilters } from './addressFilters';

const PERIODS: { value: string; kind: PeriodKind; label: string }[] = [
  { value: 'mes', kind: 'month', label: 'Este mes' },
  { value: 'mes-anterior', kind: 'prev-month', label: 'Mes anterior' },
  { value: '30', kind: '30', label: 'Últimos 30 días' },
  { value: '90', kind: '90', label: 'Últimos 90 días' },
  { value: 'fechas', kind: 'custom', label: 'Elegir fechas…' },
];

const VIEWS: { value: string; by: MetricsBy; label: string; who: string; param: string }[] = [
  { value: 'camiones', by: 'vehicle', label: 'Por camión', who: 'Camión', param: 'camion' },
  { value: 'choferes', by: 'driver', label: 'Por chofer', who: 'Chofer', param: 'chofer' },
];

const km = (v: number) => `${number(v)} km`;
/** With one decimal always, like «Rendimiento» in the app. */
const per100 = (v: number) => `${number(v, 1)} L/100 km`;
const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;
/** An axis tick the Uruguayan way: 900, 10 mil, 1,5 M. */
const compact = (v: number) => (v >= 1e6 ? `${decimal(v / 1e6, 1)} M` : v >= 1000 ? `${decimal(v / 1000, 1)} mil` : decimal(v, 1));
const monthShort = new Intl.DateTimeFormat('es-UY', { month: 'short', timeZone: 'UTC' });
const monthLong = new Intl.DateTimeFormat('es-UY', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const atNoon = (day: string) => Date.parse(day + 'T12:00:00Z');

/** Each currency on its own line. */
const Lines = ({ parts, empty = '—' }: { parts: string[]; empty?: string }) => (
  <span className="amount-lines">
    {(parts.length > 0 ? parts : [empty]).map((p) => (
      <span key={p}>{p}</span>
    ))}
  </span>
);

function Chart({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="card viz-card">
      <header className="card-head">
        <h2 className="card-title">{title}</h2>
      </header>
      <div className="card-body">
        {children}
        {note && <p className="note">{note}</p>}
      </div>
    </section>
  );
}

/** The kilometres of each truck (or driver), with cargo and without, longest first. */
function KmRows({ rows, label }: { rows: readonly MetricsRow[]; label: string }) {
  const moving = rows.filter((r) => r.gpsKm > 0).sort((a, b) => b.gpsKm - a.gpsKm);
  if (moving.length === 0) return <Empty icon="route" title="Sin kilómetros del GPS en el período" />;
  const bars: BarRow[] = moving.map((r) => ({
    key: r.name,
    label: r.name,
    parts: [
      { value: r.loadedKm, series: 1 },
      { value: r.emptyKm, series: 2 },
    ],
    value: km(r.gpsKm),
    tip: (
      <>
        <strong>{r.name}</strong>
        <TipLine series={1} value={km(r.loadedKm)} label="con carga" />
        <TipLine series={2} value={km(r.emptyKm)} label="sin carga" />
        <TipLine value={plural(r.trips, 'viaje', 'viajes')} label="" />
      </>
    ),
  }));
  return (
    <>
      <Legend
        items={[
          { series: 1, label: 'Con carga' },
          { series: 2, label: 'Sin carga' },
        ]}
      />
      <BarRows label={label} rows={bars} />
    </>
  );
}

/** The estimated consumption of each truck (or driver) that has it, against the fleet's. */
function ConsumptionRows({ rows, fleet, label }: { rows: readonly MetricsRow[]; fleet: number | null; label: string }) {
  const measured = rows.flatMap((r) => {
    const v = litersPer100(r);
    return v === null ? [] : [{ r, v }];
  });
  if (measured.length === 0) {
    return (
      <Empty icon="fuel" title="Todavía no se puede calcular">
        Hacen falta boletas con litros y 300 km o más del GPS en el período.
      </Empty>
    );
  }
  const bars: BarRow[] = measured
    .sort((a, b) => b.v - a.v)
    .map(({ r, v }) => ({
      key: r.name,
      label: r.name,
      parts: [{ value: v, series: 1 }],
      value: number(v, 1),
      tip: (
        <>
          <strong>{r.name}</strong>
          <TipLine series={1} value={per100(v)} label="estimado" />
          <TipLine value={`${decimal(r.liters, 1)} L`} label={`en ${km(r.gpsKm)}`} />
        </>
      ),
    }));
  return (
    <>
      {fleet !== null && (
        <p className="viz-caption">
          <span className="viz-average-key" aria-hidden="true" /> Promedio de la flota: {per100(fleet)}
        </p>
      )}
      <BarRows label={label} rows={bars} average={fleet ?? undefined} />
    </>
  );
}

/** The kilometres of the period day by day (or week by week), with cargo and without. */
function KmDays({ data }: { data: ReturnType<typeof kmByDay> }) {
  const { step, buckets } = data;
  const totals = buckets.map((b) => b.loadedKm + b.emptyKm);
  const most = totals.reduce((best, v, i) => (v > (totals[best] ?? 0) ? i : best), 0);
  if (!buckets.some((b) => b.loadedKm + b.emptyKm > 0)) return <Empty icon="route" title="Sin kilómetros del GPS en el período" />;
  const when = (b: (typeof buckets)[number]) => (step === 'day' ? formatDay(b.from) : `Del ${formatDay(b.from).slice(0, 5)} al ${formatDay(b.to).slice(0, 5)}`);
  // The labels a phone (or a long period) shows: the 1st and every 5th day, or about seven weeks, and the ends of the
  // period when no other label is next to them.
  const everyWeeks = Math.max(1, Math.ceil(buckets.length / 7));
  const base = buckets.map((b, i) => (step === 'day' ? Number(b.from.slice(8)) === 1 || Number(b.from.slice(8)) % 5 === 0 : i % everyWeeks === 0));
  const near = (i: number) => base.some((m, j) => m && j !== i && Math.abs(j - i) <= 2);
  const columns: Column[] = buckets.map((b, i) => {
    const day = Number(b.from.slice(8));
    return {
      key: b.from,
      label: step === 'day' ? String(day) : formatDay(b.from).slice(0, 5),
      major: Boolean(base[i]) || ((i === 0 || i === buckets.length - 1) && !near(i)),
      parts: [
        { value: b.loadedKm, series: 1 },
        { value: b.emptyKm, series: 2 },
      ],
      tip: (
        <>
          <strong>{when(b)}</strong>
          <TipLine series={1} value={km(b.loadedKm)} label="con carga" />
          <TipLine series={2} value={km(b.emptyKm)} label="sin carga" />
          <TipLine value={plural(b.trips, 'viaje', 'viajes')} label="" />
        </>
      ),
    };
  });
  return (
    <>
      <Legend
        items={[
          { series: 1, label: 'Con carga' },
          { series: 2, label: 'Sin carga' },
        ]}
      />
      <Columns label={step === 'day' ? 'Kilómetros por día' : 'Kilómetros por semana'} columns={columns} ticks={niceTicks(Math.max(...totals))} tick={compact} valueLabel={{ index: most, text: km(totals[most] ?? 0) }} />
      <ChartData
        caption={step === 'day' ? 'Kilómetros por día' : 'Kilómetros por semana'}
        head={[step === 'day' ? 'Día' : 'Semana', 'Con carga', 'Sin carga', 'Viajes']}
        rows={buckets.map((b) => [when(b), km(b.loadedKm), km(b.emptyKm), count(b.trips)])}
      />
    </>
  );
}

/** What was billed month by month in the last 12 months, one chart per currency. */
function Billing({ months }: { months: ReturnType<typeof billingByMonth> }) {
  const currencies = (['UYU', 'USD'] as Currency[]).filter((c) => months.some((m) => m.billed[c] !== 0));
  if (currencies.length === 0) {
    return (
      <Empty icon="money" title="Todavía no hay importes cargados">
        Los importes de los viajes se completan en Viajes.
      </Empty>
    );
  }
  return (
    <div className={currencies.length > 1 ? 'viz-pair' : undefined}>
      {currencies.map((c) => {
        const values = months.map((m) => m.billed[c]);
        const last = values.length - 1;
        const columns: Column[] = months.map((m, i) => ({
          key: m.month,
          label: monthShort.format(atNoon(m.month)).replace('.', ''),
          major: i % 2 === last % 2,
          parts: [{ value: m.billed[c], series: 1 }],
          tip: (
            <>
              <strong className="cap">{monthLong.format(atNoon(m.month))}</strong>
              <TipLine series={1} value={money(m.billed[c], c)} label="facturado" />
              <TipLine value={plural(m.trips, 'viaje', 'viajes')} label={m.unbilled > 0 ? `· ${count(m.unbilled)} sin importe` : ''} />
            </>
          ),
        }));
        return (
          <div key={c} className="viz-currency">
            <h3 className="viz-subtitle">{c === 'USD' ? 'En dólares' : 'En pesos'}</h3>
            <Columns label={`Facturado por mes ${c === 'USD' ? 'en dólares' : 'en pesos'}`} columns={columns} ticks={niceTicks(Math.max(...values))} tick={compact} valueLabel={{ index: last, text: money(values[last] ?? 0, c) }} />
          </div>
        );
      })}
      <ChartData
        caption="Facturado por mes"
        head={['Mes', ...currencies.map((c) => (c === 'USD' ? 'En dólares' : 'En pesos')), 'Viajes', 'Sin importe']}
        rows={months.map((m) => [monthLong.format(atNoon(m.month)), ...currencies.map((c) => money(m.billed[c], c)), count(m.trips), count(m.unbilled)])}
      />
    </div>
  );
}

function SortHeader({ label, column, sort, onSort, numeric }: { label: string; column: SortKey; sort: { key: SortKey; ascending: boolean }; onSort: (key: SortKey) => void; numeric: boolean }) {
  const on = sort.key === column;
  return (
    <th scope="col" className={numeric ? 'num' : undefined} aria-sort={on ? (sort.ascending ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`sort${on ? ' is-on' : ''}`} onClick={() => onSort(column)}>
        {label}
        <span aria-hidden="true">{on ? (sort.ascending ? ' ▲' : ' ▼') : ''}</span>
      </button>
    </th>
  );
}

export function Metricas() {
  const now = useNow(60_000);
  const today = dayInZone(now);
  const { params, set } = useAddressFilters();
  const period = PERIODS.find((p) => p.value === params.get('periodo')) ?? PERIODS[0]!;
  const range = period.kind === 'custom' ? { from: params.get('desde') ?? firstOfMonth(today), to: params.get('hasta') ?? today } : periodRange(period.kind, today);
  const { from, to } = range;
  const instants = periodToIso(from, to);
  const view = VIEWS.find((v) => v.value === params.get('vista')) ?? VIEWS[0]!;
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({ key: 'gpsKm', ascending: false });
  const [exporting, setExporting] = useState<MetricsFormat | null>(null);
  const [exportFailed, setExportFailed] = useState(false);

  const { trips, query, catalog } = useTripList(instants?.fromIso ?? null, instants?.toIso ?? null);
  const fuel = useFuel();
  const yearFrom = monthsBefore(today, 11);
  const billed = useBilledTrips(startOfDay(yearFrom), startOfDay(firstOfNextMonth(today)));

  const valid = instants !== null;
  const receipts = useMemo(() => (valid ? fuelInPeriod(fuel.receipts, from, to) : []), [valid, fuel.receipts, from, to]);
  const metrics = useMemo(() => summarize(trips, receipts, view.by), [trips, receipts, view.by]);
  const rows = useMemo(() => sortRows(metrics.rows, sort.key, sort.ascending), [metrics.rows, sort]);
  const days = useMemo(() => (valid ? kmByDay(trips, from, to) : { step: 'day' as const, buckets: [] }), [valid, trips, from, to]);
  const months = useMemo(() => billingByMonth(billed.data ?? [], today), [billed.data, today]);
  const idle = view.by === 'vehicle' ? idleTrucks(metrics.rows, (catalog.data ?? []).map(truckLabel)) : [];
  const total = metrics.total;
  const fleetPer100 = litersPer100(total);
  const share = loadedShare(total);
  const noFuel = fuel.query.data === undefined;

  const choosePeriod = (value: string) => {
    if (value === 'fechas') set({ periodo: value, desde: from, hasta: to });
    else set({ periodo: value === 'mes' ? null : value, desde: null, hasta: null });
  };
  const onSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, ascending: !s.ascending } : { key, ascending: key === 'name' }));
  const tripsOf = (r: MetricsRow) => `/viajes?${new URLSearchParams({ periodo: 'fechas', desde: from, hasta: to, [view.param]: r.name }).toString()}`;
  const refresh = () => void Promise.all([query.refetch(), fuel.query.refetch(), billed.refetch()]);
  const loadedAt = query.dataUpdatedAt || null;
  const what = `Del ${formatDay(from)} al ${formatDay(to)}`;

  const exportTable = async (format: MetricsFormat) => {
    setExporting(format);
    setExportFailed(false);
    try {
      const { downloadMetrics } = await import('../exports/metrics');
      await downloadMetrics(format, { rows, total }, { title: `Métricas del ${formatDay(from)} al ${formatDay(to)}`, subtitle: view.label, fileBase: `metricas_${view.value}_${from}_a_${to}`, who: view.who });
    } catch (e) {
      console.error(e);
      setExportFailed(true);
    } finally {
      setExporting(null);
    }
  };
  const exportButton = (format: MetricsFormat, label: string) => (
    <button type="button" className={`btn btn-quiet${exporting === format ? ' is-busy' : ''}`} disabled={exporting !== null || rows.length === 0} onClick={() => void exportTable(format)}>
      <Icon name="doc" size={18} />
      <span className="btn-text">{label}</span>
    </button>
  );

  const ready = valid && query.data !== undefined && !catalog.isLoading && !fuel.query.isLoading;

  return (
    <div className="page">
      <PageHead
        title="Métricas"
        subtitle="El rendimiento de cada camión y de cada chofer: kilómetros, facturación, combustible y consumo."
        actions={
          <div className="export-group" role="group" aria-label="Exportar la tabla">
            <span className="export-label">Exportar</span>
            {exportButton('xlsx', 'Excel')}
            {exportButton('pdf', 'PDF')}
          </div>
        }
      />
      {exportFailed && <ErrorNote>No se pudo armar el archivo. Probá de nuevo.</ErrorNote>}

      <section className="card filters" aria-label="Filtros">
        <label className="field">
          <span>Período</span>
          <select value={period.value} onChange={(e) => choosePeriod(e.target.value)}>
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {period.kind === 'custom' && (
          <>
            <label className="field">
              <span>Desde</span>
              <input type="date" value={from} max={to} onChange={(e) => set({ desde: e.target.value })} />
            </label>
            <label className="field">
              <span>Hasta</span>
              <input type="date" value={to} min={from} onChange={(e) => set({ hasta: e.target.value })} />
            </label>
          </>
        )}
      </section>

      <div className="list-bar">
        <div className="chips" role="group" aria-label="Ver por">
          {VIEWS.map((v) => (
            <button key={v.value} type="button" className={`chip${view.value === v.value ? ' is-on' : ''}`} aria-pressed={view.value === v.value} onClick={() => set({ vista: v.value === 'camiones' ? null : v.value })}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="list-info">
          {loadedAt !== null && <span className="updated">actualizado {ago(loadedAt, now)}</span>}
          <RefreshButton onClick={refresh} busy={query.isFetching || fuel.query.isFetching || billed.isFetching} />
        </div>
      </div>

      {valid && query.error && query.data !== undefined && <StaleNote onRetry={() => void query.refetch()} />}
      {catalog.error && <CatalogNote onRetry={() => void catalog.refetch()} />}
      {fuel.query.error && (
        <StaleNote onRetry={() => void fuel.query.refetch()}>{noFuel ? 'No se pudieron leer las boletas: el combustible y el consumo no se ven ahora.' : 'No se pudieron actualizar las boletas: el combustible es el de la última lectura.'}</StaleNote>
      )}

      {!valid ? (
        <ErrorNote>Revisá las fechas: «hasta» no puede ser antes de «desde».</ErrorNote>
      ) : query.error && query.data === undefined ? (
        <ErrorNote onRetry={() => void query.refetch()}>No se pudieron leer los viajes.</ErrorNote>
      ) : !ready ? (
        <div className="card card-body">
          <Skeleton lines={6} />
        </div>
      ) : (
        <>
          <div className="stats stats-money metrics-stats">
            <Stat label="Kilómetros del GPS" value={km(total.gpsKm)} detail={`${plural(total.trips, 'viaje', 'viajes')}${share === null ? '' : ` · ${percent(share)} con carga`}`} tone="blue" icon="route" />
            <Stat
              label="Facturado"
              value={<Lines parts={moneyParts(total.billed)} empty="$ 0" />}
              detail={total.trips === 0 ? 'Sin viajes en el período' : total.unbilled > 0 ? `Falta el importe de ${plural(total.unbilled, 'viaje', 'viajes')}` : 'Todos los viajes con carga tienen importe'}
              tone={total.unbilled > 0 ? 'amber' : 'green'}
              icon="money"
            />
            <Stat label="Combustible" value={noFuel ? '—' : <Lines parts={moneyParts(total.fuel)} empty="$ 0" />} detail={noFuel ? 'Sin leer las boletas' : `${decimal(total.liters, 1)} litros`} tone="grey" icon="fuel" />
            <Stat
              label="Consumo estimado"
              value={
                fleetPer100 === null ? (
                  '—'
                ) : (
                  <>
                    {number(fleetPer100, 1)} <span className="stat-unit">L/100 km</span>
                  </>
                )
              }
              detail={fleetPer100 !== null ? `${number(100 / fleetPer100, 1)} km por litro` : total.liters <= 0 ? 'Sin boletas con litros' : 'Se calcula con 300 km o más'}
              tone="grey"
              icon="speed"
            />
          </div>

          <div className="viz-grid">
            <Chart title={view.by === 'vehicle' ? 'Kilómetros por camión' : 'Kilómetros por chofer'}>
              <KmRows rows={metrics.rows} label={view.by === 'vehicle' ? 'Kilómetros por camión' : 'Kilómetros por chofer'} />
            </Chart>
            <Chart title={view.by === 'vehicle' ? 'Consumo por camión' : 'Consumo por chofer'} note="Estimado: los litros de las boletas del período por cada 100 km del GPS.">
              {noFuel ? <Empty icon="fuel" title="Sin leer las boletas" /> : <ConsumptionRows rows={metrics.rows} fleet={fleetPer100} label={view.by === 'vehicle' ? 'Consumo por camión' : 'Consumo por chofer'} />}
            </Chart>
          </div>
          <Chart title={days.step === 'day' ? 'Kilómetros por día' : 'Kilómetros por semana'} note="Cada viaje cuenta en el día en que empezó.">
            <KmDays data={days} />
          </Chart>

          <section className="card metrics-table-card">
            <header className="card-head">
              <h2 className="card-title">{view.label}</h2>
              <span className="updated">{what}</span>
            </header>
            {rows.length === 0 ? (
              <Empty icon="chart" title="Sin viajes ni combustible en el período" />
            ) : (
              <div className="statement-scroll">
                <table className="metrics-table" aria-label={`Métricas ${view.label.toLowerCase()}`}>
                  <thead>
                    <tr>
                      <SortHeader label={view.who} column="name" sort={sort} onSort={onSort} numeric={false} />
                      {TABLE_COLUMNS.map((c) => (
                        <SortHeader key={c.key} label={c.header} column={c.key} sort={sort} onSort={onSort} numeric />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.name} className={r.named ? undefined : 'is-unnamed'}>
                        <td title={r.name}>{r.named ? <Link to={tripsOf(r)}>{r.name}</Link> : r.name}</td>
                        {TABLE_COLUMNS.map((c) => (
                          <td key={c.key} className="num">
                            {c.money ? <Lines parts={moneyParts(c.money(r))} /> : c.text(r)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Toda la flota</td>
                      {TABLE_COLUMNS.map((c) => (
                        <td key={c.key} className="num">
                          {c.money ? <Lines parts={moneyParts(c.money(total))} /> : c.text(total)}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            {idle.length > 0 && <p className="note metrics-idle">Sin movimientos en el período: {idle.join(', ')}.</p>}
          </section>

          <Chart title="Facturado en los últimos 12 meses" note="Por el día en que empezó cada viaje; no depende del período elegido arriba.">
            {billed.error && billed.data === undefined ? <ErrorNote onRetry={() => void billed.refetch()}>No se pudo leer lo facturado de los últimos meses.</ErrorNote> : billed.data === undefined ? <Skeleton lines={4} /> : <Billing months={months} />}
          </Chart>

          <p className="note metrics-note">{METRICS_NOTE} Cada viaje cuenta en el día en que empezó y cada boleta en su fecha (la corregida en el panel, si la hay). Los viajes en la papelera no cuentan, y pesos y dólares van siempre por separado.</p>
        </>
      )}
    </div>
  );
}
