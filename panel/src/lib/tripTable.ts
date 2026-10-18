// What a trip shows, in the same words on the screen and in every file the office downloads (Excel, PDF, Word).
import { formatDayTime } from './dates';
import { truckParts } from './fleet';
import { decimal, money, number } from './format';
import { EMPTY_RETURN, type Trip } from './trips';

const ms = (iso: string | null) => (iso ? Date.parse(iso) : null);
const roundKm = (km: number | null) => (km === null ? null : Math.round(km * 10) / 10);

export const sourceLabel = (t: Pick<Trip, 'source'>) => (t.source === 'app' ? 'App GPS' : 'Cargado a mano');

/** The app keeps a delivery note of the departure and one of the arrival: "Remito de salida 0001-00012345". */
export function documentLabel(d: { kind: string; number: string }): string {
  const kind = d.kind === 'departure' ? 'Remito de salida' : d.kind === 'arrival' ? 'Remito de llegada' : 'Remito';
  return d.number.trim() ? `${kind} ${d.number.trim()}` : `${kind} sin número`;
}

/** Model and plate of the trip's truck ("Ford Cargo 1722", "GTP4265"). */
export function truckOf(t: Pick<Trip, 'vehicle'>): { model: string; plate: string } {
  return truckParts(t.vehicle ?? '');
}

/** "Paysandú – Montevideo", with what is missing said; empty when neither is known. */
export function routeText(t: Pick<Trip, 'originName' | 'destinationName'>): string {
  if (!t.originName && !t.destinationName) return '';
  return `${t.originName ?? '¿origen?'} – ${t.destinationName ?? '¿destino?'}`;
}

/** Km facturables when the office typed them (with their tenths), else the km the GPS measured. */
export function kmText(t: Pick<Trip, 'billableKm' | 'gpsKm'>): string {
  if (t.billableKm !== null) return `${decimal(t.billableKm, 1)} km fact.`;
  if (t.gpsKm !== null) return `${number(t.gpsKm, 1)} km GPS`;
  return '';
}

export interface SheetColumn {
  header: string;
  /** Width in characters. */
  width: number;
  kind: 'datetime' | 'text' | 'number';
  decimals?: number;
  value: (t: Trip) => string | number | null;
}

/** Every column of a trip, for the spreadsheet. */
export const SHEET_COLUMNS: SheetColumn[] = [
  { header: 'Salida', width: 17, kind: 'datetime', value: (t) => t.departureAt },
  { header: 'Llegada', width: 17, kind: 'datetime', value: (t) => t.arrivalAt },
  { header: 'Estado', width: 22, kind: 'text', value: (t) => t.status.label },
  { header: 'Orden de carga', width: 14, kind: 'text', value: (t) => t.orderNumber },
  { header: 'Chofer', width: 22, kind: 'text', value: (t) => t.driverName },
  { header: 'Camión', width: 20, kind: 'text', value: (t) => truckOf(t).model || null },
  { header: 'Matrícula', width: 11, kind: 'text', value: (t) => truckOf(t).plate || null },
  { header: 'Cliente', width: 24, kind: 'text', value: (t) => t.client },
  { header: 'Producto', width: 18, kind: 'text', value: (t) => t.product },
  { header: 'Origen', width: 24, kind: 'text', value: (t) => t.originName },
  { header: 'Destino', width: 24, kind: 'text', value: (t) => t.destinationName },
  { header: 'Km GPS', width: 9, kind: 'number', decimals: 1, value: (t) => roundKm(t.gpsKm) },
  { header: 'Km facturables', width: 12, kind: 'number', decimals: 1, value: (t) => t.billableKm },
  { header: 'Kilos', width: 10, kind: 'number', decimals: 0, value: (t) => t.kg },
  { header: 'Importe', width: 12, kind: 'number', decimals: 2, value: (t) => t.amount },
  { header: 'Moneda', width: 8, kind: 'text', value: (t) => (t.amount ? t.currency : null) },
  { header: 'Falta completar', width: 26, kind: 'text', value: (t) => (t.deleted ? null : t.status.missing.join(', ') || null) },
  { header: 'Notas', width: 30, kind: 'text', value: (t) => t.notes },
  { header: 'Registro', width: 14, kind: 'text', value: (t) => sourceLabel(t) },
];

/** The columns that fit on a printed page, for PDF and Word. */
export const PRINT_HEADERS = ['Salida', 'Chofer', 'Camión', 'Orden', 'Cliente', 'Producto', 'Origen – Destino', 'Km', 'Kilos', 'Importe', 'Estado'];

export function printRow(t: Trip): string[] {
  const { model, plate } = truckOf(t);
  return [
    formatDayTime(ms(t.departureAt)),
    t.driverName ?? '',
    plate || model,
    t.orderNumber ?? '',
    t.client ?? '',
    t.product ?? '',
    routeText(t),
    kmText(t),
    t.kg === null ? '' : number(t.kg, 0),
    t.amount === null ? '' : money(t.amount, t.currency),
    t.status.label,
  ];
}

export interface TripTotals {
  trips: number;
  /** Deleted trips can be listed (the trash) but never count. */
  deleted: number;
  billableKm: number;
  gpsKm: number;
  kg: number;
  /** Money is kept per currency: pesos and dollars are never added together. */
  amount: { UYU: number; USD: number };
}

export function tripTotals(list: readonly Trip[]): TripTotals {
  const totals: TripTotals = { trips: 0, deleted: 0, billableKm: 0, gpsKm: 0, kg: 0, amount: { UYU: 0, USD: 0 } };
  for (const t of list) {
    if (t.deleted) {
      totals.deleted++;
      continue;
    }
    totals.trips++;
    totals.billableKm += t.billableKm ?? 0;
    totals.gpsKm += t.gpsKm ?? 0;
    totals.kg += t.kg ?? 0;
    if (t.amount) totals.amount[t.currency] += t.amount;
  }
  return totals;
}

/** "12 viajes · 3.450 km facturables · 1.234,5 km GPS · 280.000 kg · $ 1.200.000 · US$ 3.500". */
export function totalsText(t: TripTotals): string {
  const deleted = t.deleted === 1 ? '1 viaje eliminado, que no se suma' : `${number(t.deleted)} viajes eliminados, que no se suman`;
  if (t.trips === 0 && t.deleted > 0) return deleted;
  return [
    t.trips === 1 ? '1 viaje' : `${number(t.trips)} viajes`,
    t.billableKm > 0 ? `${decimal(t.billableKm, 1)} km facturables` : null,
    t.gpsKm > 0 ? `${number(t.gpsKm, 1)} km GPS` : null,
    t.kg > 0 ? `${number(t.kg, 0)} kg` : null,
    t.amount.UYU > 0 ? money(t.amount.UYU, 'UYU') : null,
    t.amount.USD > 0 ? money(t.amount.USD, 'USD') : null,
    t.deleted > 0 ? `además, ${deleted}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The trip as a load order: the same facts on its page and in its PDF. */
export function tripFacts(t: Trip): [string, string][] {
  const { model, plate } = truckOf(t);
  const facts: [string, string | null][] = [
    ['Chofer', t.driverName],
    ['Camión', model || null],
    ['Matrícula', plate || null],
    ['Orden de carga', t.orderNumber],
    ['Cliente', t.client],
    ['Producto', t.product],
    ['Origen', t.originName],
    ['Destino', t.destinationName],
    ['Salida', formatDayTime(ms(t.departureAt)) || null],
    ['Llegada', t.active ? 'En curso' : formatDayTime(ms(t.arrivalAt)) || null],
    ['Km GPS', t.gpsKm === null ? null : `${number(t.gpsKm, 1)} km`],
    ['Km facturables', t.billableKm === null ? null : `${decimal(t.billableKm, 1)} km`],
    ['Kilos', t.kg === null ? null : `${number(t.kg, 0)} kg`],
    ['Importe', t.amount === null ? null : money(t.amount, t.currency)],
    ['Carga', t.loadType === null ? null : t.loadType === 'empty' ? EMPTY_RETURN : 'Con carga'],
  ];
  return facts.map(([label, value]) => [label, value ?? '—']);
}
