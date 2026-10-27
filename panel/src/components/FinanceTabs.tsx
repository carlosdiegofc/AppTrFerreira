// The parts of Gastos y finanzas, as a switch under its title: the expenses and the clients' accounts. The profit and the
// freight simulator join them in the second delivery of part 12b.
import { NavLink } from 'react-router';

const TABS = [
  { to: '/finanzas', label: 'Gastos', end: true },
  { to: '/finanzas/cobros', label: 'Cobros', end: false },
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
