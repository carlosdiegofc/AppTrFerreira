// Local stand-in for Supabase during the end-to-end tests (TEST ONLY):
//  /            → the panel's static files
//  /sb/rest/v1  → a real PostgREST connected to the local test database
//  /sb/auth/v1  → minimal password / refresh-token login issuing JWTs PostgREST accepts
//  /sb/storage  → signed photo links, checking storage.objects policies in the database
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const JWT_SECRET = process.env.JWT_SECRET || 'local-test-secret-for-trf-panel-0123456789';
const POSTGREST = process.env.POSTGREST_URL || 'http://127.0.0.1:3300';
export const PASSWORD = 'clave-de-prueba';
export const USERS = {
  'luis@trferreira.com': '11111111-1111-1111-1111-111111111111',
  'immer@trferreira.com': '22222222-2222-2222-2222-222222222222',
  'hugo@trferreira.com': '33333333-3333-3333-3333-333333333333',
};
const refreshTokens = new Map();
export const stats = { refreshes: 0, rest: 0 };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function signJwt(sub, email, ttl = 3600) {
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
function session(email, ttl) {
  const id = USERS[email];
  const refresh = crypto.randomUUID();
  refreshTokens.set(refresh, email);
  return { access_token: signJwt(id, email, ttl), token_type: 'bearer', expires_in: ttl, expires_at: Math.floor(Date.now() / 1000) + ttl, refresh_token: refresh, user: { id, email } };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
// 1×1 grey PNG used for map tiles and photos.
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN89+7dfwAJ6QPbJ1DSWgAAAABJRU5ErkJggg==', 'base64');

const readBody = (req) => new Promise((resolve) => { const parts = []; req.on('data', (c) => parts.push(c)); req.on('end', () => resolve(Buffer.concat(parts))); });
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

function canSeeObject(claims, bucket, name) {
  const sql = `select set_config('request.jwt.claims', $c$${JSON.stringify(claims)}$c$, true); set local role authenticated;
    select count(*) from storage.objects where bucket_id = $b$${bucket}$b$ and name = $n$${name}$n$;`;
  return new Promise((resolve) => {
    execFile('psql', ['-X', '-tA', '-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', process.env.PGDATABASE_TEST || 'trf', '-1', '-c', sql],
      (err, out) => resolve(!err && String(out).trim().split('\n').pop() === '1'));
  });
}

export const authTtl = { seconds: 3600 };

async function handle(req, res) {
  const url = new URL(req.url, 'http://local');
  const p = url.pathname;
  if (p.startsWith('/sb/rest/v1/')) {
    stats.rest++;
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
    const headers = {};
    for (const h of ['authorization', 'content-type', 'prefer', 'accept']) if (req.headers[h]) headers[h] = req.headers[h];
    const r = await fetch(POSTGREST + p.slice('/sb/rest/v1'.length) + url.search, { method: req.method, headers, body });
    const out = Buffer.from(await r.arrayBuffer());
    const resHeaders = { 'Content-Type': r.headers.get('content-type') || 'application/json' };
    if (r.headers.get('content-range')) resHeaders['Content-Range'] = r.headers.get('content-range');
    res.writeHead(r.status, resHeaders);
    res.end(out);
    return;
  }
  if (p === '/sb/auth/v1/token') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    if (url.searchParams.get('grant_type') === 'password') {
      if (USERS[body.email] && body.password === PASSWORD) return json(res, 200, session(body.email, authTtl.seconds));
      return json(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
    }
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      stats.refreshes++;
      const email = refreshTokens.get(body.refresh_token);
      if (!email) return json(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
      refreshTokens.delete(body.refresh_token);
      return json(res, 200, session(email, authTtl.seconds));
    }
    return json(res, 400, { error: 'unsupported_grant_type' });
  }
  if (p === '/sb/auth/v1/logout') { res.writeHead(204); res.end(); return; }
  const sign = /^\/sb\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/.exec(p);
  if (sign && req.method === 'POST') {
    const claims = verifyJwt(String(req.headers.authorization || '').replace(/^Bearer /, ''));
    const name = decodeURIComponent(sign[2]);
    if (!claims) return json(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'invalid jwt' });
    if (!(await canSeeObject(claims, sign[1], name))) return json(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    return json(res, 200, { signedURL: `/object/sign/${sign[1]}/${sign[2]}?token=test` });
  }
  if (p.startsWith('/sb/storage/v1/object/sign/')) { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(PNG); return; }
  const file = path.join(WEB, p === '/' ? 'index.html' : decodeURIComponent(p));
  if (!file.startsWith(WEB)) { res.writeHead(403); res.end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}

export function startServer(port = Number(process.env.PANEL_PORT || 8790)) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => handle(req, res).catch((e) => { res.writeHead(500); res.end(String(e)); }));
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().then(() => console.log('panel test server on http://127.0.0.1:' + (process.env.PANEL_PORT || 8790)));
}
