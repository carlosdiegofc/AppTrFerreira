import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import logo from '../assets/logo-tr.png';
import { usePanelUser } from '../auth/AuthProvider';
import { Icon } from '../components/Icon';
import { PANEL_VERSION } from '../config';
import { SECTIONS } from '../sections';
import { applyTheme, savedTheme, type ThemeChoice } from '../theme';
import { Account, SignOutButton, ThemeSwitch } from './Account';
import { Notices } from './Notices';
import { Search } from './Search';

/**
 * The frame of every page (decision of 26/10/2026): a floating bar with who is in, the search and the notices; the menu
 * as a column of icons (on a phone it slides in, with the names, the theme and «Salir»); the page on frosted glass.
 */
export function AppShell() {
  const { user } = usePanelUser();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>(savedTheme);
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className={`shell${open ? ' nav-open' : ''}`}>
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <header className="topbar">
        <div className="topbar-start">
          <button type="button" className="round menu-button" aria-label="Abrir el menú" aria-expanded={open} onClick={() => setOpen(true)}>
            <Icon name="menu" />
          </button>
          <img src={logo} alt="TR Ferreira" className="topbar-logo" />
          <Account theme={theme} onTheme={setTheme} />
        </div>
        <Search />
        <div className="topbar-end">
          <Notices />
        </div>
      </header>
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
                  <span className="side-label">
                    {s.label}
                    {!s.ready && <small className="soon-tag">Pronto</small>}
                  </span>
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
          <ThemeSwitch theme={theme} onTheme={setTheme} />
          <SignOutButton className="btn-side" />
          <span className="version">Panel · v{PANEL_VERSION}</span>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />
      <main id="contenido" className="content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
