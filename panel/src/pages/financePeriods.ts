// The periods of Gastos y finanzas, the same in Gastos and in Cobros. They live in the address (?periodo=mes-anterior):
// going back, reloading or sharing the link keeps them.
import { periodRange } from '../lib/trips';

export const PERIODS = [
  { value: 'mes', label: 'Este mes' },
  { value: 'mes-anterior', label: 'Mes anterior' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
  { value: 'anio', label: 'Este año' },
  { value: 'todo', label: 'Todo' },
  { value: 'fechas', label: 'Elegir fechas…' },
] as const;

export type FinancePeriod = (typeof PERIODS)[number]['value'];

/** The days of a period, inclusive; null for «Todo». */
export function rangeOf(period: FinancePeriod, today: string, params: URLSearchParams): { from: string; to: string } | null {
  switch (period) {
    case 'todo':
      return null;
    case 'fechas':
      return { from: params.get('desde') ?? today, to: params.get('hasta') ?? today };
    case 'anio':
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    case 'mes-anterior':
      return periodRange('prev-month', today);
    case '30':
    case '90':
      return periodRange(period, today);
    default:
      return periodRange('month', today);
  }
}
