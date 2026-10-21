// Papers of trucks and drivers (Documentación): what each shows, grouped by whose they are, the filters, the form and
// the file of each paper (a photo or a PDF in the private folder trf-documents). Pure functions: no network, no React.
import type { Tables, TablesInsert, TablesUpdate } from './database.types';
import { calendarDay } from './dates';
import { canonical, type CatalogTruck, text, truckLabel } from './fleet';
import { fold } from './numbers';
import { type PaperState, paperState } from './papers';

export type PaperDocRow = Tables<'trf_documents'>;

/** The kinds the app offers; any other can be written. */
export const VEHICLE_PAPER_KINDS = ['SOA / Seguro', 'Patente', 'Habilitación MTOP'] as const;
export const DRIVER_PAPER_KINDS = ['Licencia de conducir', 'Carné de salud'] as const;
export const PAPER_LIMITS = { kind: 120, notes: 1000 } as const;
/** The folder takes up to 10 MB a file. */
export const FILE_MAX_BYTES = 10 * 1024 * 1024;

export type FileType = 'photo' | 'pdf';

export interface Paper {
  id: string;
  scope: 'driver' | 'vehicle';
  driverId: string | null;
  driverName: string;
  /** The truck as the catalog names it now; '' for a driver's paper. */
  vehicle: string;
  kind: string;
  expiresOn: string | null;
  notes: string;
  file: { path: string; type: FileType } | null;
  updatedAt: string;
}

export const fileType = (path: string): FileType => (/\.pdf$/i.test(path) ? 'pdf' : 'photo');

export function paperFromRow(r: PaperDocRow, catalog: readonly CatalogTruck[] = []): Paper {
  const scope = r.scope === 'vehicle' ? 'vehicle' : 'driver';
  const path = text(r.object_path);
  return {
    id: r.id,
    scope,
    driverId: r.driver_id,
    driverName: text(r.driver_name) ?? '',
    vehicle: scope === 'vehicle' ? (canonical(r.vehicle, catalog) ?? text(r.vehicle) ?? '') : '',
    kind: text(r.kind) ?? '',
    expiresOn: calendarDay(r.expires_on),
    notes: text(r.notes) ?? '',
    file: path === null ? null : { path, type: fileType(path) },
    updatedAt: r.updated_at,
  };
}

/** Whose it is, as the lists show it: the truck, or the driver. */
export const paperOwner = (p: Pick<Paper, 'scope' | 'vehicle' | 'driverName'>) => (p.scope === 'vehicle' ? p.vehicle || 'Camión sin nombre' : p.driverName || 'Chofer sin nombre');

export interface PaperView extends Paper {
  state: PaperState;
}

const rank: Record<PaperState, number> = { late: 0, soon: 1, ok: 2, nodate: 3 };

/** Each paper with its state: expired first, then about to expire, in force and without date; the nearest date first. */
export function paperViews(papers: readonly Paper[], today: string): PaperView[] {
  return papers
    .map((p) => ({ ...p, state: paperState(p.expiresOn, today) }))
    .sort((a, b) => rank[a.state] - rank[b.state] || (a.expiresOn ?? '').localeCompare(b.expiresOn ?? '') || paperOwner(a).localeCompare(paperOwner(b), 'es') || a.kind.localeCompare(b.kind, 'es'));
}

export type PaperListView = 'camiones' | 'choferes' | 'todos';
export type PaperStateFilter = '' | 'late' | 'soon' | 'ok' | 'nodate';

export interface PaperFilter {
  view?: PaperListView;
  state?: PaperStateFilter;
  owner?: string;
  q?: string;
}

/** Whose a paper is, for the filter: "vehicle:<truck>" or "driver:<id>". */
export const ownerKey = (p: Pick<Paper, 'scope' | 'vehicle' | 'driverId' | 'driverName'>) => (p.scope === 'vehicle' ? 'vehicle:' + p.vehicle : 'driver:' + (p.driverId ?? p.driverName));

export function filterPapers(list: readonly PaperView[], { view = 'todos', state = '', owner = '', q = '' }: PaperFilter = {}): PaperView[] {
  const words = fold(q).split(/\s+/).filter(Boolean);
  return list.filter((p) => {
    if (view === 'camiones' && p.scope !== 'vehicle') return false;
    if (view === 'choferes' && p.scope !== 'driver') return false;
    if (state && p.state !== state) return false;
    if (owner && ownerKey(p) !== owner) return false;
    const hay = fold([p.kind, paperOwner(p), p.notes].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

export interface PaperGroup {
  key: string;
  scope: 'driver' | 'vehicle';
  owner: string;
  papers: PaperView[];
}

/** The papers of each truck and each driver, the trucks first; each group keeps the order of the list. */
export function groupPapers(list: readonly PaperView[]): PaperGroup[] {
  const groups = new Map<string, PaperGroup>();
  for (const p of list) {
    const key = ownerKey(p);
    const g = groups.get(key) ?? { key, scope: p.scope, owner: paperOwner(p), papers: [] };
    g.papers.push(p);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => (a.scope === b.scope ? a.owner.localeCompare(b.owner, 'es') : a.scope === 'vehicle' ? -1 : 1));
}

export interface DriverChoice {
  id: string;
  name: string;
}

/**
 * The drivers a paper can be for: everyone who made a trip, opened the app or has a paper, with the latest name they
 * used. Each list comes newest first.
 */
export function driverChoices(...lists: readonly (readonly { driver_id: string | null; driver_name: string | null }[])[]): DriverChoice[] {
  const out = new Map<string, string>();
  for (const list of lists) {
    for (const r of list) {
      const name = text(r.driver_name);
      if (r.driver_id && name !== null && !out.has(r.driver_id)) out.set(r.driver_id, name);
    }
  }
  return [...out].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

// ---- The form ----

/** «Otro»: a kind written by hand. */
export const OTHER_PAPER_KIND = '__otro__';

export interface PaperFormValues {
  scope: 'driver' | 'vehicle';
  vehicle: string;
  driverId: string;
  /** One of the kinds of the list, or OTHER_PAPER_KIND. */
  kindChoice: string;
  kind: string;
  expiresOn: string;
  notes: string;
}

export type PaperField = keyof PaperFormValues;

export const paperKinds = (scope: 'driver' | 'vehicle'): readonly string[] => (scope === 'vehicle' ? VEHICLE_PAPER_KINDS : DRIVER_PAPER_KINDS);

/** What the form starts with: a new paper of a truck, or the paper as it is. */
export function paperFormValues(p: Paper | null): PaperFormValues {
  if (!p) return { scope: 'vehicle', vehicle: '', driverId: '', kindChoice: '', kind: '', expiresOn: '', notes: '' };
  const listed = paperKinds(p.scope).includes(p.kind);
  return {
    scope: p.scope,
    vehicle: p.vehicle,
    driverId: p.driverId ?? '',
    kindChoice: listed ? p.kind : OTHER_PAPER_KIND,
    kind: listed ? '' : p.kind,
    expiresOn: p.expiresOn ?? '',
    notes: p.notes,
  };
}

export const paperFormChanged = (a: PaperFormValues, b: PaperFormValues) => (Object.keys(a) as PaperField[]).some((k) => a[k] !== b[k]);

const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z')) && new Date(d + 'T00:00:00Z').toISOString().startsWith(d);

export interface PaperPayload {
  scope: 'driver' | 'vehicle';
  vehicle: string;
  driverId: string | null;
  driverName: string;
  kind: string;
  expiresOn: string | null;
  notes: string;
}

export type PaperCheck = { ok: true; payload: PaperPayload; errors: Partial<Record<PaperField, string>> } | { ok: false; errors: Partial<Record<PaperField, string>> };

/** Checks the form. A driver's paper is for one of the drivers listed (the one it already has stays valid). */
export function validatePaperForm(v: PaperFormValues, drivers: readonly DriverChoice[], current: Paper | null = null): PaperCheck {
  const errors: Partial<Record<PaperField, string>> = {};
  const vehicle = text(v.vehicle);
  let driver: DriverChoice | undefined;
  if (v.scope === 'vehicle') {
    if (vehicle === null) errors.vehicle = 'Elegí el camión.';
  } else {
    driver = drivers.find((d) => d.id === v.driverId) ?? (current?.driverId && current.driverId === v.driverId ? { id: current.driverId, name: current.driverName } : undefined);
    if (!driver) errors.driverId = 'Elegí el chofer.';
  }
  const kind = v.kindChoice === OTHER_PAPER_KIND ? text(v.kind) : text(v.kindChoice);
  if (kind === null) errors[v.kindChoice === OTHER_PAPER_KIND ? 'kind' : 'kindChoice'] = v.kindChoice === OTHER_PAPER_KIND ? 'Escribí el tipo de documento.' : 'Elegí el tipo de documento.';
  else if (kind.length > PAPER_LIMITS.kind) errors.kind = `Hasta ${PAPER_LIMITS.kind} letras.`;
  if (v.expiresOn.trim() !== '' && !isDay(v.expiresOn)) errors.expiresOn = 'La fecha no es válida.';
  const notes = text(v.notes) ?? '';
  if (notes.length > PAPER_LIMITS.notes) errors.notes = `Hasta ${PAPER_LIMITS.notes} letras.`;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    errors,
    payload: {
      scope: v.scope,
      vehicle: v.scope === 'vehicle' ? (vehicle as string) : '',
      driverId: driver?.id ?? null,
      driverName: driver?.name ?? '',
      kind: kind as string,
      expiresOn: v.expiresOn.trim() === '' ? null : v.expiresOn,
      notes,
    },
  };
}

/** Where the file of a paper goes: «<paper>/<file>.jpg» or «.pdf», the rule of the folder. */
export const paperFilePath = (paperId: string, fileId: string, type: FileType) => `${paperId}/${fileId}.${type === 'pdf' ? 'pdf' : 'jpg'}`;

/** A new paper, with its id (a save tried again does not make a second one) and its file, if it has one. */
export function newPaperRow(id: string, p: PaperPayload, objectPath: string | null): TablesInsert<'trf_documents'> {
  return { id, scope: p.scope, vehicle: p.vehicle, driver_id: p.driverId, driver_name: p.driverName, kind: p.kind, expires_on: p.expiresOn, notes: p.notes, object_path: objectPath };
}

/** What a change saves: whose it is stays, except the truck of a truck's paper. */
export function paperChanges(p: PaperPayload, objectPath: string | null): TablesUpdate<'trf_documents'> {
  return { ...(p.scope === 'vehicle' ? { vehicle: p.vehicle } : {}), kind: p.kind, expires_on: p.expiresOn, notes: p.notes, object_path: objectPath };
}

const SAVED_FIELDS = ['scope', 'vehicle', 'driver_id', 'driver_name', 'kind', 'expires_on', 'notes', 'object_path'] as const;

/** Whether the paper has what a save sends (what it does not send, it does not check): a try whose answer was cut went through. */
export function samePaper(saved: PaperDocRow, row: TablesInsert<'trf_documents'> | TablesUpdate<'trf_documents'>): boolean {
  return SAVED_FIELDS.every((k) => !(k in row) || (saved[k] ?? null) === (row[k] ?? null));
}

/** The first bytes of every PDF. */
export function looksLikePdf(head: Uint8Array): boolean {
  return head.length >= 5 && String.fromCharCode(...head.slice(0, 5)) === '%PDF-';
}

/** The trucks a truck's paper can be for: the catalog's, and any other a paper names. */
export function paperVehicles(papers: readonly Pick<Paper, 'scope' | 'vehicle'>[], catalog: readonly CatalogTruck[]): string[] {
  const listed = catalog.map(truckLabel).filter((l) => l !== '');
  const others = [...new Set(papers.filter((p) => p.scope === 'vehicle' && p.vehicle !== '' && !listed.includes(p.vehicle)).map((p) => p.vehicle))].sort((a, b) => a.localeCompare(b, 'es'));
  return [...new Set(listed), ...others];
}
