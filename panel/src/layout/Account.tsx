// Who is in, at the left of the top bar: it opens the theme, «Salir» and the version. On a phone they are in the menu.
import { useAuth, usePanelUser } from '../auth/AuthProvider';
import { Icon, type IconName } from '../components/Icon';
import { PANEL_VERSION } from '../config';
import { initials } from '../lib/format';
import type { ThemeChoice } from '../theme';
import { usePopover } from './popover';

const THEMES: { value: ThemeChoice; label: string; icon: IconName }[] = [
  { value: 'auto', label: 'Como la computadora', icon: 'monitor' },
  { value: 'light', label: 'Claro', icon: 'sun' },
  { value: 'dark', label: 'Oscuro', icon: 'moon' },
];

export function ThemeSwitch({ theme, onTheme }: { theme: ThemeChoice; onTheme: (t: ThemeChoice) => void }) {
  return (
    <div className="theme-switch" role="group" aria-label="Tema">
      {THEMES.map((t) => (
        <button key={t.value} type="button" className={theme === t.value ? 'is-on' : ''} aria-pressed={theme === t.value} title={t.label} aria-label={t.label} onClick={() => onTheme(t.value)}>
          <Icon name={t.icon} size={17} />
        </button>
      ))}
    </div>
  );
}

export function SignOutButton({ className = '' }: { className?: string }) {
  const { signOut } = useAuth();
  return (
    <button type="button" className={`btn btn-quiet ${className}`} onClick={() => void signOut()}>
      <Icon name="logout" size={18} />
      Salir
    </button>
  );
}

export function Account({ theme, onTheme }: { theme: ThemeChoice; onTheme: (t: ThemeChoice) => void }) {
  const { user } = usePanelUser();
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="account-wrap" ref={ref}>
      <button type="button" className="account" aria-expanded={open} aria-controls="cuenta" onClick={() => setOpen(!open)}>
        <span className="avatar" aria-hidden="true">
          {initials(user.name)}
        </span>
        <span className="account-name">
          <span className="visually-hidden">Tu cuenta: </span>
          {user.name}
        </span>
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <div className="popover account-menu" id="cuenta">
          <div className="who">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <ThemeSwitch theme={theme} onTheme={onTheme} />
          <SignOutButton />
          <span className="version">Panel · v{PANEL_VERSION}</span>
        </div>
      )}
    </div>
  );
}
