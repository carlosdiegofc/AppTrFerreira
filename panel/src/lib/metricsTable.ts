// The table of Métricas, the same on the page and in its files: on the page and in the PDF each money column carries
// both currencies (never added together); the spreadsheet gives each currency its own column, as numbers.
import type { Currency } from './fuel';
import { decimal, money, number, percent } from './format';
import { litersPer100, loadedShare, type MetricsRow, type SortKey } from './metrics';

/** "$ 41.000" and "US$ 310", each currency apart; none when both are zero. */
export function moneyParts(a: Record<Currency, number>): string[] {
  return [a.UYU !== 0 ? money(a.UYU, 'UYU') : null, a.USD !== 0 ? money(a.USD, 'USD') : null].filter((p): p is string => p !== null);
}

export const moneyText = (a: Record<Currency, number>) => moneyParts(a).join(' · ') || '—';

export interface TableColumn {
  key: SortKey;
  header: string;
  text: (r: MetricsRow) => string;
  /** Pesos and dollars, one per line on the page. */
  money?: (r: MetricsRow) => Record<Currency, number>;
}

const dash = (v: number, show: (v: number) => string) => (v > 0 ? show(v) : '—');

export const TABLE_COLUMNS: readonly TableColumn[] = [
  { key: 'trips', header: 'Viajes', text: (r) => number(r.trips) },
  { key: 'gpsKm', header: 'Km GPS', text: (r) => number(r.gpsKm) },
  { key: 'loadedShare', header: 'Con carga', text: (r) => (loadedShare(r) === null ? '—' : percent(loadedShare(r) as number)) },
  { key: 'billableKm', header: 'Km facturables', text: (r) => dash(r.billableKm, (v) => number(v)) },
  { key: 'kg', header: 'Kilos', text: (r) => dash(r.kg, (v) => number(v)) },
  { key: 'billed', header: 'Facturado', text: (r) => moneyText(r.billed), money: (r) => r.billed },
  { key: 'liters', header: 'Litros', text: (r) => dash(r.liters, (v) => decimal(v, 1)) },
  { key: 'fuel', header: 'Combustible', text: (r) => moneyText(r.fuel), money: (r) => r.fuel },
  { key: 'litersPer100', header: 'Consumo', text: (r) => (litersPer100(r) === null ? '—' : `${number(litersPer100(r) as number, 1)} L/100 km`) },
];

export interface SheetColumn {
  header: string;
  value: (r: MetricsRow) => number | null;
  decimals: number;
  width: number;
}

const amount = (v: number) => (v === 0 ? null : v);

export const SHEET_COLUMNS: readonly SheetColumn[] = [
  { header: 'Viajes', value: (r) => r.trips, decimals: 0, width: 8 },
  { header: 'Km GPS', value: (r) => r.gpsKm, decimals: 1, width: 10 },
  { header: 'Km con carga', value: (r) => r.loadedKm, decimals: 1, width: 13 },
  { header: 'Km sin carga', value: (r) => r.emptyKm, decimals: 1, width: 12 },
  { header: 'Km facturables', value: (r) => amount(r.billableKm), decimals: 1, width: 14 },
  { header: 'Kilos', value: (r) => amount(r.kg), decimals: 0, width: 10 },
  { header: 'Facturado $', value: (r) => amount(r.billed.UYU), decimals: 2, width: 14 },
  { header: 'Facturado US$', value: (r) => amount(r.billed.USD), decimals: 2, width: 14 },
  { header: 'Viajes sin importe', value: (r) => r.unbilled, decimals: 0, width: 16 },
  { header: 'Litros', value: (r) => amount(r.liters), decimals: 1, width: 10 },
  { header: 'Combustible $', value: (r) => amount(r.fuel.UYU), decimals: 2, width: 14 },
  { header: 'Combustible US$', value: (r) => amount(r.fuel.USD), decimals: 2, width: 15 },
  { header: 'Consumo L/100 km (estimado)', value: (r) => litersPer100(r), decimals: 1, width: 24 },
];

/** What each figure is, for the page and the files (rule 5 of the plan: measured, declared, estimated). */
export const METRICS_NOTE =
  'Medido: los kilómetros del GPS de la app. Declarado: los kilómetros facturables, los kilos y los importes que completa la oficina, y los litros y montos de las boletas. Estimado: el consumo, que divide los litros cargados en el período por los kilómetros del GPS, y se calcula con 300 km o más.';
