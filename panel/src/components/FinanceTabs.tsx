// The parts of Gastos y finanzas, as a switch under its title: the expenses, the clients' accounts, the profit and the
// freight simulator.
import { NavLink } from 'react-router';

const TABS = [
  { to: '/finanzas', label: 'Gastos', end: true },
  { to: '/finanzas/cobros', label: 'Cobros', end: false },
  { to: '/finanzas/ganancia', label: 'Ganancia', end: false },
  { to: '/finanzas/simulador', label: 'Simulador', end: false },
] as const;

export function FinanceTabs() {
  return (
    <nav className="section-tabs" aria-label="Partes de Gastos y finanzas">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `section-tab${isActive ? ' is-on' : ''}`}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
