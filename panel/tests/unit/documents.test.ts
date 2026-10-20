import { describe, expect, it } from 'vitest';
import {
  driverChoices,
  fileType,
  filterPapers,
  groupPapers,
  looksLikePdf,
  newPaperRow,
  OTHER_PAPER_KIND,
  type PaperDocRow,
  paperChanges,
  paperFilePath,
  paperFormValues,
  paperFromRow,
  paperViews,
  samePaper,
  validatePaperForm,
} from '../../src/lib/documents';
import type { CatalogTruck } from '../../src/lib/fleet';

const catalog: CatalogTruck[] = [
  { model: 'Mercedes Benz Actros', plate: 'GHI9012' },
  { model: 'Volvo FH 460', plate: 'ABC1234' },
];

const row = (r: Partial<PaperDocRow> & Pick<PaperDocRow, 'id' | 'scope' | 'kind'>): PaperDocRow => ({
  created_at: '2026-10-01T12:00:00+00:00',
  created_by: null,
  driver_id: null,
  driver_name: '',
  expires_on: null,
  notes: '',
  object_path: null,
  updated_at: '2026-10-01T12:00:00+00:00',
  updated_by: null,
  vehicle: '',
  ...r,
});

const papers = [
  row({ id: 'p1', scope: 'driver', driver_id: 'ana', driver_name: 'Ana Pereira', kind: 'Licencia de conducir', expires_on: '2026-10-25', object_path: 'p1/f1.jpg' }),
  // Saved with an older label of the truck.
  row({ id: 'p2', scope: 'vehicle', vehicle: 'Mercedes Benz Actros', kind: 'SOA', expires_on: '2026-10-12', object_path: 'p2/f2.pdf' }),
  row({ id: 'p3', scope: 'vehicle', vehicle: 'Volvo FH 460 · ABC1234', kind: 'Habilitación MTOP', expires_on: '2027-05-03' }),
  row({ id: 'p4', scope: 'vehicle', vehicle: 'Volvo FH 460 · ABC1234', kind: 'Patente' }),
].map((r) => paperFromRow(r, catalog));

describe('papers', () => {
  const today = '2026-10-15';
  const views = paperViews(papers, today);
  it('name the truck as the catalog does, and know their file', () => {
    expect(papers[1]).toMatchObject({ vehicle: 'Mercedes Benz Actros · GHI9012', file: { path: 'p2/f2.pdf', type: 'pdf' } });
    expect(papers[0]?.file).toEqual({ path: 'p1/f1.jpg', type: 'photo' });
    expect(papers[2]?.file).toBeNull();
    expect(fileType('a/b.PDF')).toBe('pdf');
  });
  it('expired first, then about to expire, in force and without date', () => {
    expect(views.map((p) => [p.id, p.state])).toEqual([
      ['p2', 'late'],
      ['p1', 'soon'],
      ['p3', 'ok'],
      ['p4', 'nodate'],
    ]);
  });
  it('filter by trucks or drivers, state, whose and words; grouped by whose, the trucks first', () => {
    expect(filterPapers(views, { view: 'camiones' }).map((p) => p.id)).toEqual(['p2', 'p3', 'p4']);
    expect(filterPapers(views, { state: 'soon' }).map((p) => p.id)).toEqual(['p1']);
    expect(filterPapers(views, { owner: 'vehicle:Volvo FH 460 · ABC1234' }).map((p) => p.id)).toEqual(['p3', 'p4']);
    expect(filterPapers(views, { q: 'licencia ana' }).map((p) => p.id)).toEqual(['p1']);
    expect(groupPapers(views).map((g) => [g.owner, g.papers.map((p) => p.id)])).toEqual([
      ['Mercedes Benz Actros · GHI9012', ['p2']],
      ['Volvo FH 460 · ABC1234', ['p3', 'p4']],
      ['Ana Pereira', ['p1']],
    ]);
  });
  it('the drivers to choose from: each once, with the newest name, in order', () => {
    expect(
      driverChoices(
        [{ driver_id: 'b', driver_name: 'Bruno D.' }],
        [
          { driver_id: 'b', driver_name: 'Bruno Díaz' },
          { driver_id: 'a', driver_name: 'Ana Pereira' },
          { driver_id: null, driver_name: 'Sin id' },
          { driver_id: 'c', driver_name: '  ' },
        ],
      ),
    ).toEqual([
      { id: 'a', name: 'Ana Pereira' },
      { id: 'b', name: 'Bruno D.' },
    ]);
  });
});

describe('the paper form', () => {
  const drivers = [{ id: 'ana', name: 'Ana Pereira' }];
  it('a new truck paper needs the truck and the kind', () => {
    const blank = paperFormValues(null);
    expect(blank).toMatchObject({ scope: 'vehicle', kindChoice: '' });
    expect(validatePaperForm(blank, drivers).errors).toEqual({ vehicle: 'Elegí el camión.', kindChoice: 'Elegí el tipo de documento.' });
    const check = validatePaperForm({ ...blank, vehicle: 'Volvo FH 460 · ABC1234', kindChoice: 'Patente', expiresOn: '2027-01-31', notes: ' SCC 1234 ' }, drivers);
    expect(check.ok && newPaperRow('n1', check.payload, 'n1/f1.pdf')).toEqual({
      id: 'n1',
      scope: 'vehicle',
      vehicle: 'Volvo FH 460 · ABC1234',
      driver_id: null,
      driver_name: '',
      kind: 'Patente',
      expires_on: '2027-01-31',
      notes: 'SCC 1234',
      object_path: 'n1/f1.pdf',
    });
  });
  it('a driver paper is for one of the drivers, with the name it has', () => {
    const blank = { ...paperFormValues(null), scope: 'driver' as const, kindChoice: 'Carné de salud' };
    expect(validatePaperForm(blank, drivers).errors.driverId).toBe('Elegí el chofer.');
    const check = validatePaperForm({ ...blank, driverId: 'ana' }, drivers);
    expect(check.ok && check.payload).toMatchObject({ scope: 'driver', driverId: 'ana', driverName: 'Ana Pereira', vehicle: '' });
  });
  it('a change keeps whose it is (a truck paper may change truck) and the kind out of the list as written', () => {
    const ana = papers[0]!;
    const values = paperFormValues({ ...ana, kind: 'Libreta' });
    expect(values).toMatchObject({ scope: 'driver', driverId: 'ana', kindChoice: OTHER_PAPER_KIND, kind: 'Libreta' });
    // Ana is not in the list any more: her paper stays hers.
    const check = validatePaperForm(values, [], ana);
    expect(check.ok && paperChanges(check.payload, null)).toEqual({ kind: 'Libreta', expires_on: '2026-10-25', notes: '', object_path: null });
    const truck = validatePaperForm({ ...paperFormValues(papers[2]!), vehicle: 'Mercedes Benz Actros · GHI9012' }, []);
    expect(truck.ok && paperChanges(truck.payload, 'p3/f9.jpg')).toEqual({ vehicle: 'Mercedes Benz Actros · GHI9012', kind: 'Habilitación MTOP', expires_on: '2027-05-03', notes: '', object_path: 'p3/f9.jpg' });
  });
  it('files go in the folder of their paper, and a PDF starts like one', () => {
    expect(paperFilePath('p1', 'f1', 'photo')).toBe('p1/f1.jpg');
    expect(paperFilePath('p1', 'f1', 'pdf')).toBe('p1/f1.pdf');
    expect(looksLikePdf(new TextEncoder().encode('%PDF-1.7'))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode('<html>'))).toBe(false);
  });
  it('knows a save tried again that found what it sent', () => {
    const saved = row({ id: 'n1', scope: 'vehicle', vehicle: 'Volvo FH 460 · ABC1234', kind: 'Patente', object_path: 'n1/f1.pdf' });
    expect(samePaper(saved, { id: 'n1', scope: 'vehicle', vehicle: 'Volvo FH 460 · ABC1234', driver_id: null, kind: 'Patente', expires_on: null, notes: '', object_path: 'n1/f1.pdf' })).toBe(true);
    expect(samePaper(saved, { id: 'n1', scope: 'vehicle', vehicle: 'Volvo FH 460 · ABC1234', kind: 'Patente', object_path: null })).toBe(false);
  });
});
