// Dates and times as the office reads them: in Uruguay, whatever the time zone of the computer.

export const ZONE = 'America/Montevideo';

const parts = (ms: number, zone: string) => {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ms)) {
    out[p.type] = p.value;
  }
  return out;
};

/** Calendar day (YYYY-MM-DD) of an instant in the zone. */
export function dayInZone(ms: number, zone = ZONE): string {
  const p = parts(ms, zone);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * The calendar day ("2026-10-15") of a value as the office reads it: a date stays as it is ("2026-10-15", or
 * "15/10/2026" as typed in the panel, like the app reads it) and an instant goes to its day in Uruguay, so 22:00 of the
 * 15th is still the 15th. Null when it is not a date.
 */
export function calendarDay(value: string | null | undefined, zone = ZONE): string | null {
  const text = (value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const typed = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (typed) return `${typed[3]}-${typed[2]}-${typed[1]}`;
  const ms = /^\d{4}-\d{2}-\d{2}T/.test(text) ? Date.parse(text) : Number.NaN;
  return Number.isNaN(ms) ? null : dayInZone(ms, zone);
}

/** Offset of the zone from UTC at an instant, in minutes (Uruguay: -180). */
export function zoneOffsetMinutes(ms: number, zone = ZONE): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(ms).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!m) return 0;
  const minutes = Number(m[2]) * 60 + Number(m[3] ?? '0');
  return m[1] === '-' ? -minutes : minutes;
}

const utcMidnight = (day: string) => {
  const [y, mo, d] = day.split('-').map(Number);
  return Date.UTC(y ?? 1970, (mo ?? 1) - 1, d ?? 1);
};

/** The instant a calendar day starts in the zone, as ISO text for database filters. */
export function startOfDay(day: string, zone = ZONE): string {
  const guess = utcMidnight(day);
  const offset = zoneOffsetMinutes(guess - zoneOffsetMinutes(guess, zone) * 60_000, zone);
  return new Date(guess - offset * 60_000).toISOString();
}

export function addDays(day: string, n: number): string {
  return new Date(utcMidnight(day) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utcMidnight(b) - utcMidnight(a)) / 86_400_000);
}

export function firstOfMonth(day: string): string {
  return day.slice(0, 8) + '01';
}

export function firstOfNextMonth(day: string): string {
  const [y, m] = day.split('-').map(Number);
  const next = new Date(Date.UTC(y ?? 1970, m ?? 1, 1));
  return next.toISOString().slice(0, 10);
}

/** "dd/mm/aaaa" for a calendar day. */
export function formatDay(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

/** Hour and minutes of an instant in the zone: "14:05". */
export function formatTime(ms: number, zone = ZONE): string {
  const p = parts(ms, zone);
  return `${p.hour}:${p.minute}`;
}

/** "dd/mm/aaaa hh:mm" of an instant in the zone; empty for no instant. */
export function formatDayTime(ms: number | null, zone = ZONE): string {
  if (ms === null || !Number.isFinite(ms)) return '';
  return `${formatDay(dayInZone(ms, zone))} ${formatTime(ms, zone)}`;
}

/**
 * The clock time in the zone as a Date whose UTC fields hold it. Spreadsheets have no time zones: a cell shows the UTC
 * fields of the date it is given, so this is how a 14:05 in Uruguay reads 14:05 in Excel.
 */
export function wallClock(ms: number, zone = ZONE): Date {
  const p = parts(ms, zone);
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)));
}

/** "2 h 40 min", "35 min". */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? `${minutes} min` : `${hours} h ${minutes % 60} min`;
}

/** "hoy", "mañana", "en 5 días", "ayer", "hace 3 días", as the app says it. */
export function inDays(target: string, today: string): string {
  const n = daysBetween(today, target);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n > 1) return `en ${n} días`;
  if (n === -1) return 'ayer';
  return `hace ${-n} días`;
}

/** How long ago something happened: "recién", "hace 4 min", "hace 2 h", "hace 3 días". */
export function ago(ms: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - ms) / 1000));
  if (seconds < 60) return 'recién';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'hace 1 día' : `hace ${days} días`;
}

/** Long date for the start screen: "sábado 18 de octubre". */
export function longDate(ms: number, zone = ZONE): string {
  return new Intl.DateTimeFormat('es-UY', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long' }).format(ms);
}

export function greeting(ms: number, zone = ZONE): string {
  const hour = Number(parts(ms, zone).hour);
  if (hour >= 5 && hour < 13) return 'Buen día';
  if (hour >= 13 && hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}
