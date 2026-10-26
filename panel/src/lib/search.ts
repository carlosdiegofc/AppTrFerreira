// The search of the top bar: sections, trucks, trailers and drivers by any word of their name, plate or phone.
import type { IconName } from '../components/Icon';

export type SearchGroup = 'Secciones' | 'Camiones' | 'Acoplados' | 'Choferes' | 'Buscar en';
export const SEARCH_GROUPS: readonly SearchGroup[] = ['Secciones', 'Camiones', 'Acoplados', 'Choferes', 'Buscar en'];

export interface SearchItem {
  id: string;
  group: SearchGroup;
  title: string;
  detail: string;
  path: string;
  icon: IconName;
  /** What finds it, written as normal() leaves it. */
  words: string;
}

/** Lower case, without accents and with single spaces: «Configuración» and «configuracion» are the same. */
export function normal(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// A plate is found with or without its spaces and dashes: «abc-1234» finds ABC1234.
const compact = (text: string) => text.replace(/[\s-]+/g, '');

export function searchItem(group: SearchGroup, key: string, title: string, detail: string, path: string, icon: IconName, extra: readonly string[] = []): SearchItem {
  return { id: `${group}:${key}`, group, title, detail, path, icon, words: normal([title, ...extra].join(' ')) };
}

/**
 * The items that have every word of the query, group by group, at most perGroup in each: first the ones whose name
 * starts with the query, then the ones with a word that starts with it, then the rest, each by name.
 */
export function searchItems(query: string, items: readonly SearchItem[], perGroup = 5): SearchItem[] {
  const q = normal(query);
  const words = q.split(' ').filter((w) => w !== '');
  if (words.length === 0) return [];
  const rank = (it: SearchItem) => {
    const title = normal(it.title);
    if (title.startsWith(q)) return 0;
    return title.split(/[\s·]+/).some((w) => w.startsWith(words[0]!)) ? 1 : 2;
  };
  const found = items.filter((it) => words.every((w) => it.words.includes(w) || compact(it.words).includes(compact(w))));
  return SEARCH_GROUPS.flatMap((group) =>
    found
      .filter((it) => it.group === group)
      .map((it) => ({ it, rank: rank(it) }))
      .sort((a, b) => a.rank - b.rank || a.it.title.localeCompare(b.it.title, 'es', { sensitivity: 'base' }))
      .slice(0, perGroup)
      .map((r) => r.it),
  );
}

/** Searching the text itself where a list has its own search: Viajes (its longest period) and Gastos (all dates). */
export function searchIn(query: string): SearchItem[] {
  const text = query.trim();
  if (text === '') return [];
  const q = encodeURIComponent(text);
  return [
    { id: 'Buscar en:viajes', group: 'Buscar en', title: `«${text}» en Viajes`, detail: 'En los últimos 90 días', path: `/viajes?periodo=90&buscar=${q}`, icon: 'route', words: '' },
    { id: 'Buscar en:gastos', group: 'Buscar en', title: `«${text}» en Gastos y finanzas`, detail: 'En todas las fechas', path: `/finanzas?periodo=todo&buscar=${q}`, icon: 'money', words: '' },
  ];
}
