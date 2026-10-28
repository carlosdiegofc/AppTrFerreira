// What needs attention, as Inicio and the bell of the top bar list it: trucks low on fuel and trips that look left open
// first, then papers and services expired or close, and then the receipts and the trips to complete and the drivers
// with an older app; each linking to its section.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { useNotices } from '../data/notices';
import { truckParts } from '../lib/fleet';
import { count, decimal } from '../lib/format';
import { type LongTrip, RECEIPT_DAYS, UNBILLED_DAYS } from '../lib/notices';
import type { Alert } from '../lib/papers';
import type { TankState } from '../lib/tanks';
import { Icon, type IconName } from './Icon';
import { Empty, ErrorNote, Pill, Skeleton, StaleNote, type Tone } from './ui';

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

/** A trip in progress for 14 hours or more: its driver may have forgotten to finish it. */
function LongTripLine({ trip }: { trip: LongTrip }) {
  const { model, plate } = truckParts(trip.vehicle);
  return (
    <li>
      <Link className="alert-line" to={`/gps?camion=${encodeURIComponent('trip:' + trip.id)}`} title="Ver en el GPS en vivo">
        <span className="alert-icon tone-amber">
          <Icon name="route" size={18} />
        </span>
        <span className="alert-main">
          <strong>{[plate || model || 'Sin camión', trip.driver].filter(Boolean).join(' · ')}</strong>
          <span>En curso hace {count(trip.hours)} horas: ¿quedó abierto?</span>
        </span>
        <Pill tone="amber">Viaje abierto</Pill>
      </Link>
    </li>
  );
}

/** One line for many things of a kind: how many, what to do, and where. */
function SummaryLine({ to, where, icon, tone, title, pill, children }: { to: string; where: string; icon: IconName; tone: Tone; title: string; pill: string; children: ReactNode }) {
  return (
    <li>
      <Link className="alert-line" to={to} title={`Ver en ${where}`}>
        <span className={`alert-icon tone-${tone}`}>
          <Icon name={icon} size={18} />
        </span>
        <span className="alert-main">
          <strong>{title}</strong>
          <span>{children}</span>
        </span>
        <Pill tone={tone}>{pill}</Pill>
      </Link>
    </li>
  );
}

const plural = (n: number, one: string, many: string) => `${count(n)} ${n === 1 ? one : many}`;

/** The list, with what could not be read; limit cuts it with «Y N más.». */
export function NoticeList({ notices, limit }: { notices: ReturnType<typeof useNotices>; limit?: number }) {
  const { maintenance, tanks, low, pending, papersLoaded, papersError, refreshPapers, long, missing, unbilled, old, othersError, refreshOthers } = notices;
  const shown = limit === undefined ? pending : pending.slice(0, limit);
  const newest = old[0]?.newer ?? '';
  const later = missing.length > 0 || unbilled.length > 0 || old.length > 0;
  return (
    <>
      {papersError && papersLoaded && <StaleNote onRetry={() => void refreshPapers()} />}
      {maintenance.trips.error && papersLoaded && (
        <StaleNote onRetry={() => void maintenance.refetchTrips()}>
          {maintenance.kmMissing ? 'No se pudieron leer los viajes: los avisos por kilómetros no se ven ahora.' : 'No se pudieron actualizar los viajes: los avisos por kilómetros son de la última lectura.'}
        </StaleNote>
      )}
      {tanks.error && <StaleNote onRetry={tanks.refetch}>No se pudo leer el combustible de los camiones: los avisos de combustible bajo no se ven ahora.</StaleNote>}
      {tanks.stale && tanks.rows && (
        <StaleNote onRetry={tanks.refetch}>No se pudo actualizar el combustible de los camiones: los avisos de combustible bajo son de la última lectura.</StaleNote>
      )}
      {othersError && <StaleNote onRetry={() => void refreshOthers()}>No se pudieron leer los viajes, las boletas o los choferes: puede faltar algún aviso.</StaleNote>}
      {low.length > 0 && (
        <ul className="alert-list" aria-label="Combustible bajo">
          {low.map((t) => (
            <FuelLine key={t.settings.key} tank={t} />
          ))}
        </ul>
      )}
      {long.length > 0 && (
        <ul className="alert-list" aria-label="Viajes abiertos">
          {long.map((t) => (
            <LongTripLine key={t.id} trip={t} />
          ))}
        </ul>
      )}
      {papersError && !papersLoaded ? (
        <ErrorNote onRetry={() => void refreshPapers()} />
      ) : !papersLoaded ? (
        <Skeleton />
      ) : pending.length === 0 && (low.length > 0 || long.length > 0 || later) ? null : pending.length === 0 ? (
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
      {later && (
        <ul className="alert-list" aria-label="Para completar">
          {missing.length > 0 && (
            <SummaryLine to="/combustible" where="Combustible" icon="fuel" tone="amber" title={plural(missing.length, 'boleta sin importe o sin litros', 'boletas sin importe o sin litros')} pill="Completar">
              De los últimos {RECEIPT_DAYS} días: completalas en Combustible.
            </SummaryLine>
          )}
          {unbilled.length > 0 && (
            <SummaryLine to="/finanzas/cobros" where="Cobros" icon="money" tone="amber" title={plural(unbilled.length, 'viaje con carga sin importe', 'viajes con carga sin importe')} pill="Sin importe">
              De los últimos {UNBILLED_DAYS} días: completá el importe para cobrarlos.
            </SummaryLine>
          )}
          {old.length > 0 && (
            <SummaryLine to="/gps" where="el GPS en vivo" icon="person" tone="blue" title={plural(old.length, 'chofer con la app vieja', 'choferes con la app vieja')} pill="Actualizar">
              {old.map((d) => `${d.name.split(' ')[0]} (${d.version})`).join(', ')}. Ya hay una más nueva: {newest}.
            </SummaryLine>
          )}
        </ul>
      )}
    </>
  );
}
