// Gastos y finanzas (decision of 26/10/2026): the expenses of the company with their invoices, by period, by kind and by
// what they went to, pesos and dollars apart; the clients' accounts are in Cobros, next to it. The filters live in the
// address (?periodo=mes&destino=…): going back, reloading or sharing the link keeps them. The profit and the freight
// simulator come in the second delivery of part 12b.
import { type ReactNode, useMemo, useState } from 'react';
import { ExpenseFormDialog } from '../components/ExpenseFormDialog';
import { FinanceTabs } from '../components/FinanceTabs';
import { Icon } from '../components/Icon';
import { type Photo, PhotoDialog } from '../components/PhotoDialog';
import { Empty, ErrorNote, PageHead, Pill, RefreshButton, Skeleton, StaleNote, Stat } from '../components/ui';
import { ConflictError, DataError, describeWriteError, TOO_MANY } from '../data/api';
import { useExpenses, useExpenseTargets, useNow, useSetExpenseDeleted } from '../data/hooks';
import { moneyTrend, periodBefore } from '../lib/change';
import { ago, dayInZone, formatDay } from '../lib/dates';
import {
  byCategory,
  byTarget,
  EXPENSE_CATEGORIES,
  EXPENSE_TARGETS,
  type Expense,
  type ExpenseGroup,
  expenseTotals,
  filterExpenses,
  filterLabel,
  methodLabel,
  presetOf,
  targetKind,
  targetLabel,
  type TargetNames,
  writtenCategories,
} from '../lib/expenses';
import { andList, count, money } from '../lib/format';
import { useAddressFilters } from './addressFilters';
import { PERIODS, rangeOf } from './financePeriods';
import { amountParts, amounts } from './fuelText';

const VIEWS = [
  { value: 'gastos', label: 'Gastos' },
  { value: 'tipos', label: 'Por tipo' },
  { value: 'destinos', label: 'A qué fue' },
  { value: 'anulados', label: 'Anulados' },
] as const;

/** Each currency on its own line. */
const Lines = ({ parts }: { parts: string[] }) => (
  <span className="amount-lines">
    {parts.map((p) => (
      <span key={p}>{p}</span>
    ))}
  </span>
);

function ExpenseRow({ expense, names, onOpen, onFile, action }: { expense: Expense; names: TargetNames; onOpen?: () => void; onFile: () => void; action?: ReactNode }) {
  const e = expense;
  const target = targetLabel(e, names);
  const body = (
    <>
      <span className="ex-date">
        <strong>{formatDay(e.spentOn)}</strong>
        <small>{methodLabel(e.method)}</small>
      </span>
      <span className="ex-main">
        <strong>{e.category}</strong>
        <small>{[e.target === 'company' ? 'La empresa' : `${targetKind(e.target)}: ${target}`, e.supplier || null].filter(Boolean).join(' · ')}</small>
      </span>
      <span className="ex-amount">
        <strong>{money(e.amount, e.currency)}</strong>
        {e.notes ? <small title={e.notes}>{e.notes}</small> : null}
      </span>
      <span className="ex-flags">
        {e.serviceId && <Pill tone="blue">De un service</Pill>}
      </span>
    </>
  );
  return (
    <li className="expense-row">
      {onOpen ? (
        <button type="button" className="ex-open" onClick={onOpen} aria-label={`${e.category} del ${formatDay(e.spentOn)}, ${target}`}>
          {body}
        </button>
      ) : (
        <div className="ex-open">{body}</div>
      )}
      <span className="ex-actions">
        {e.file ? (
          <button type="button" className="btn btn-quiet" onClick={onFile}>
            {e.file.type === 'pdf' ? 'Ver PDF' : 'Ver factura'}
          </button>
        ) : (
          <span className="muted">Sin factura</span>
        )}
        {action}
      </span>
    </li>
  );
}

/** A sum by kind or by what it went to: each line shows its expenses in the list. */
function GroupTable({ groups, label, kindOf, onPick }: { groups: ExpenseGroup[]; label: string; kindOf?: (key: string) => string; onPick: (key: string) => void }) {
  return (
    <div className="statement-scroll">
      <table className="viz-data-table expense-sums" aria-label={label}>
        <thead>
          <tr>
            <th scope="col">{label}</th>
            {kindOf && <th scope="col">Qué es</th>}
            <th scope="col" className="num">
              En pesos
            </th>
            <th scope="col" className="num">
              En dólares
            </th>
            <th scope="col" className="num">
              Gastos
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.key}>
              <td>
                <button type="button" className="link-button" onClick={() => onPick(g.key)} title="Ver estos gastos">
                  {g.label}
                </button>
              </td>
              {kindOf && <td>{kindOf(g.key)}</td>}
              <td className="num">{g.amounts.UYU !== 0 ? money(g.amounts.UYU, 'UYU') : <span className="muted">—</span>}</td>
              <td className="num">{g.amounts.USD !== 0 ? money(g.amounts.USD, 'USD') : <span className="muted">—</span>}</td>
              <td className="num">{count(g.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Finanzas() {
  const now = useNow(60_000);
  const today = dayInZone(now);
  const { params, set, typed, search } = useAddressFilters();
  const { query, expenses } = useExpenses();
  const targets = useExpenseTargets();
  const { names, choices } = targets;
  const restore = useSetExpenseDeleted();
  const [editing, setEditing] = useState<Expense | null>(null);
  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState<Photo | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);

  const view = VIEWS.find((v) => v.value === params.get('vista')) ?? VIEWS[0];
  const period = PERIODS.find((p) => p.value === params.get('periodo')) ?? PERIODS[0];
  const range = rangeOf(period.value, today, params);
  const badRange = range !== null && range.to < range.from;
  const category = params.get('tipo') ?? '';
  const target = params.get('destino') ?? '';
  const from = badRange ? undefined : range?.from;
  const to = badRange ? undefined : range?.to;

  // The period alone, for the sums; with every filter, for the list. Dates the wrong way round give nothing.
  const inPeriod = useMemo(() => (badRange ? [] : filterExpenses(expenses, { from, to, category, target }, names)), [expenses, from, to, category, target, names, badRange]);
  const shown = useMemo(
    () => (badRange ? [] : filterExpenses(expenses, { from, to, category, target, q: typed, annulled: view.value === 'anulados' }, names)),
    [expenses, from, to, category, target, typed, view.value, names, badRange],
  );
  const totals = expenseTotals(inPeriod);
  // The same filters in the period before, of the same length, for «↑ 6 % más que setiembre».
  const before = useMemo(() => (from && to ? periodBefore(period.value, { from, to }, today) : null), [period.value, from, to, today]);
  const spentBefore = useMemo(() => (before ? expenseTotals(filterExpenses(expenses, { from: before.from, to: before.to, category, target }, names)).amounts : null), [expenses, before, category, target, names]);
  const kinds = useMemo(() => byCategory(inPeriod), [inPeriod]);
  const places = useMemo(() => byTarget(inPeriod, names), [inPeriod, names]);
  const fleet = expenseTotals(inPeriod.filter((e) => e.target === 'truck' || e.target === 'trailer'));
  const annulled = useMemo(() => (badRange ? [] : filterExpenses(expenses, { from, to, category, target, annulled: true }, names)), [expenses, from, to, category, target, names, badRange]);
  const shownTotals = expenseTotals(shown);

  // The kinds the filter offers: the listed ones and the ones written by hand; the chosen one stays even without expenses.
  const categoryChoices = useMemo(() => {
    const list: string[] = [...EXPENSE_CATEGORIES, ...writtenCategories(expenses)];
    return category && !list.some((c) => c === category) ? [category, ...list] : list;
  }, [expenses, category]);
  // What the filter offers to see: each kind whole, and each thing that has expenses; the chosen one stays.
  const targetChoices = useMemo(() => {
    const counting = expenses.filter((e) => !e.deleted);
    return EXPENSE_TARGETS.map((t) => ({
      kind: t,
      items: t.value === 'company' ? [] : byTarget(counting.filter((e) => e.target === t.value), names).sort((a, b) => a.label.localeCompare(b.label, 'es')),
    }));
  }, [expenses, names]);
  const targetKnown = !target || target === 'empresa' || EXPENSE_TARGETS.some((t) => t.word === target) || targetChoices.some((g) => g.items.some((i) => i.key === target));
  const kindOf = (key: string) => {
    const e = inPeriod.find((x) => x.targetKey === key);
    return e ? targetKind(e.target) : '';
  };

  const done = (text: string, tone: 'ok' | 'warn' = 'ok') => {
    setAdding(false);
    setEditing(null);
    setNotice({ tone, text });
  };
  const conflict = () => {
    setEditing(null);
    setNotice({ tone: 'warn', text: 'Otra persona cambió ese gasto mientras lo tenías abierto, y no se guardó nada: ya se ven sus datos nuevos. Revisalo y, si hace falta, volvé a corregirlo.' });
  };
  const restoreExpense = async (e: Expense) => {
    setNotice(null);
    try {
      await restore.mutateAsync({ expense: e, deleted: false });
      setNotice({ tone: 'ok', text: 'Gasto restaurado: vuelve a contar en los totales.' });
    } catch (err) {
      console.error(err);
      setNotice(
        err instanceof ConflictError
          ? { tone: 'warn', text: 'Otra persona cambió ese gasto: ya se ven sus datos nuevos.' }
          : err instanceof DataError && err.code === '23505'
            ? { tone: 'warn', text: 'Ese service ya tiene otro costo que cuenta: anulá ese antes de restaurar este.' }
            : { tone: 'error', text: describeWriteError(err, 'gastos') },
      );
    }
  };

  const loadedAt = query.dataUpdatedAt || null;
  const ready = !query.isLoading && query.data !== undefined;
  const top = kinds[0];
  const failedNames = [
    targets.reads.catalog.error ? 'el catálogo de camiones' : null,
    targets.reads.vehicles.error ? 'las fichas de Flota' : null,
    targets.reads.drivers.error ? 'las fichas de los choferes' : null,
  ].filter((x): x is string => x !== null);
  const filtered = Boolean(category || target);

  return (
    <div className="page">
      <PageHead
        title="Gastos y finanzas"
        subtitle="Los gastos de la empresa con su factura: los de cada camión, acoplado, chofer o viaje, y los de la empresa. Pesos y dólares por separado."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setNotice(null);
              setAdding(true);
            }}
            disabled={!ready}
          >
            <Icon name="plus" size={18} /> Nuevo gasto
          </button>
        }
      />
      <FinanceTabs />
      {notice && (
        <p className={`notice notice-${notice.tone}`} role={notice.tone === 'ok' ? 'status' : 'alert'}>
          <Icon name={notice.tone === 'ok' ? 'check' : 'warning'} size={18} /> {notice.text}
        </p>
      )}

      {ready && (
        <div className="stats stats-money">
          <Stat
            featured
            label="Gastado en el período"
            value={badRange ? '—' : <Lines parts={amountParts(totals.amounts, '$ 0')} />}
            detail={badRange ? 'Revisá las fechas' : `${count(totals.count)} gasto${totals.count === 1 ? '' : 's'}`}
            trend={before && spentBefore ? moneyTrend(totals.amounts, spentBefore, before.than, 'down') : null}
            tone="blue"
            icon="money"
          />
          <Stat label="Lo que más pesó" value={top ? <Lines parts={amountParts(top.amounts)} /> : '—'} detail={top ? top.label : 'Sin gastos en el período'} tone="grey" icon="chart" />
          <Stat label="En camiones y acoplados" value={badRange ? '—' : <Lines parts={amountParts(fleet.amounts, '$ 0')} />} detail={`${count(fleet.count)} gasto${fleet.count === 1 ? '' : 's'}`} tone="grey" icon="truck" />
          <Stat label="Sin factura" value={count(totals.withoutFile)} detail={totals.withoutFile > 0 ? 'Sumales la foto o el PDF' : 'Todos tienen su factura'} tone={totals.withoutFile > 0 ? 'amber' : 'green'} icon="doc" />
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
        <label className="field">
          <span>Tipo</span>
          <select value={category} onChange={(e) => set({ tipo: e.target.value })}>
            <option value="">Todos los tipos</option>
            {categoryChoices.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>A qué va</span>
          <select value={target} onChange={(e) => set({ destino: e.target.value })}>
            <option value="">Todo</option>
            {!targetKnown && <option value={target}>{filterLabel(target, names, expenses)}</option>}
            {targetChoices.map((g) =>
              g.kind.value === 'company' ? (
                <option key="empresa" value="empresa">
                  La empresa
                </option>
              ) : (
                <optgroup key={g.kind.value} label={g.kind.plural}>
                  <option value={g.kind.word}>{g.kind.all}</option>
                  {g.items.map((i) => (
                    <option key={i.key} value={i.key}>
                      {i.label}
                    </option>
                  ))}
                </optgroup>
              ),
            )}
          </select>
        </label>
        {(view.value === 'gastos' || view.value === 'anulados') && (
          <label className="field field-wide">
            <span>Buscar</span>
            <input type="search" placeholder="Proveedor, notas, camión…" value={typed} onChange={(e) => search(e.target.value)} />
          </label>
        )}
      </section>

      <div className="list-bar">
        <div className="chips" role="group" aria-label="Vista">
          {VIEWS.map((v) => (
            <button key={v.value} type="button" className={`chip${view.value === v.value ? ' is-on' : ''}`} aria-pressed={view.value === v.value} onClick={() => set({ vista: v.value === 'gastos' ? null : v.value })}>
              {v.label}
              {v.value === 'gastos' || v.value === 'anulados' ? <span>{count(v.value === 'gastos' ? inPeriod.length : annulled.length)}</span> : null}
            </button>
          ))}
        </div>
        <div className="list-info">
          {loadedAt !== null && <span className="updated">actualizado {ago(loadedAt, now)}</span>}
          <RefreshButton onClick={() => void Promise.all([query.refetch(), targets.reads.vehicles.refetch(), targets.reads.drivers.refetch()])} busy={query.isFetching} />
        </div>
      </div>

      {query.error && query.data !== undefined && <StaleNote onRetry={() => void query.refetch()} />}
      {failedNames.length > 0 && (
        <StaleNote
          onRetry={() => {
            void targets.reads.catalog.refetch();
            void targets.reads.vehicles.refetch();
            void targets.reads.drivers.refetch();
          }}
        >
          No se pudo leer {andList(failedNames)}: los gastos se nombran como se guardaron, y al cargar uno puede faltar algo para elegir.
        </StaleNote>
      )}

      {badRange ? (
        <ErrorNote>Revisá las fechas: «hasta» no puede ser antes de «desde».</ErrorNote>
      ) : query.error && query.data === undefined ? (
        <ErrorNote onRetry={() => void query.refetch()}>{query.error instanceof DataError && query.error.code === TOO_MANY ? 'Hay demasiados gastos para leerlos todos de una vez, y una suma con una parte daría mal.' : 'No se pudieron leer los gastos.'}</ErrorNote>
      ) : !ready ? (
        <div className="card card-body">
          <Skeleton lines={6} />
        </div>
      ) : view.value === 'tipos' || view.value === 'destinos' ? (
        (view.value === 'tipos' ? kinds : places).length === 0 ? (
          <div className="card">
            <Empty icon="money" title="No hay gastos en este período">
              {filtered ? 'Probá con otro tipo o con otra cosa.' : null}
            </Empty>
          </div>
        ) : (
          <section className="card">
            <header className="card-head">
              <h2 className="card-title">{view.value === 'tipos' ? 'Por tipo de gasto' : 'A qué fue cada gasto'}</h2>
              <span className="updated">{amounts(totals.amounts, '$ 0')}</span>
            </header>
            {view.value === 'tipos' ? (
              <GroupTable groups={kinds} label="Tipo" onPick={(key) => set({ vista: null, tipo: key })} />
            ) : (
              <GroupTable groups={places} label="A qué fue" kindOf={kindOf} onPick={(key) => set({ vista: null, destino: key })} />
            )}
          </section>
        )
      ) : shown.length === 0 ? (
        <div className="card">
          <Empty icon="money" title={view.value === 'anulados' ? 'No hay gastos anulados en este período' : 'No hay gastos en este período'}>
            {typed || filtered ? 'Probá con otro tipo, otra cosa o búsqueda.' : view.value === 'anulados' ? null : 'Anotá el primero con «Nuevo gasto».'}
          </Empty>
        </div>
      ) : (
        <>
          <p className="list-total">
            {count(shownTotals.count)} gasto{shownTotals.count === 1 ? '' : 's'} · {amounts(shownTotals.amounts, '$ 0')}
            {view.value === 'gastos' && shownTotals.withoutFile > 0 ? ` · ${count(shownTotals.withoutFile)} sin factura` : ''}
            {view.value === 'anulados' ? ' · no cuentan en los totales' : ''}
          </p>
          <ul className="card expense-list" aria-label={view.value === 'anulados' ? 'Gastos anulados' : 'Gastos'}>
            {shown.map((e) => (
              <ExpenseRow
                key={e.id}
                expense={e}
                names={names}
                onOpen={
                  view.value === 'anulados'
                    ? undefined
                    : () => {
                        setNotice(null);
                        setEditing(e);
                      }
                }
                onFile={() => setFile({ bucket: 'trf-expense-files', path: e.file?.path ?? '', title: `Factura · ${e.category} del ${formatDay(e.spentOn)}` })}
                action={
                  view.value === 'anulados' ? (
                    <button type="button" className="btn btn-quiet" disabled={restore.isPending} onClick={() => void restoreExpense(e)}>
                      <Icon name="undo" size={18} /> Restaurar
                    </button>
                  ) : undefined
                }
              />
            ))}
          </ul>
        </>
      )}
      <p className="note">El combustible está en Combustible, y los sueldos y adelantos de los choferes, en Choferes: no van acá. Lo que deben los clientes está en Cobros, y lo que dejó cada mes, cada camión y cada viaje, en Ganancia.</p>

      <PhotoDialog photo={file} onClose={() => setFile(null)} />
      {(adding || editing) && (
        <ExpenseFormDialog
          expense={editing}
          origin={editing ? undefined : (presetOf(target) ?? undefined)}
          today={today}
          choices={choices}
          names={names}
          expenses={expenses}
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
