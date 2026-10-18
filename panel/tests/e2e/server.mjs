// Local stand-in for Supabase during the end-to-end tests (TEST ONLY):
//  /            → the panel built for the tests (dist-e2e)
//  /sb/rest/v1  → a real PostgREST connected to the local test database
//  /sb/auth/v1  → password and refresh-token sign-in issuing JWTs that PostgREST accepts
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist-e2e');
const POSTGREST = process.env.POSTGREST_URL || 'http://127.0.0.1:3301';
export const JWT_SECRET = process.env.JWT_SECRET || 'local-test-secret-for-trf-panel-0123456789';
export const PORT = Number(process.env.PANEL_E2E_PORT || 8791);
export const PASSWORD = 'clave-de-prueba';
// Same accounts as tests/e2e/db/seed.sql.
export const USERS = {
  'dueno@ejemplo.uy': { id: '00000000-0000-4000-8000-000000000001', name: 'Dueño de Prueba' },
  'lectura@ejemplo.uy': { id: '00000000-0000-4000-8000-000000000002', name: 'Socio Lectura' },
  'chofer1@ejemplo.uy': { id: '00000000-0000-4000-8000-000000000011', name: 'Ana Pereira' },
};
const refreshTokens = new Map();

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function signJwt(sub, email, ttl) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ sub, email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + ttl });
  return `${head}.${body}.${crypto.createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url')}`;
}
function verifyJwt(token) {
  const [head, body, sig] = String(token || '').split('.');
  if (!sig || crypto.createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url') !== sig) return null;
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
  return claims.exp > Date.now() / 1000 ? claims : null;
}
function user(email) {
  const u = USERS[email];
  return { id: u.id, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email' }, user_metadata: { full_name: u.name }, created_at: '2026-10-01T00:00:00Z' };
}
function session(email, ttl = 3600) {
  const refresh = crypto.randomUUID();
  refreshTokens.set(refresh, email);
  return { access_token: signJwt(USERS[email].id, email, ttl), token_type: 'bearer', expires_in: ttl, expires_at: Math.floor(Date.now() / 1000) + ttl, refresh_token: refresh, user: user(email) };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.map': 'application/json' };
const readBody = (req) => new Promise((resolve) => { const parts = []; req.on('data', (c) => parts.push(c)); req.on('end', () => resolve(Buffer.concat(parts))); });
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const FORWARD = ['authorization', 'content-type', 'prefer', 'accept', 'accept-profile', 'content-profile', 'range', 'range-unit'];

async function handle(req, res) {
  const url = new URL(req.url, 'http://local');
  const p = url.pathname;
  if (p === '/healthz') return json(res, 200, { ok: true });
  if (p.startsWith('/sb/rest/v1/')) {
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
    const headers = {};
    for (const h of FORWARD) if (req.headers[h]) headers[h] = req.headers[h];
    const r = await fetch(POSTGREST + p.slice('/sb/rest/v1'.length) + url.search, { method: req.method, headers, body });
    const out = Buffer.from(await r.arrayBuffer());
    const back = { 'Content-Type': r.headers.get('content-type') || 'application/json' };
    for (const h of ['content-range', 'preference-applied']) if (r.headers.get(h)) back[h] = r.headers.get(h);
    res.writeHead(r.status, back);
    res.end(out);
    return;
  }
  if (p === '/sb/auth/v1/token' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      if (USERS[body.email] && body.password === PASSWORD) return json(res, 200, session(body.email));
      return json(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    }
    if (grant === 'refresh_token') {
      const email = refreshTokens.get(body.refresh_token);
      if (!email) return json(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
      refreshTokens.delete(body.refresh_token);
      return json(res, 200, session(email));
    }
    return json(res, 400, { code: 400, error_code: 'unsupported_grant_type', msg: 'Unsupported grant type' });
  }
  if (p === '/sb/auth/v1/user') {
    const claims = verifyJwt(String(req.headers.authorization || '').replace(/^Bearer /, ''));
    if (!claims) return json(res, 401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
    return json(res, 200, user(claims.email));
  }
  if (p === '/sb/auth/v1/logout') {
    res.writeHead(204);
    res.end();
    return;
  }
  const file = path.join(DIST, p === '/' ? 'index.html' : decodeURIComponent(p));
  if (!file.startsWith(DIST)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}

http
  .createServer((req, res) => handle(req, res).catch((e) => { res.writeHead(500); res.end(String(e)); }))
  .listen(PORT, '127.0.0.1', () => console.log(`panel e2e server on http://127.0.0.1:${PORT}`));
