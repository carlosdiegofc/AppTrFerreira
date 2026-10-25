// Flota (decision of 24/10/2026): the card of each truck of the catalog and of each trailer, which trailer each truck
// takes and since when, and what the list shows of each truck. The list of trucks is still the catalog the phones use:
// a card joins its truck by the same key as its tank. Nothing is deleted: a vehicle sold keeps its card with the day it
// left, and a wrong hitch is annulled. Pure functions: no network, no React.
import type { Tables, TablesInsert } from './database.types';
import { addDays, calendarDay, firstOfMonth, formatDay } from './dates';
import { type CatalogTruck, truckLabel } from './fleet';
import { parseNumber, toNumber } from './numbers';
import type { PaperState, ServiceState } from './papers';
import { roadVehicleKey } from './road';

export type VehicleRow = Tables<'trf_fleet_units'>;
export type HitchRow = Tables<'trf_fleet_hitches'>;
export type VehicleKind = 'truck' | 'trailer';
export type CapacityUnit = 'kg' | 'm3';

/** The kinds of trailer the form suggests; any other can be written. */
export const TRAILER_BODIES = ['Semirremolque', 'Acoplado', 'Cisterna', 'Volcadora', 'Playo', 'Furgón', 'Jaula', 'Portacontenedor'] as const;
export const VEHICLE_LIMITS = { plate: 20, brand: 60, model: 80, body: 40, chassis: 40, engine: 40, notes: 1000, leftReason: 200, hitchNotes: 500 } as const;
/** Below a million, as the database checks. */
export const MAX_CAPACITY = 999_999.99;
export const FIRST_YEAR = 1950;

export interface Vehicle {
  id: string;
  kind: VehicleKind;
  /** «plate:abc1234», as the tank and the account in GPS; «model:…» for a catalog truck without plate. */
  key: string;
  plate: string;
  brand: string;
  model: string;
  /** The kind of trailer; '' for a truck. */
  body: string;
  year: number | null;
  chassis: string;
  engine: string;
  capacity: number | null;
  capacityUnit: CapacityUnit | null;
  notes: string;
  /** The photo in the folder trf-fleet-photos. */
  photoPath: string | null;
  /** The day it was sold or stopped being used: the card stays, out of the current lists. */
  leftOn: string | null;
  leftReason: string;
  updatedAt: string;
}

const clean = (v: string | null | undefined) => (v ?? '').trim();

export function vehicleFromRow(r: VehicleRow): Vehicle {
  const capacity = toNumber(r.capacity);
  const unit = r.capacity_unit === 'kg' || r.capacity_unit === 'm3' ? r.capacity_unit : null;
  return {
    id: r.id,
    kind: r.kind === 'trailer' ? 'trailer' : 'truck',
    key: r.vehicle_key,
    plate: clean(r.plate),
    brand: clean(r.brand),
    model: clean(r.model),
    body: clean(r.body),
    year: r.year,
    chassis: clean(r.chassis),
    engine: clean(r.engine),
    capacity: capacity !== null && unit !== null ? capacity : null,
    capacityUnit: capacity !== null ? unit : null,
    notes: clean(r.notes),
    photoPath: r.photo_path,
    leftOn: r.left_on,
    leftReason: clean(r.left_reason),
    updatedAt: r.updated_at,
  };
}

export interface Hitch {
  id: string;
  trailerId: string;
  truckKey: string;
  /** The first and the last day the truck took it; without the last one, it takes it now. */
  fromOn: string;
  toOn: string | null;
  notes: string;
  /** Annulled: it does not count. */
  deleted: boolean;
  updatedAt: string;
}

export function hitchFromRow(r: HitchRow): Hitch {
  return { id: r.id, trailerId: r.trailer_id, truckKey: r.truck_key, fromOn: r.from_on, toOn: r.to_on, notes: clean(r.notes), deleted: r.deleted_at !== null, updatedAt: r.updated_at };
}

/** The key of a catalog truck: the same as its tank's and its account's in GPS. */
export const truckKey = (t: CatalogTruck) => roadVehicleKey(truckLabel(t));
/** A plate as it is saved: capitals, without spaces or dashes. */
export const normalPlate = (raw: string) => raw.toUpperCase().replace(/[\s-]+/g, '');
/** The key of a trailer: its plate, as the database checks. */
export const plateKey = (plate: string) => 'plate:' + plate.toLowerCase();

/**
 * The keys a trailer's plate cannot take: those of every other card and of every truck of the catalog, also with the
 * plate written as a trailer's (a catalog plate «ABC-1234» is the trailer plate «ABC1234»).
 */
export function takenKeys(vehicles: readonly Vehicle[], catalog: readonly CatalogTruck[], except: string | null = null): Set<string> {
  const keys = new Set<string>();
  const add = (key: string, plate: string) => {
    keys.add(key);
    if (normalPlate(plate) !== '') keys.add(plateKey(normalPlate(plate)));
  };
  for (const v of vehicles) if (v.id !== except) add(v.key, v.plate);
  for (const t of catalog) add(truckKey(t), t.plate);
  return keys;
}

/** A trailer as lists and its papers name it: «Semirremolque Randon · REM1001». */
export function trailerLabel(v: Pick<Vehicle, 'body' | 'brand' | 'plate'>): string {
  return `${[v.body || 'Acoplado', v.brand].filter(Boolean).join(' ')} · ${v.plate}`;
}

/** Brand, model and year in one line («Volvo FH 460 · 2018»), or null when the card has none of them. */
export function makeLine(v: Pick<Vehicle, 'brand' | 'model' | 'year'>): string | null {
  const make = [v.brand, v.model].filter(Boolean).join(' ');
  const line = [make, v.year !== null ? String(v.year) : ''].filter(Boolean).join(' · ');
  return line || null;
}

/** What it carries: «30.000 kg», «30 m³». */
export function capacityText(v: Pick<Vehicle, 'capacity' | 'capacityUnit'>, format: (n: number) => string): string | null {
  if (v.capacity === null || v.capacityUnit === null) return null;
  return `${format(v.capacity)} ${v.capacityUnit === 'm3' ? 'm³' : 'kg'}`;
}

// The brands of trucks the catalog writes before the model, longest first: «Mercedes Benz 1630» is brand «Mercedes Benz».
const BRANDS = [
  'Mercedes-Benz',
  'Mercedes Benz',
  'International',
  'Freightliner',
  'Volkswagen',
  'Mitsubishi',
  'Peterbilt',
  'Chevrolet',
  'Kenworth',
  'Sinotruk',
  'Dongfeng',
  'Mercedes',
  'Shacman',
  'Hyundai',
  'Leyland',
  'Renault',
  'Agrale',
  'Scania',
  'Foton',
  'Isuzu',
  'Iveco',
  'Volvo',
  'Ford',
  'Fiat',
  'Hino',
  'Mack',
  'DAF',
  'FAW',
  'JAC',
  'JMC',
  'Kia',
  'MAN',
  'VW',
];

/** The brand and the model of a truck as the catalog writes it («Ford Cargo 1722»), to start its card with. */
export function splitMake(tipo: string): { brand: string; model: string } {
  const t = tipo.trim().replace(/\s+/g, ' ');
  const lower = t.toLowerCase();
  const brand = BRANDS.find((b) => lower === b.toLowerCase() || lower.startsWith(b.toLowerCase() + ' '));
  return brand ? { brand: t.slice(0, brand.length), model: t.slice(brand.length).trim() } : { brand: '', model: t };
}

// ---- Which trailer each truck takes ----

const newestFirst = (hitches: readonly Hitch[]) => hitches.filter((h) => !h.deleted).sort((a, b) => b.fromOn.localeCompare(a.fromOn));

/** The trailer a truck takes now and the ones it took before, the newest first; annulled ones do not count. */
export function truckTrailers(key: string, hitches: readonly Hitch[]): { current: Hitch | null; past: Hitch[] } {
  const mine = newestFirst(hitches.filter((h) => h.truckKey === key));
  return { current: mine.find((h) => h.toOn === null) ?? null, past: mine.filter((h) => h.toOn !== null) };
}

/** The truck a trailer goes on now and the ones it went on before, the newest first. */
export function trailerTrucks(id: string, hitches: readonly Hitch[]): { current: Hitch | null; past: Hitch[] } {
  const mine = newestFirst(hitches.filter((h) => h.trailerId === id));
  return { current: mine.find((h) => h.toOn === null) ?? null, past: mine.filter((h) => h.toOn !== null) };
}

/** «Desde el 01/03/2025» or «Del 10/01/2023 al 28/02/2025». */
export function hitchDays(h: Pick<Hitch, 'fromOn' | 'toOn'>): string {
  return h.toOn === null ? `Desde el ${formatDay(h.fromOn)}` : `Del ${formatDay(h.fromOn)} al ${formatDay(h.toOn)}`;
}

const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= `${FIRST_YEAR}-01-01` && !Number.isNaN(Date.parse(v + 'T12:00:00Z'));

export interface HitchFormValues {
  trailerId: string;
  fromOn: string;
  notes: string;
}

/**
 * A trailer for a truck from a day: the trailer it takes now (truckNow) and the truck the trailer is on (trailerNow) stay
 * until the day before, so the day has to come after both started. Nothing in the future: what a truck takes is known.
 */
export function validateHitch(
  v: HitchFormValues,
  today: string,
  truckNow: Pick<Hitch, 'trailerId' | 'fromOn'> | null,
  trailerNow: Pick<Hitch, 'fromOn'> | null,
): { errors: Partial<Record<keyof HitchFormValues, string>>; ok: boolean } {
  const errors: Partial<Record<keyof HitchFormValues, string>> = {};
  if (!v.trailerId) errors.trailerId = 'Elegí el acoplado.';
  else if (truckNow && truckNow.trailerId === v.trailerId) errors.trailerId = 'Ya lleva ese acoplado.';
  if (!isDay(v.fromOn)) errors.fromOn = 'Elegí desde qué día lo lleva.';
  else if (v.fromOn > today) errors.fromOn = 'No puede ser posterior a hoy.';
  else if (truckNow && v.fromOn <= truckNow.fromOn) errors.fromOn = `Tiene que ser posterior al ${formatDay(truckNow.fromOn)}, cuando enganchó el que lleva ahora.`;
  else if (trailerNow && v.fromOn <= trailerNow.fromOn) errors.fromOn = `Tiene que ser posterior al ${formatDay(trailerNow.fromOn)}, cuando lo engancharon al camión en el que va.`;
  if (v.notes.trim().length > VEHICLE_LIMITS.hitchNotes) errors.notes = `Hasta ${VEHICLE_LIMITS.hitchNotes} caracteres.`;
  return { errors, ok: Object.keys(errors).length === 0 };
}

/** The last day a truck took its trailer, when it is unhitched without another one. */
export function validateUnhitch(toOn: string, current: Pick<Hitch, 'fromOn'>, today: string): string | null {
  if (!isDay(toOn)) return 'Elegí hasta qué día lo llevó.';
  if (toOn > today) return 'No puede ser posterior a hoy.';
  if (toOn < current.fromOn) return `No puede ser anterior al ${formatDay(current.fromOn)}, cuando lo enganchó.`;
  return null;
}

/** The day before: where the trailer a truck had stays when another one goes on. */
export const dayBefore = (day: string) => addDays(day, -1);

// ---- The card ----

export interface VehicleFormValues {
  /** Only a trailer's: a truck's comes from the catalog. */
  plate: string;
  brand: string;
  model: string;
  body: string;
  year: string;
  chassis: string;
  engine: string;
  capacity: string;
  capacityUnit: CapacityUnit;
  notes: string;
  /** Sold or no longer used, since leftOn. */
  gone: boolean;
  leftOn: string;
  leftReason: string;
}

export type VehicleField = keyof VehicleFormValues;

/** What the form starts with: the card as it is, a new truck's card from its catalog name, or a new trailer. */
export function vehicleFormValues(v: Vehicle | null, truck: CatalogTruck | null = null): VehicleFormValues {
  if (!v) {
    const make = truck ? splitMake(truck.model) : { brand: '', model: '' };
    return { plate: '', ...make, body: '', year: '', chassis: '', engine: '', capacity: '', capacityUnit: 'kg', notes: '', gone: false, leftOn: '', leftReason: '' };
  }
  return {
    plate: v.plate,
    brand: v.brand,
    model: v.model,
    body: v.body,
    year: v.year === null ? '' : String(v.year),
    chassis: v.chassis,
    engine: v.engine,
    capacity: v.capacity === null ? '' : String(v.capacity).replace('.', ','),
    capacityUnit: v.capacityUnit ?? (v.body.toLowerCase().includes('cisterna') ? 'm3' : 'kg'),
    notes: v.notes,
    gone: v.leftOn !== null,
    leftOn: v.leftOn ?? '',
    leftReason: v.leftReason,
  };
}

export type VehicleCardRow = Omit<TablesInsert<'trf_fleet_units'>, 'id' | 'photo_path' | 'created_at' | 'created_by' | 'updated_at' | 'updated_by'>;

/** The truck a truck's card goes with: its catalog truck, or the card itself once it exists. */
export const truckIdentity = (card: Pick<Vehicle, 'plate' | 'key'> | null, truck: CatalogTruck | null): { plate: string; key: string } | null =>
  card ? { plate: card.plate, key: card.key } : truck ? { plate: truck.plate.trim(), key: truckKey(truck) } : null;

/**
 * The card to save, or what is wrong with each field. A truck's card goes with its truck (identity: its key and plate);
 * a trailer's with the plate typed, which no other truck or trailer may have (taken: their keys).
 */
export function validateVehicle(
  v: VehicleFormValues,
  kind: VehicleKind,
  today: string,
  identity: { plate: string; key: string } | null,
  taken: ReadonlySet<string>,
  /** The day its hitch of now started, for a card not given away yet: the database closes it the day before the sale. */
  hitchedFrom: string | null = null,
): { row: VehicleCardRow | null; errors: Partial<Record<VehicleField, string>> } {
  const errors: Partial<Record<VehicleField, string>> = {};
  let plate = '';
  let key = '';
  if (kind === 'truck') {
    if (!identity) errors.plate = 'Elegí el camión.';
    else ({ plate, key } = identity);
  } else {
    plate = normalPlate(v.plate);
    key = plateKey(plate);
    if (!plate) errors.plate = 'Escribí la matrícula.';
    else if (plate.length > VEHICLE_LIMITS.plate) errors.plate = `Hasta ${VEHICLE_LIMITS.plate} caracteres.`;
    else if (!/^[A-Z0-9Ñ]+$/.test(plate)) errors.plate = 'Solo letras y números.';
    else if (taken.has(key)) errors.plate = 'Ya hay un camión o un acoplado con esa matrícula.';
  }
  const texts: [VehicleField, string, number][] = [
    ['brand', v.brand.trim(), VEHICLE_LIMITS.brand],
    ['model', v.model.trim(), VEHICLE_LIMITS.model],
    ['body', kind === 'trailer' ? v.body.trim() : '', VEHICLE_LIMITS.body],
    ['chassis', v.chassis.trim(), VEHICLE_LIMITS.chassis],
    ['engine', v.engine.trim(), VEHICLE_LIMITS.engine],
    ['notes', v.notes.trim(), VEHICLE_LIMITS.notes],
    ['leftReason', v.gone ? v.leftReason.trim() : '', VEHICLE_LIMITS.leftReason],
  ];
  for (const [field, value, max] of texts) if (value.length > max) errors[field] = `Hasta ${max} caracteres.`;
  const lastYear = Number(today.slice(0, 4)) + 1;
  const yearText = v.year.trim();
  let year: number | null = null;
  if (yearText !== '') {
    year = /^\d{4}$/.test(yearText) ? Number(yearText) : Number.NaN;
    if (!(year >= FIRST_YEAR && year <= lastYear)) errors.year = `Escribí un año entre ${FIRST_YEAR} y ${lastYear}.`;
  }
  let capacity: number | null = null;
  const parsed = parseNumber(v.capacity);
  if (!parsed.ok) errors.capacity = parsed.error;
  else if (parsed.value !== null) {
    if (parsed.value <= 0) errors.capacity = 'Tiene que ser mayor que cero.';
    else if (parsed.value > MAX_CAPACITY) errors.capacity = 'Es demasiado grande.';
    else if (Math.abs(Math.round(parsed.value * 100) - parsed.value * 100) > 1e-6) errors.capacity = 'Hasta dos decimales.';
    else capacity = Math.round(parsed.value * 100) / 100;
  }
  if (v.gone) {
    if (!isDay(v.leftOn)) errors.leftOn = 'Elegí el día en que se vendió o dejó de usarse.';
    else if (v.leftOn > today) errors.leftOn = 'No puede ser posterior a hoy.';
    else if (hitchedFrom !== null && v.leftOn <= hitchedFrom) errors.leftOn = `Tiene que ser posterior al ${formatDay(hitchedFrom)}, cuando se enganchó. Si ese enganche fue un error, anulalo.`;
  }
  if (Object.keys(errors).length > 0) return { row: null, errors };
  return {
    row: {
      kind,
      vehicle_key: key,
      plate,
      brand: v.brand.trim().replace(/\s+/g, ' '),
      model: v.model.trim().replace(/\s+/g, ' '),
      body: kind === 'trailer' ? v.body.trim().replace(/\s+/g, ' ') : '',
      year,
      chassis: v.chassis.trim().toUpperCase(),
      engine: v.engine.trim().toUpperCase(),
      capacity,
      capacity_unit: capacity === null ? null : v.capacityUnit,
      notes: v.notes.trim(),
      left_on: v.gone ? v.leftOn : null,
      left_reason: v.gone ? v.leftReason.trim() : '',
    },
    errors,
  };
}

// ---- The list ----

export interface TruckEntry {
  key: string;
  /** As the catalog names it («Volvo FH 460 · ABC1234»), or as its card does when it is no longer in the catalog. */
  label: string;
  /** Its plate, or empty when the catalog has none. */
  plate: string;
  truck: CatalogTruck | null;
  card: Vehicle | null;
  /** The trailer it takes now, and since when. */
  trailer: Vehicle | null;
  hitch: Hitch | null;
}

/**
 * Every truck: the ones of the catalog, with their card when they have one, and the cards of trucks that are no longer
 * in it. Sold ones (with the day they left) are apart: gone.
 */
export function truckEntries(catalog: readonly CatalogTruck[], vehicles: readonly Vehicle[], hitches: readonly Hitch[]): { current: TruckEntry[]; gone: TruckEntry[] } {
  const cards = new Map(vehicles.filter((v) => v.kind === 'truck').map((v) => [v.key, v]));
  const trailers = new Map(vehicles.filter((v) => v.kind === 'trailer').map((v) => [v.id, v]));
  const entry = (key: string, label: string, truck: CatalogTruck | null): TruckEntry => {
    const hitch = truckTrailers(key, hitches).current;
    const card = cards.get(key) ?? null;
    return { key, label, plate: truck ? truck.plate.trim() : (card?.plate ?? ''), truck, card, trailer: hitch ? (trailers.get(hitch.trailerId) ?? null) : null, hitch };
  };
  const seen = new Set<string>();
  const all: TruckEntry[] = [];
  for (const t of catalog) {
    const label = truckLabel(t);
    const key = truckKey(t);
    if (label === '' || seen.has(key)) continue;
    seen.add(key);
    all.push(entry(key, label, t));
  }
  for (const card of cards.values()) {
    if (seen.has(card.key)) continue;
    const label = [[card.brand, card.model].filter(Boolean).join(' '), card.plate].filter(Boolean).join(' · ') || card.key.replace(/^(plate|model):/, '').toUpperCase();
    all.push(entry(card.key, label, null));
  }
  const byLabel = (a: TruckEntry, b: TruckEntry) => a.label.localeCompare(b.label, 'es');
  return { current: all.filter((e) => !e.card?.leftOn).sort(byLabel), gone: all.filter((e) => e.card?.leftOn).sort(byLabel) };
}

export type Attention = 'late' | 'soon' | null;

/** How urgent a truck is for the list: a paper or a service late, or low fuel, before what is coming up. */
export function attention(papers: readonly PaperState[], services: readonly ServiceState[], lowFuel: boolean): Attention {
  if (lowFuel || papers.includes('late') || services.includes('late')) return 'late';
  if (papers.includes('soon') || services.includes('soon')) return 'soon';
  return null;
}

const RANK = { late: 0, soon: 1 } as const;
/** The urgent ones first, then the ones with something coming up, then by name. */
export const byAttention = <T extends { attention: Attention; label: string }>(list: readonly T[]): T[] =>
  [...list].sort((a, b) => (a.attention ? RANK[a.attention] : 2) - (b.attention ? RANK[b.attention] : 2) || a.label.localeCompare(b.label, 'es'));

/** Whether a paper's truck or trailer is this one: by plate, so an older name of it still counts. */
export function samePlate(label: string, plate: string): boolean {
  const cut = label.lastIndexOf(' · ');
  const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return plate !== '' && cut >= 0 && squash(label.slice(cut + 3)) === squash(plate);
}

/**
 * Whether a paper or a service saved with this name is of this truck: by its name, or by its plate when it has one. A
 * truck no longer in the app's list is named by its card, and what was saved with the catalog's name keeps the plate.
 */
export const ofTruck = (name: string | null, truck: Pick<TruckEntry, 'label' | 'plate'>) => name !== null && (name === truck.label || samePlate(name, truck.plate));

// ---- Who drove it ----

export interface MonthDrivers {
  /** The first day of the month. */
  month: string;
  drivers: { name: string; trips: number; km: number }[];
}

/**
 * Who drove a truck each month, by its trips (the app's and the ones typed in the panel, as the office left them): the
 * newest month first and, in each, the one with most kilometres first.
 */
export function driversByMonth(trips: readonly { vehicle: string | null; driverName: string | null; departureAt: string | null; gpsKm: number | null; deleted: boolean }[], label: string): MonthDrivers[] {
  const months = new Map<string, Map<string, { trips: number; km: number }>>();
  for (const t of trips) {
    if (t.deleted || t.vehicle !== label) continue;
    const day = calendarDay(t.departureAt);
    if (day === null) continue;
    const month = firstOfMonth(day);
    const name = t.driverName?.trim() || 'Sin chofer';
    const byName = months.get(month) ?? new Map<string, { trips: number; km: number }>();
    const sum = byName.get(name) ?? { trips: 0, km: 0 };
    sum.trips++;
    sum.km += t.gpsKm ?? 0;
    byName.set(name, sum);
    months.set(month, byName);
  }
  return [...months]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, byName]) => ({
      month,
      drivers: [...byName].map(([name, s]) => ({ name, trips: s.trips, km: s.km })).sort((a, b) => b.km - a.km || b.trips - a.trips || a.name.localeCompare(b.name, 'es')),
    }));
}
