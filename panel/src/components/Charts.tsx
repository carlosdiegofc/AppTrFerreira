// The charts of Métricas, drawn with the panel's own HTML (no chart library): thin bars that grow from one baseline, a
// 2 px gap of the card's colour between the parts of a bar, round axis ticks, a legend for two series and few labels.
// Each chart answers the pointer and the keyboard (arrows, once it has the focus) with the values of the bar it is on,
// and every value is also in a table: the one of the page, or the one under the chart. Colours: --viz-1 and --viz-2
// in app.css, checked for colour blindness in light and in dark.
import { type FocusEvent, type KeyboardEvent, type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from 'react';

export type Series = 1 | 2;

export interface Part {
  value: number;
  series: Series;
}

const sum = (parts: readonly Part[]) => parts.reduce((s, p) => s + Math.max(0, p.value), 0);

/** The legend of a chart with two series: a swatch like the mark beside each name. */
export function Legend({ items }: { items: { series: Series; label: string }[] }) {
  return (
    <ul className="viz-legend">
      {items.map((i) => (
        <li key={i.series}>
          <span className={`viz-key viz-${i.series}`} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** One line of a tooltip: the value first, then what it is, keyed with a short stroke of its series. */
export function TipLine({ series, value, label }: { series?: Series; value: string; label: string }) {
  return (
    <span className="viz-tip-line">
      {series && <i className={`viz-stroke viz-${series}`} aria-hidden="true" />}
      <b>{value}</b> {label}
    </span>
  );
}

/** Which bar the pointer or the keyboard is on, and where its tooltip goes. */
function useActive(count: number) {
  const box = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  useLayoutEffect(() => {
    const outer = box.current;
    const el = tip.current;
    const mark = active === null ? null : outer?.querySelector<HTMLElement>(`[data-mark="${active}"] [data-tip]`);
    if (!outer || !el || !mark) return;
    const o = outer.getBoundingClientRect();
    const m = mark.getBoundingClientRect();
    // Above the end of the bar, inside the chart.
    const half = el.offsetWidth / 2;
    const x = Math.min(Math.max(m.left - o.left + m.width / 2, half), Math.max(half, o.width - half));
    el.style.left = `${x}px`;
    el.style.top = `${m.top - o.top}px`;
  });
  // With no bar chosen yet, forward starts at the first one and back at the last one.
  const forward = (a: number | null) => (a === null ? 0 : a + 1);
  const back = (a: number | null) => (a === null ? count - 1 : a - 1);
  const keys: Record<string, (a: number | null) => number> = { ArrowRight: forward, ArrowDown: forward, ArrowLeft: back, ArrowUp: back, Home: () => 0, End: () => count - 1 };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return setActive(null);
    const move = keys[e.key];
    if (!move || count === 0) return;
    e.preventDefault();
    setActive((a) => Math.min(count - 1, Math.max(0, move(a))));
  };
  // A click also gives the focus: only the keyboard's focus opens the first bar.
  const onFocus = (e: FocusEvent<HTMLElement>) => {
    if (e.currentTarget.matches(':focus-visible')) setActive((a) => a ?? 0);
  };
  const handlers = { tabIndex: 0, onKeyDown, onFocus, onBlur: () => setActive(null), onPointerLeave: () => setActive(null) };
  return { box, tip, active: active !== null && active < count ? active : null, setActive, handlers };
}

function Tip({ refTo, children }: { refTo: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  return (
    <div className="viz-tip" ref={refTo} role="status">
      {children}
    </div>
  );
}

export interface BarRow {
  key: string;
  label: string;
  parts: Part[];
  /** The total at the end of the bar. */
  value: string;
  tip: ReactNode;
}

/**
 * Horizontal bars, one per row, longest to shortest as given; each one stacked by series. With average, a hairline at
 * that value crosses every row.
 */
export function BarRows({ label, rows, average }: { label: string; rows: readonly BarRow[]; average?: number }) {
  const { box, tip, active, setActive, handlers } = useActive(rows.length);
  const max = Math.max(average ?? 0, ...rows.map((r) => sum(r.parts)));
  const pct = (v: number) => (max > 0 ? Math.min(100, (Math.max(0, v) / max) * 100) : 0);
  return (
    <div className="viz-box" ref={box}>
      <div className="bars" role="group" aria-label={label} {...handlers}>
        {rows.map((r, i) => (
          <div key={r.key} className={`bar-row${active === i ? ' is-active' : ''}`} data-mark={i} onPointerEnter={() => setActive(i)}>
            <span className="bar-name" title={r.label}>
              {r.label}
            </span>
            <span className="bar-track">
              <span className="bar-fill" data-tip style={{ width: `${pct(sum(r.parts))}%` }}>
                {r.parts
                  .filter((p) => p.value > 0)
                  .map((p) => (
                    <span key={p.series} className={`bar-seg viz-${p.series}`} style={{ flexGrow: p.value }} />
                  ))}
              </span>
              {average !== undefined && <span className="bar-average" style={{ left: `${pct(average)}%` }} aria-hidden="true" />}
            </span>
            <span className="bar-value">{r.value}</span>
          </div>
        ))}
      </div>
      {active !== null && <Tip refTo={tip}>{rows[active]?.tip}</Tip>}
    </div>
  );
}

export interface Column {
  key: string;
  /** Under the column; only the major ones show on a phone. */
  label: string;
  major: boolean;
  parts: Part[];
  tip: ReactNode;
}

/** Columns from one baseline with round ticks; one value written on its column (the largest, usually). */
export function Columns({ label, columns, ticks, tick, valueLabel }: { label: string; columns: readonly Column[]; ticks: readonly number[]; tick: (v: number) => string; valueLabel?: { index: number; text: string } }) {
  const { box, tip, active, setActive, handlers } = useActive(columns.length);
  const top = ticks.at(-1) || 1;
  const pct = (v: number) => Math.min(100, (Math.max(0, v) / top) * 100);
  return (
    <div className="viz-box" ref={box}>
      <div className="cols-chart">
        <div className="cols-axis" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${pct(t)}%` }}>
              {tick(t)}
            </span>
          ))}
        </div>
        <div className="cols-plot">
          <div className="cols-grid" aria-hidden="true">
            {ticks.map((t) => (
              <span key={t} style={{ bottom: `${pct(t)}%` }} />
            ))}
          </div>
          <div className="cols" role="group" aria-label={label} {...handlers}>
            {columns.map((c, i) => {
              const total = sum(c.parts);
              return (
                <div key={c.key} className={`col${active === i ? ' is-active' : ''}`} data-mark={i} onPointerEnter={() => setActive(i)}>
                  <span className="col-stack" data-tip style={{ height: `${pct(total)}%` }}>
                    {c.parts
                      .filter((p) => p.value > 0)
                      .map((p) => (
                        <span key={p.series} className={`col-seg viz-${p.series}`} style={{ flexGrow: p.value }} />
                      ))}
                  </span>
                  {/* Near an edge of the chart the label grows away from it, so it is never cut. */}
                  {valueLabel?.index === i && total > 0 && (
                    <span className={`col-value${i < 2 ? ' at-start' : i > columns.length - 3 ? ' at-end' : ''}`} style={{ bottom: `${pct(total)}%` }}>
                      {valueLabel.text}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {/* Too many labels for the width of any screen: only the major ones. */}
        <div className={`cols-x${columns.length * Math.max(0, ...columns.map((c) => c.label.length)) > 90 ? ' is-dense' : ''}`} aria-hidden="true">
          {columns.map((c) => (
            <span key={c.key} className={c.major ? 'is-major' : undefined}>
              {c.label}
            </span>
          ))}
        </div>
      </div>
      {active !== null && <Tip refTo={tip}>{columns[active]?.tip}</Tip>}
    </div>
  );
}

/** The data of a chart as a table, folded under it. */
export function ChartData({ caption, head, rows }: { caption: string; head: readonly string[]; rows: readonly (readonly string[])[] }) {
  return (
    <details className="viz-data">
      <summary>Ver los datos</summary>
      <div className="statement-scroll">
        <table className="viz-data-table">
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={h} scope="col" className={i > 0 ? 'num' : undefined}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]}>
                {r.map((v, i) => (
                  <td key={i} className={i > 0 ? 'num' : undefined}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
