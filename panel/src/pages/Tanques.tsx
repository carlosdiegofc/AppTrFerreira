// «Tanques» in Combustible (decision of 22/10/2026): every truck with the fuel it should have now, an estimate from the
// last measurement or full tank, the loads since and the GPS kilometres. The low ones come first.
import { useState } from 'react';
import { Icon } from '../components/Icon';
import { TankMeasureDialog, TankSettingsDialog } from '../components/TankDialogs';
import { Empty, ErrorNote, Pill, Skeleton, StaleNote } from '../components/ui';
import { type TankRow, useTanks } from '../data/tanks';
import { dayInZone, formatDay, formatTime } from '../lib/dates';
import { count, decimal, percent } from '../lib/format';
import { kmPerLiter, type TankState } from '../lib/tanks';

/** «Desde el tanque lleno del 20/10 a las 14:05 en Ancap Ruta 5: 120 km y 0 L cargados.» */
function sinceText(state: Extract<TankState, { status: 'known' }>): string {
  const ms = Date.parse(state.start.at);
  const when = `del ${formatDay(dayInZone(ms))} a las ${formatTime(ms)}`;
  const from =
    state.start.kind === 'full'
      ? `Desde el tanque lleno ${when}${state.start.receipt.station ? ` en ${state.start.receipt.station}` : ''}`
      : `Desde la medición ${when} (${decimal(state.start.liters, 0)} L)`;
  return `${from}: ${count(Math.round(state.km))} km y ${decimal(state.loaded, 0)} L cargados.`;
}

function StatusPill({ state }: { state: TankState }) {
  if (state.status === 'known') return state.low ? <Pill tone="red">Combustible bajo</Pill> : null;
  if (state.status === 'unknown') return <Pill tone="amber">Revisar</Pill>;
  if (state.status === 'waiting') return <Pill tone="grey">Falta saber cuánto tiene</Pill>;
  return <Pill tone="grey">Sin configurar</Pill>;
}

function TankItem({ row, onSettings, onMeasure }: { row: TankRow; onSettings: () => void; onMeasure: () => void }) {
  const { state, settings } = row;
  const known = state.status === 'known' ? state : null;
  return (
    <li className={`tank-item${known?.low ? ' is-low' : ''}`}>
      <div className="tank-top">
        <span className="tank-name">
          <strong>{row.name}</strong>
          <small>{settings ? `Le entran ${decimal(settings.capacity, 0)} L · ${decimal(kmPerLiter(settings.consumption), 2)} km por litro · avisa con ${decimal(settings.warning, 0)} L` : 'Sin capacidad ni consumo'}</small>
        </span>
        <StatusPill state={state} />
      </div>
      {known && (
        <>
          <div className="tank-level">
            <strong>≈ {decimal(known.liters, 0)} L</strong>
            <span>
              {percent(known.share)} del tanque · rinde ≈ {count(Math.round(known.autonomyKm))} km
            </span>
          </div>
          <div
            className="tank-bar"
            role="meter"
            aria-label={`Combustible estimado de ${row.name}`}
            aria-valuemin={0}
            aria-valuemax={known.settings.capacity}
            aria-valuenow={Math.round(known.liters)}
            aria-valuetext={`${decimal(known.liters, 0)} litros de ${decimal(known.settings.capacity, 0)}`}
          >
            <span style={{ width: `${Math.round(known.share * 1000) / 10}%` }} />
          </div>
          <p className="tank-note">{sinceText(known)}</p>
          {known.approximate && <p className="tank-note">Aproximado: un viaje ya iba en curso cuando arrancó el cálculo, y cuenta entero.</p>}
          {known.belowZero && <p className="tank-note tank-warn">El cálculo da menos de cero: puede faltar registrar una carga, o el camión gastar menos de lo que dice su consumo.</p>}
        </>
      )}
      {state.status === 'unknown' && <p className="tank-note tank-warn">{state.reason}</p>}
      {state.status === 'waiting' && <p className="tank-note">Falta saber cuánto tiene: medilo, o marcá «Tanque lleno» en la próxima carga que lo llene.</p>}
      {state.status === 'unset' && <p className="tank-note">Cargá cuánto le entra y cuántos kilómetros hace por litro para empezar a calcular.</p>}
      {row.measured && (
        <p className="tank-note">
          Entre los dos últimos tanques llenos hizo {decimal(kmPerLiter(row.measured.litersPer100), 2)} km por litro en {count(Math.round(row.measured.km))} km.
        </p>
      )}
      <div className="tank-actions">
        <button type="button" className="btn" onClick={onSettings}>
          <Icon name="sliders" size={18} /> {settings ? 'Tanque y consumo' : 'Configurar tanque'}
        </button>
        {settings && (
          <button type="button" className="btn" onClick={onMeasure}>
            <Icon name="fuel" size={18} /> Medir el tanque
          </button>
        )}
      </div>
    </li>
  );
}

export function TanksView() {
  const tanks = useTanks();
  const [editing, setEditing] = useState<{ kind: 'settings' | 'measure'; row: TankRow } | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const done = (text: string) => {
    setEditing(null);
    setNotice({ tone: 'ok', text });
  };
  const conflict = () => {
    setEditing(null);
    setNotice({ tone: 'warn', text: 'Otra persona cambió ese tanque mientras lo tenías abierto, y no se guardó nada: ya se ven sus datos nuevos. Revisalos y, si hace falta, volvé a cambiarlo.' });
  };
  const open = (kind: 'settings' | 'measure', row: TankRow) => {
    setNotice(null);
    setEditing({ kind, row });
  };

  return (
    <>
      {notice && (
        <p className={`notice notice-${notice.tone}`} role={notice.tone === 'ok' ? 'status' : 'alert'}>
          <Icon name={notice.tone === 'ok' ? 'check' : 'warning'} size={18} /> {notice.text}
        </p>
      )}
      {tanks.stale && tanks.rows && <StaleNote onRetry={tanks.refetch} />}
      <p className="note">
        Es una estimación, no una medición: arranca en la última medición o en la última carga con el tanque lleno, suma las cargas de las boletas y resta los kilómetros del GPS según lo que consume cada camión. Se actualiza sola mientras los camiones andan. Para que no se desvíe, marcá «Tanque lleno» en las cargas que lo llenan.
      </p>
      {tanks.rows === null ? (
        tanks.error ? (
          <ErrorNote onRetry={tanks.refetch}>No se pudieron leer los tanques, las boletas o los viajes.</ErrorNote>
        ) : (
          <div className="card card-body">
            <Skeleton lines={6} />
          </div>
        )
      ) : tanks.rows.length === 0 ? (
        <div className="card">
          <Empty icon="fuel" title="Todavía no hay camiones">
            Los camiones del catálogo de la app aparecen acá para cargarles el tanque.
          </Empty>
        </div>
      ) : (
        <ul className="card tank-list" aria-label="Tanques">
          {tanks.rows.map((r) => (
            <TankItem key={r.key} row={r} onSettings={() => open('settings', r)} onMeasure={() => open('measure', r)} />
          ))}
        </ul>
      )}
      {editing?.kind === 'settings' && <TankSettingsDialog row={editing.row} onClose={() => setEditing(null)} onDone={done} onConflict={conflict} />}
      {editing?.kind === 'measure' && (
        <TankMeasureDialog row={editing.row} receipts={tanks.fuel.receipts} trucks={tanks.fuel.catalog.data ?? []} onClose={() => setEditing(null)} onDone={done} onConflict={conflict} />
      )}
    </>
  );
}

/** The trucks low on fuel now, for an alert outside the list. */
export function lowTanks(rows: readonly TankRow[] | null): Extract<TankState, { status: 'known' }>[] {
  return (rows ?? []).flatMap((r) => (r.state.status === 'known' && r.state.low ? [r.state] : []));
}
