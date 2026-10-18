// Numbers and text as they are typed in Uruguay. Same rules as web/js/util.js and FleetStats.number() in the app.

export type Parsed = { ok: true; value: number | null } | { ok: false; error: string };

/**
 * Numbers the way they are typed in Uruguay: "30.000" (thirty thousand), "12,5", "1.234,5", and also "1234.5". Empty
 * text is no number; anything else that is not a number says why, for the forms.
 */
export function parseNumber(raw: unknown): Parsed {
  const s = String(raw ?? '').trim().replace(/\s+/g, '');
  if (s === '') return { ok: true, value: null };
  if (s.startsWith('-')) return { ok: false, error: 'No puede ser negativo.' };
  if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return { ok: false, error: 'Escribí solo números.' };
  const bad: Parsed = { ok: false, error: 'Número con formato raro. Ejemplos válidos: 30000, 30.000 o 12,5.' };
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  let normalized: string;
  if (dots > 0 && commas > 0) {
    const decimalIsComma = s.lastIndexOf(',') > s.lastIndexOf('.');
    const [intPart = '', decPart, extra] = decimalIsComma ? s.split(',') : s.split('.');
    if (extra !== undefined || !decPart) return bad;
    const groups = decimalIsComma ? /^\d{1,3}(\.\d{3})*$/ : /^\d{1,3}(,\d{3})*$/;
    if (!groups.test(intPart)) return bad;
    normalized = intPart.replace(/[.,]/g, '') + '.' + decPart;
  } else if (commas > 0) {
    if (commas > 1) return /^\d{1,3}(,\d{3})+$/.test(s) ? { ok: true, value: Number(s.replace(/,/g, '')) } : bad;
    if (s.startsWith(',') || s.endsWith(',')) return bad;
    normalized = s.replace(',', '.');
  } else if (dots > 0) {
    if (dots > 1 || /^\d{1,3}\.\d{3}$/.test(s)) {
      if (!/^\d{1,3}(\.\d{3})+$/.test(s)) return bad;
      normalized = s.replace(/\./g, '');
    } else {
      if (s.startsWith('.') || s.endsWith('.')) return bad;
      normalized = s;
    }
  } else {
    normalized = s;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? { ok: true, value } : bad;
}

/** Finite number from a number or numeric text; anything else is null. */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const parsed = parseNumber(value);
  return parsed.ok ? parsed.value : null;
}

/** Text without accents, in lower case: for searching. */
export function fold(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** JSON columns arrive as objects (jsonb) or, in older rows, as text holding JSON: both read the same. */
export function asObject(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}
