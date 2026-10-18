import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import logo from '../assets/logo-tr.png';
import { useAuth, usePanelUser } from '../auth/AuthProvider';
import { Icon, type IconName } from '../components/Icon';
import { PANEL_VERSION } from '../config';
import { SECTIONS } from '../sections';
import { applyTheme, savedTheme, type ThemeChoice } from '../theme';

const THEMES: { value: ThemeChoice; label: string; icon: IconName }[] = [
  { value: 'auto', label: 'Como la computadora', icon: 'monitor' },
  { value: 'light', label: 'Claro', icon: 'sun' },
  { value: 'dark', label: 'Oscuro', icon: 'moon' },
];

export function AppShell() {
  const { user } = usePanelUser();
  const { signOut } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>(savedTheme);
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => setOpen(false), [location.pathname]);
  const current = SECTIONS.find((s) => location.pathname === '/' + s.path);

  return (
    <div className={`shell${open ? ' nav-open' : ''}`}>
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <aside className="side" aria-label="Secciones del panel">
        <div className="side-brand">
          <img src={logo} alt="TR Ferreira" />
          <span>Panel de gestión</span>
          <button type="button" className="btn btn-icon side-close" aria-label="Cerrar el menú" onClick={() => setOpen(false)}>
            <Icon name="close" />
          </button>
        </div>
        <nav className="side-nav">
          <ul>
            {SECTIONS.map((s) => (
              <li key={s.path}>
                <NavLink to={'/' + s.path} className={({ isActive }) => `side-link${isActive ? ' is-active' : ''}${s.ready ? '' : ' is-soon'}`}>
                  <Icon name={s.icon} />
                  <span>{s.label}</span>
                  {!s.ready && <small className="soon-tag">Pronto</small>}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="side-foot">
          <div className="who">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <div className="theme-switch" role="group" aria-label="Tema">
            {THEMES.map((t) => (
              <button key={t.value} type="button" className={theme === t.value ? 'is-on' : ''} aria-pressed={theme === t.value} title={t.label} aria-label={t.label} onClick={() => setTheme(t.value)}>
                <Icon name={t.icon} size={17} />
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-side" onClick={() => void signOut()}>
            <Icon name="logout" size={18} />
            Salir
          </button>
          <span className="version">Panel nuevo · v{PANEL_VERSION}</span>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />
      <div className="main">
        <header className="topbar">
          <button type="button" className="btn btn-icon" aria-label="Abrir el menú" aria-expanded={open} onClick={() => setOpen(true)}>
            <Icon name="menu" />
          </button>
          <img src={logo} alt="TR Ferreira" className="topbar-logo" />
          <span className="topbar-title">{current?.label}</span>
        </header>
        <main id="contenido" className="content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
