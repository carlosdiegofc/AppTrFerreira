// Pure helpers (no DOM, no network) so they can be unit tested with node --test.

const LOCALE = 'es-UY';

/** Text without accents, lower case: for searching. */
export function fold(text) {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Empty strings and whitespace become null; everything else is trimmed text. */
export function cleanText(value) {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
}

/** First value that is not null/undefined/blank text. */
export function firstValue(...values) {
  for (const v of values) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    return v;
  }
  return null;
}

/** Finite number from a number or numeric text ("12.5", "12,5"); anything else is null. */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = parseNumber(value);
  return parsed.ok ? parsed.value : null;
}

/**
 * Parses numbers the way they are typed in Uruguay: "30.000" (thirty thousand), "12,5", "1.234,5",
 * and also "1234.5". Returns {ok, value} or {ok:false, error} with a message for the form.
 */
export function parseNumber(raw) {
  const s = String(raw ?? '').trim().replace(/\s+/g, '');
  if (s === '') return { ok: true, value: null };
  if (s.startsWith('-')) return { ok: false, error: 'No puede ser negativo.' };
  if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return { ok: false, error: 'Escribí solo números.' };
  const bad = { ok: false, error: 'Número con formato raro. Ejemplos válidos: 30000, 30.000 o 12,5.' };
  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;
  let normalized;
  if (dots && commas) {
    const decimalIsComma = s.lastIndexOf(',') > s.lastIndexOf('.');
    const [intPart, decPart, extra] = decimalIsComma ? s.split(',') : s.split('.');
    if (extra !== undefined || decPart === '') return bad;
    const groups = decimalIsComma ? /^\d{1,3}(\.\d{3})*$/ : /^\d{1,3}(,\d{3})*$/;
    if (!groups.test(intPart)) return bad;
    normalized = intPart.replace(/[.,]/g, '') + '.' + decPart;
  } else if (commas) {
    if (commas > 1) return /^\d{1,3}(,\d{3})+$/.test(s) ? { ok: true, value: Number(s.replace(/,/g, '')) } : bad;
    if (s.startsWith(',') || s.endsWith(',')) return bad;
    normalized = s.replace(',', '.');
  } else if (dots) {
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

export function formatNumber(value, decimals = 0) {
  const n = toNumber(value);
  if (n === null) return '—';
  return n.toLocaleString(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatMoney(value, currency = 'UYU') {
  const n = toNumber(value);
  if (n === null) return '—';
  const symbol = currency === 'USD' ? 'US$' : '$';
  const decimals = Math.round(n * 100) % 100 === 0 ? 0 : 2;
  return `${symbol} ${n.toLocaleString(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function validDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateTime(value) {
  const d = validDate(value);
  if (!d) return '—';
  return d.toLocaleString(LOCALE, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function formatDate(value) {
  const d = validDate(value);
  if (!d) return '—';
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 60000) return 'menos de 1 min';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

export function formatAgo(value, now = Date.now()) {
  const d = validDate(value);
  if (!d) return 'sin datos';
  const ms = now - d.getTime();
  if (ms < 60000) return 'hace instantes';
  return 'hace ' + formatDuration(ms);
}

const pad = (n) => String(n).padStart(2, '0');

/** ISO date → value for <input type="datetime-local"> in the browser's time zone. */
export function toLocalInput(value) {
  const d = validDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value → ISO string; '' → null; unreadable → undefined. */
export function fromLocalInput(value) {
  const text = String(value ?? '').trim();
  if (text === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(text)) return undefined;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Local calendar day "YYYY-MM-DD" for a Date. */
export function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Period presets → {from, to} as local "YYYY-MM-DD" days (to is inclusive). */
export function periodRange(kind, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const day = (offset) => dayKey(new Date(y, m, now.getDate() + offset));
  switch (kind) {
    case 'month': return { from: dayKey(new Date(y, m, 1)), to: dayKey(new Date(y, m + 1, 0)) };
    case 'prev-month': return { from: dayKey(new Date(y, m - 1, 1)), to: dayKey(new Date(y, m, 0)) };
    case '90': return { from: day(-89), to: day(0) };
    case '30':
    default: return { from: day(-29), to: day(0) };
  }
}

/** Inclusive local days → [fromIso, toIso) instants for queries. Null when the days are not valid. */
export function rangeToIso(from, to) {
  const parse = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''));
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const a = parse(from);
  const b = parse(to);
  if (!a || !b || b < a) return null;
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate() + 1);
  return { fromIso: a.toISOString(), toIso: end.toISOString() };
}

const PLATE_PATTERNS = [/^[A-Z]{1,4}\d{3,5}$/, /^[A-Z]{3}\d[A-Z]\d{2}$/, /^[A-Z]{2}\d{3}[A-Z]{2}$/];

export function normalizePlate(text) {
  const p = String(text ?? '').toUpperCase().replace(/[\s.-]/g, '');
  return PLATE_PATTERNS.some((re) => re.test(p)) ? p : '';
}

/** "Ford Cargo 1722 · ITP2187" → {model: "Ford Cargo 1722", plate: "ITP2187"}. */
export function splitVehicle(label) {
  const text = String(label ?? '').trim();
  if (!text || /^sin cami[oó]n/i.test(text)) return { model: '', plate: '', label: '' };
  const parts = text.split(/\s*·\s*/).filter(Boolean);
  const plate = normalizePlate(parts[parts.length - 1]);
  if (plate && parts.length > 1) return { model: parts.slice(0, -1).join(' · '), plate, label: text };
  if (plate) return { model: '', plate, label: text };
  return { model: text, plate: '', label: text };
}

export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** CSV for Excel in Spanish: ";" separator, BOM, protected against formulas. */
export function toCsv(rows, columns) {
  const cell = (value) => {
    if (value === null || value === undefined) return '';
    let text = typeof value === 'number' ? String(value).replace('.', ',') : String(value);
    if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return /[";\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  const lines = [columns.map((c) => cell(c.label)).join(';')];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

const RADIUS_M = 6371000;
export function distanceMeters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIUS_M * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function validLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}
