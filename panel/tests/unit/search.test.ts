import { describe, expect, it } from 'vitest';
import { initials } from '../../src/lib/format';
import { normal, searchIn, searchItem, searchItems } from '../../src/lib/search';

const items = [
  searchItem('Secciones', 'configuracion', 'Configuración', 'Pronto', '/configuracion', 'sliders'),
  searchItem('Secciones', 'combustible', 'Combustible', '', '/combustible', 'fuel'),
  searchItem('Camiones', 'plate:abc1234', 'Volvo FH 460 · ABC1234', 'Con Semirremolque Randon', '/flota/camion/plate%3Aabc1234', 'truck', ['ABC1234', 'Volvo', 'FH 460']),
  searchItem('Camiones', 'plate:jkl3456', 'Ford Cargo 1722 · JKL3456', 'Camión', '/flota/camion/plate%3Ajkl3456', 'truck', ['JKL3456']),
  searchItem('Acoplados', 'a2', 'Semirremolque Randon · REM1001', 'Semirremolque', '/flota/acoplado/a2', 'box', ['REM1001']),
  searchItem('Choferes', 'd1', 'Ana Pereira', 'Chofer', '/choferes/d1', 'person', ['099 111 222']),
  searchItem('Choferes', 'd2', 'Carla Méndez', 'Chofer', '/choferes/d2', 'person', []),
];
const titles = (q: string) => searchItems(q, items).map((i) => i.title);

describe('searchItems', () => {
  it('finds without accents or capitals', () => {
    expect(normal('  Configuración   DEL  panel ')).toBe('configuracion del panel');
    expect(titles('configuracion')).toEqual(['Configuración']);
    expect(titles('MENDEZ')).toEqual(['Carla Méndez']);
  });

  it('needs every word, in any order', () => {
    expect(titles('460 volvo')).toEqual(['Volvo FH 460 · ABC1234']);
    expect(titles('volvo ford')).toEqual([]);
  });

  it('finds a plate written with spaces or dashes, and a phone', () => {
    expect(titles('abc-1234')).toEqual(['Volvo FH 460 · ABC1234']);
    expect(titles('rem 1001')).toEqual(['Semirremolque Randon · REM1001']);
    expect(titles('099111')).toEqual(['Ana Pereira']);
  });

  it('keeps the groups in order', () => {
    expect(searchItems('ra', items).map((i) => [i.group, i.title])).toEqual([
      ['Secciones', 'Configuración'],
      ['Acoplados', 'Semirremolque Randon · REM1001'],
      ['Choferes', 'Ana Pereira'],
    ]);
  });

  it('puts first the names that start with the text, then a word that starts with it, then the rest', () => {
    const people = ['Marcos Pena', 'Ana Penalba', 'Pedro Gil', 'Lupe Rodríguez'].map((name, i) => searchItem('Choferes', String(i), name, 'Chofer', `/choferes/${i}`, 'person'));
    expect(searchItems('pe', people).map((i) => i.title)).toEqual(['Pedro Gil', 'Ana Penalba', 'Marcos Pena', 'Lupe Rodríguez']);
  });

  it('shows at most a few of each group', () => {
    expect(searchItems('a', items, 1).map((i) => i.group)).toEqual(['Secciones', 'Camiones', 'Acoplados', 'Choferes']);
  });

  it('finds nothing without text', () => {
    expect(searchItems('   ', items)).toEqual([]);
  });
});

describe('searchIn', () => {
  it('offers the text in Viajes (its longest period), in Gastos (all dates) and among the clients of Cobros', () => {
    expect(searchIn(' Puerto & Co ').map((i) => [i.title, i.path])).toEqual([
      ['«Puerto & Co» en Viajes', '/viajes?periodo=90&buscar=Puerto%20%26%20Co'],
      ['«Puerto & Co» en Gastos y finanzas', '/finanzas?periodo=todo&buscar=Puerto%20%26%20Co'],
      ['«Puerto & Co» en Cobros', '/finanzas/cobros?buscar=Puerto%20%26%20Co'],
    ]);
    expect(searchIn('  ')).toEqual([]);
  });
});

describe('initials', () => {
  it('takes the first letters of the first two words that are names', () => {
    expect(initials('Dueño de Prueba')).toBe('DP');
    expect(initials('ana pereira')).toBe('AP');
    expect(initials('Socio')).toBe('S');
    expect(initials('')).toBe('·');
  });
});
