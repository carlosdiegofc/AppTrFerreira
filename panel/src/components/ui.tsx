import type { ReactNode } from 'react';
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

export function Stat({ label, value, detail, tone, icon }: { label: string; value: ReactNode; detail?: ReactNode; tone: Tone; icon: IconName }) {
  return (
    <div className={`stat tone-${tone}`}>
      <span className="stat-icon"><Icon name={icon} size={22} /></span>
      <div className="stat-text">
        <span className="stat-value">{value}</span>
        <span className="stat-label">{label}</span>
        {detail && <span className="stat-detail">{detail}</span>}
      </div>
    </div>
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
