// What needs attention, as Inicio and the bell of the top bar list it: trucks low on fuel first, then papers and
// services expired or close, each linking to its section.
import { Link } from 'react-router';
import type { useNotices } from '../data/notices';
import { count, decimal } from '../lib/format';
import type { Alert } from '../lib/papers';
import type { TankState } from '../lib/tanks';
import { Icon } from './Icon';
import { Empty, ErrorNote, Pill, Skeleton, StaleNote } from './ui';

function AlertLine({ alert }: { alert: Alert }) {
  const late = alert.state === 'late';
  const paper = alert.type === 'paper';
  return (
    <li>
      <Link className="alert-line" to={paper ? '/documentacion' : '/mantenimiento'} title={paper ? 'Ver en Documentación' : 'Ver en Mantenimiento'}>
        <span className={`alert-icon tone-${late ? 'red' : 'amber'}`}>
          <Icon name={paper ? 'doc' : 'wrench'} size={18} />
        </span>
        <span className="alert-main">
          <strong>{[alert.kind, alert.owner].filter(Boolean).join(' · ')}</strong>
          <span>{alert.detail}</span>
        </span>
        <Pill tone={late ? 'red' : 'amber'}>{late ? 'Vencido' : paper ? 'Por vencer' : 'Próximo'}</Pill>
      </Link>
    </li>
  );
}

/** A truck low on fuel, by the tank's estimate. */
function FuelLine({ tank }: { tank: Extract<TankState, { status: 'known' }> }) {
  return (
    <li>
      <Link className="alert-line" to="/combustible?vista=tanques" title="Ver los tanques en Combustible">
        <span className="alert-icon tone-red">
          <Icon name="fuel" size={18} />
        </span>
        <span className="alert-main">
          <strong>{tank.settings.name}</strong>
          <span>
            ≈ {decimal(tank.liters, 0)} L · rinde ≈ {count(Math.round(tank.autonomyKm))} km
          </span>
        </span>
        <Pill tone="red">Combustible bajo</Pill>
      </Link>
    </li>
  );
}

/** The list, with what could not be read; limit cuts it with «Y N más.». */
export function NoticeList({ notices, limit }: { notices: ReturnType<typeof useNotices>; limit?: number }) {
  const { maintenance, tanks, low, pending, papersLoaded, papersError, refreshPapers } = notices;
  const shown = limit === undefined ? pending : pending.slice(0, limit);
  return (
    <>
      {papersError && papersLoaded && <StaleNote onRetry={() => void refreshPapers()} />}
      {maintenance.trips.error && papersLoaded && (
        <StaleNote onRetry={() => void maintenance.refetchTrips()}>
          {maintenance.kmMissing ? 'No se pudieron leer los viajes: los avisos por kilómetros no se ven ahora.' : 'No se pudieron actualizar los viajes: los avisos por kilómetros son de la última lectura.'}
        </StaleNote>
      )}
      {tanks.error && <StaleNote onRetry={tanks.refetch}>No se pudo leer el combustible de los camiones: los avisos de combustible bajo no se ven ahora.</StaleNote>}
      {low.length > 0 && (
        <ul className="alert-list" aria-label="Combustible bajo">
          {low.map((t) => (
            <FuelLine key={t.settings.key} tank={t} />
          ))}
        </ul>
      )}
      {papersError && !papersLoaded ? (
        <ErrorNote onRetry={() => void refreshPapers()} />
      ) : !papersLoaded ? (
        <Skeleton />
      ) : pending.length === 0 && low.length > 0 ? null : pending.length === 0 ? (
        <Empty icon="check" title="Todo en orden">
          No hay papeles vencidos ni por vencer en 30 días, ni services atrasados o próximos (15 días o 1.000 km).
        </Empty>
      ) : (
        <ul className="alert-list">
          {shown.map((a) => (
            <AlertLine key={a.id} alert={a} />
          ))}
          {pending.length > shown.length && <li className="more">Y {pending.length - shown.length} más.</li>}
        </ul>
      )}
    </>
  );
}
