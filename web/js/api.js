// Supabase access: login session (kept in this browser), REST queries and friendly error messages.
import { SUPABASE_KEY, SUPABASE_URL } from './config.js';

const STORE = 'trf-panel-session';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || body?.msg || body?.error_description || body?.error || `HTTP ${status}`);
    this.status = status;
    this.code = body?.code || body?.error_code || null;
    this.details = body?.details || null;
  }
}

/** The row changed (or was created) by someone else after it was loaded. */
export class ConflictError extends Error {
  constructor() {
    super('conflict');
    this.conflict = true;
  }
}

let session = readSession();
let refreshing = null;
const listeners = new Set();

function readSession() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    return s && s.access_token && s.refresh_token ? s : null;
  } catch {
    return null;
  }
}

function saveSession(s) {
  session = s;
  try {
    if (s) localStorage.setItem(STORE, JSON.stringify(s));
    else localStorage.removeItem(STORE);
  } catch { /* private mode: the session lasts until the tab closes */ }
  for (const fn of listeners) {
    try { fn(session); } catch { /* a listener must not break the others */ }
  }
}

function withExpiry(s) {
  if (s && !s.expires_at && s.expires_in) s.expires_at = Math.floor(Date.now() / 1000) + Number(s.expires_in);
  return s;
}

export const onSessionChange = (fn) => listeners.add(fn);
export const currentUser = () => session?.user || null;
export const hasSession = () => Boolean(session);

async function send(url, { method = 'GET', headers = {}, body, token } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { apikey: SUPABASE_KEY, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
      body,
    });
  } catch {
    throw new ApiError(0, { message: 'network' });
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { message: text }; }
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export async function login(email, password) {
  const s = await send(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  saveSession(withExpiry(s));
  return s.user;
}

export function logout() {
  const token = session?.access_token;
  saveSession(null);
  if (token) {
    fetch(SUPABASE_URL + '/auth/v1/logout', { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token } }).catch(() => {});
  }
}

function refresh() {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const s = await send(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: session?.refresh_token }),
        });
        saveSession(withExpiry(s));
      } catch (e) {
        if (e.status >= 400 && e.status < 500) {
          saveSession(null);
          throw new ApiError(401, { message: 'session expired' });
        }
        throw e;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

async function accessToken() {
  if (!session) throw new ApiError(401, { message: 'no session' });
  if ((session.expires_at || 0) < Date.now() / 1000 + 60) await refresh();
  if (!session) throw new ApiError(401, { message: 'no session' });
  return session.access_token;
}

async function authed(url, options = {}) {
  const token = await accessToken();
  try {
    return await send(url, { ...options, token });
  } catch (e) {
    if (e.status !== 401 || !session) throw e;
    await refresh();
    return send(url, { ...options, token: session.access_token });
  }
}

/** PostgREST call: path like "trf_panel_trips?select=*". */
export function rest(path, { method = 'GET', body, prefer } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  return authed(SUPABASE_URL + '/rest/v1/' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

/** Reads every page of a query (1000 rows per request) up to max rows. */
export async function restAll(path, max = 5000) {
  const rows = [];
  const size = 1000;
  for (let offset = 0; offset < max; offset += size) {
    const page = await rest(`${path}&limit=${Math.min(size, max - offset)}&offset=${offset}`);
    if (!Array.isArray(page)) break;
    rows.push(...page);
    if (page.length < size) break;
  }
  return rows;
}

export const rpc = (fn, args = {}) => rest('rpc/' + fn, { method: 'POST', body: args });

/** Temporary link to a private photo (boleta / remito). */
export async function signedUrl(bucket, path, expiresIn = 300) {
  const encoded = String(path).split('/').map(encodeURIComponent).join('/');
  const r = await authed(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${encoded}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn }),
  });
  const url = r?.signedURL || r?.signedUrl;
  if (!url) throw new ApiError(404, { message: 'no signed url' });
  return url.startsWith('http') ? url : SUPABASE_URL + '/storage/v1' + url;
}

/** Missing install script (tables or functions of the panel are not in the database). */
export function isSetupMissing(e) {
  return e?.status === 404 && ['PGRST202', 'PGRST205', '42P01', '42883'].includes(e?.code);
}

/** Message in plain Spanish for any error, so the screen never shows technical text. */
export function describeError(e) {
  if (e?.conflict) return 'Otra persona modificó este viaje mientras lo editabas. Se recargaron los datos: revisalos y guardá de nuevo.';
  if (!(e instanceof ApiError)) return 'Ocurrió un error inesperado. Recargá la página y volvé a intentar.';
  if (e.status === 0) return 'Sin conexión con el servidor. Revisá internet y volvé a intentar.';
  if (e.status === 401) return 'Tu sesión venció. Volvé a ingresar.';
  if (isSetupMissing(e)) return 'Falta instalar el panel en la base de datos (archivo web/sql/001_panel_web.sql).';
  if (e.code === '42501' || e.status === 403) return 'Tu cuenta no tiene permiso para esta acción.';
  if (e.code === '23505') return 'Ese viaje ya fue registrado por otra persona. Se recargaron los datos.';
  if (e.code === '23514' || e.code === '22P02' || e.code === '22003') return 'Algún dato no es válido para guardar. Revisá los números y las fechas.';
  if (e.status >= 500) return 'El servidor no respondió bien. Esperá un momento y volvé a intentar.';
  return 'No se pudo completar la acción. Volvé a intentar.';
}
