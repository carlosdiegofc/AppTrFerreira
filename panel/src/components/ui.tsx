import type { ReactNode } from 'react';
import type { Trend } from '../lib/change';
import { Icon, type IconName } from './Icon';

export function PageHead({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, action, children, className = '', padded = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-head">
          {title && <h2 className="card-title">{title}</h2>}
          {action}
        </header>
      )}
      <div className={padded ? 'card-body' : ''}>{children}</div>
    </section>
  );
}

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'grey';

/** A number of the page; featured, the main one, on the logo's blue (one per page at most). */
export function Stat({
  label,
  value,
  detail,
  tone,
  icon,
  featured = false,
  trend = null,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone: Tone;
  icon: IconName;
  featured?: boolean;
  /** How it moved against the period before: «↑ 6 % más que setiembre». */
  trend?: Trend | null;
}) {
  return (
    <div className={`stat tone-${tone}${featured ? ' is-featured' : ''}`}>
      <span className="stat-icon"><Icon name={icon} size={22} /></span>
      <div className="stat-text">
        <span className="stat-value">{value}</span>
        <span className="stat-label">{label}</span>
        {detail && <span className="stat-detail">{detail}</span>}
        {trend && <span className={`stat-trend is-${trend.tone}`}>{trend.text}</span>}
      </div>
    </div>
  );
}

/** A share between 0 and 1 as a ring (decision of 26/10/2026), for the number written beside it. */
export function Ring({ share, size = 38 }: { share: number; size?: number }) {
  const r = 15;
  const length = 2 * Math.PI * r;
  const filled = Math.min(1, Math.max(0, share)) * length;
  return (
    <svg className="ring" width={size} height={size} viewBox="0 0 38 38" aria-hidden="true" focusable="false">
      <circle className="ring-track" cx="19" cy="19" r={r} strokeWidth="5" />
      {filled > 0 && <circle className="ring-fill" cx="19" cy="19" r={r} strokeWidth="5" strokeDasharray={`${filled} ${length}`} />}
    </svg>
  );
}

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`pill tone-${tone}`}>{children}</span>;
}

export function Dot({ tone }: { tone: Tone }) {
  return <span className={`dot tone-${tone}`} aria-hidden="true" />;
}

export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function ErrorNote({ onRetry, children = 'No se pudieron cargar los datos.' }: { onRetry?: () => void; children?: ReactNode }) {
  return (
    <div className="error-note" role="alert">
      <Icon name="warning" size={20} />
      <span>{children}</span>
      {onRetry && (
        <button type="button" className="btn btn-quiet" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

/** A refresh that failed while what was read before stays on screen: a first read that failed is an ErrorNote. */
export function StaleNote({ onRetry, children = 'No se pudo actualizar: se ve lo último que se leyó.' }: { onRetry: () => void; children?: ReactNode }) {
  return <ErrorNote onRetry={onRetry}>{children}</ErrorNote>;
}

/** The catalog of trucks could not be read: a trip saved with an older truck label shows that label. */
export function CatalogNote({ onRetry }: { onRetry: () => void }) {
  return <ErrorNote onRetry={onRetry}>No se pudo leer el catálogo de camiones: un viaje guardado con un nombre viejo del camión se ve con ese nombre.</ErrorNote>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} style={{ width: `${92 - i * 14}%` }} />
      ))}
    </div>
  );
}

export function RefreshButton({ onClick, busy, label = 'Actualizar' }: { onClick: () => void; busy: boolean; label?: string }) {
  return (
    <button type="button" className={`btn btn-quiet ${busy ? 'is-busy' : ''}`} onClick={onClick} disabled={busy} aria-label={label} title={label}>
      <Icon name="refresh" size={18} />
      <span className="btn-text">{label}</span>
    </button>
  );
}
