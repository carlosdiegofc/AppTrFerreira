import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchDriverModes, setDriverGhost } from '../data/api';
import { Card, ErrorNote } from './ui';

const DAY = 86_400_000;

function untilText(until: string | null): string {
  if (!until) return '';
  if (until === 'infinity') return 'hasta que se apague';
  const d = new Date(until);
  return `hasta el ${d.toLocaleDateString('es-UY')} a las ${d.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Modo fantasma and modo zafra of a driver (6/11/2026). The office puts the ghost mode on or off here; the phone reads it
 * when the app opens. A ghost mode set from here is turned off only from here.
 */
export function DriverModesCard({ userId, name }: { userId: string; name: string }) {
  const modes = useQuery({ queryKey: ['driverModes', userId], queryFn: () => fetchDriverModes(userId) });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const m = modes.data ?? null;
  const ghostOn = Boolean(m?.ghost_until && (m.ghost_until === 'infinity' || Date.parse(m.ghost_until) > Date.now()));
  const put = async (until: string | null) => {
    setBusy(true);
    setFailed(false);
    try {
      await setDriverGhost(userId, name, until);
      await modes.refetch();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Modos de la app">
      <p data-testid="driver-ghost">
        <strong>Modo fantasma:</strong> {ghostOn ? `prendido ${untilText(m?.ghost_until ?? null)}${m?.ghost_by === 'panel' ? ', puesto desde el panel' : ', puesto por el chofer'}` : 'apagado'}
      </p>
      <p data-testid="driver-zafra">
        <strong>Modo zafra:</strong> {m?.zafra ? `prendido${m.zafra_since ? ` desde el ${new Date(m.zafra_since).toLocaleDateString('es-UY')}` : ''}: sus viajes empiezan solos` : 'apagado'}
      </p>
      <div className="confirm-answers">
        {ghostOn ? (
          <button type="button" className="btn" disabled={busy} onClick={() => void put(null)}>
            Apagar el modo fantasma
          </button>
        ) : (
          <>
            {[1, 3, 7].map((d) => (
              <button key={d} type="button" className="btn" disabled={busy} onClick={() => void put(new Date(Date.now() + d * DAY).toISOString())}>
                Fantasma {d} {d === 1 ? 'día' : 'días'}
              </button>
            ))}
            <button type="button" className="btn" disabled={busy} onClick={() => void put('infinity')}>
              Fantasma hasta apagarlo
            </button>
          </>
        )}
      </div>
      {(failed || modes.error) && <ErrorNote onRetry={() => void modes.refetch()}>No se pudieron leer o guardar los modos.</ErrorNote>}
    </Card>
  );
}
