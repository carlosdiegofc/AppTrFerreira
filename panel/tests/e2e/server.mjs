// Local stand-in for Supabase during the end-to-end tests (TEST ONLY):
//  /            → the panel built for the tests (dist-e2e)
//  /sb/rest/v1  → a real PostgREST connected to the local test database
//  /sb/auth/v1  → password and refresh-token sign-in issuing JWTs that PostgREST accepts
//  /sb/storage/v1/object/sign → signed links to the invented photos and files of tests/e2e/db/seed.sql and to the uploaded ones
//  /sb/storage/v1/object/trf-fuel-receipts/… → uploads of receipt photos, with the folder rule of the storage
//  /sb/storage/v1/object/trf-documents… → uploads and deletes of the files of papers (photo or PDF), for the panel accounts
//  /sb/storage/v1/object/trf-fleet-photos/… → uploads of the photos of trucks and trailers, for the panel accounts
//  /sb/storage/v1/object/trf-expense-files/… → uploads of the invoices of expenses (photo or PDF), for the panel accounts
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
  'admin@ejemplo.uy': { id: '00000000-0000-4000-8000-000000000003', name: 'Administración' },
  'chofer1@ejemplo.uy': { id: '00000000-0000-4000-8000-000000000011', name: 'Ana Pereira' },
};
const refreshTokens = new Map();
// The photos the seed points to, and who may open them: like the storage rule trf_panel_admin_read_photos, the
// accounts of the panel list.
const TRIP_A = '00000000-0000-4000-8000-000000000011/10000000-0000-4000-8000-00000000000a';
const PHOTOS = {
  'trf-trip-documents': [`${TRIP_A}/30000000-0000-4000-8000-000000000001.jpg`],
  'trf-fuel-receipts': [`${TRIP_A}/40000000-0000-4000-8000-000000000001.jpg`, '00000000-0000-4000-8000-000000000014/standalone/40000000-0000-4000-8000-000000000002.jpg'],
  'trf-documents': [
    '50000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001.jpg',
    '50000000-0000-4000-8000-000000000002/60000000-0000-4000-8000-000000000002.pdf',
    '50000000-0000-4000-8000-000000000004/60000000-0000-4000-8000-000000000004.jpg',
  ],
  'trf-fleet-photos': ['a0000000-0000-4000-8000-000000000001/a1000000-0000-4000-8000-000000000001.jpg'],
  'trf-expense-files': ['b0000000-0000-4000-8000-000000000001/b1000000-0000-4000-8000-000000000001.jpg'],
};
// Photos and files uploaded during the tests, and files of papers deleted, as "bucket/path".
const UPLOADED = new Set();
const DELETED = new Set();
// The smallest PDF a browser opens: what a signed link to a paper's PDF hands out.
const PDF = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';
const PHOTO_READERS = new Set([USERS['dueno@ejemplo.uy'].id, USERS['lectura@ejemplo.uy'].id]);
const photoToken = (object) => crypto.createHmac('sha256', JWT_SECRET).update('photo:' + object).digest('base64url');
const photoSvg = (title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420" viewBox="0 0 600 420"><rect width="600" height="420" fill="#f4f1e8"/><rect x="40" y="40" width="520" height="340" fill="#fff" stroke="#c9c2ad" stroke-width="3"/><text x="300" y="200" text-anchor="middle" font-family="sans-serif" font-size="30" fill="#4f5d73">${title}</text><text x="300" y="245" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#9aa5b6">Foto de prueba</text></svg>`;

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
  if (p.startsWith('/sb/storage/v1/object/sign/')) {
    const object = decodeURIComponent(p.slice('/sb/storage/v1/object/sign/'.length));
    const [bucket, ...rest] = object.split('/');
    const known = ((PHOTOS[bucket] ?? []).includes(rest.join('/')) || UPLOADED.has(object)) && !DELETED.has(object);
    if (req.method === 'POST') {
      const claims = verifyJwt(String(req.headers.authorization || '').replace(/^Bearer /, ''));
      if (!claims || !PHOTO_READERS.has(claims.sub) || !known) return json(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      return json(res, 200, { signedURL: `/object/sign/${object}?token=${photoToken(object)}` });
    }
    if (!known || url.searchParams.get('token') !== photoToken(object)) return json(res, 400, { statusCode: '400', error: 'InvalidJWT', message: 'invalid signature' });
    if (object.endsWith('.pdf')) {
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      res.end(PDF);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    res.end(photoSvg(bucket === 'trf-fuel-receipts' ? 'Boleta de combustible' : bucket === 'trf-documents' ? 'Documento' : bucket === 'trf-fleet-photos' ? 'Camión' : bucket === 'trf-expense-files' ? 'Factura' : 'Remito'));
    return;
  }
  if (p.startsWith('/sb/storage/v1/object/trf-documents/') && req.method === 'POST') {
    // Like the storage rule trf_documents_files_insert: the accounts that manage the fleet upload a photo (JPEG) or a
    // PDF into the folder of the paper. A second upload of the same file is a duplicate.
    const object = decodeURIComponent(p.slice('/sb/storage/v1/object/'.length));
    const name = object.slice('trf-documents/'.length);
    const claims = verifyJwt(String(req.headers.authorization || '').replace(/^Bearer /, ''));
    const body = (await readBody(req)).toString('latin1');
    if (!claims) return json(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'invalid JWT' });
    if (!PHOTO_READERS.has(claims.sub)) return json(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    const type = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|pdf)$/.exec(name)?.[1];
    if (!type) return json(res, 400, { statusCode: '400', error: 'InvalidKey', message: 'Invalid key' });
    const mime = type === 'pdf' ? 'application/pdf' : 'image/jpeg';
    if (!new RegExp(`content-type: ${mime.replace('/', '\\/')}`, 'i').test(body) && req.headers['content-type'] !== mime) return json(res, 400, { statusCode: '415', error: 'invalid_mime_type', message: 'mime type not supported' });
    if (UPLOADED.has(object)) return json(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
    UPLOADED.add(object);
    DELETED.delete(object);
    return json(res, 200, { Key: object, Id: crypto.randomUUID() });
  }
  if (p === '/sb/storage/v1/object/trf-documents' && req.method === 'DELETE') {
    // Like the storage rule trf_documents_files_delete: the accounts that manage the fleet delete; the answer lists
    // what was deleted.
    const claims = verifyJwt(String(req.headers.authorization || '').replace(/^Bearer /, ''));
    const { prefixes = [] } = JSON.parse((await readBody(req)).toString() || '{}');
    if (!claims) return json(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'invalid JWT' });
    const gone = [];
    for (const name of PHOTO_READERS.has(claims.sub) ? prefixes : []) {
      const object = 'trf-documents/' + name;
      if (DELETED.has(object) || !(PHOTOS['trf-documents'].includes(name) || UPLOADED.has(object))) continue;
      UPLOADED.delete(object);
      DELETED.add(object);
      gone.push({ name, bucket_id: 'trf-documents' });
    }
    return json(res, 200, gone);
  }
  if (p.startsWith('/sb/storage/v1/object/trf-expense-files/') && req.method === 'POST') {
    // Like the storage rule trf_expense_files_insert: the panel accounts upload a photo (JPEG) or a PDF; the panel puts it
    // in the folder of its expense. Nobody deletes one, and a second upload of the same file is a duplicate.
    const object = decodeURIComponent(p.slice('/sb/storage/v1/object/'.length));
    const name = object.slice('trf-expense-files/'.length);
    const claims = verifyJwt(String(req.headers.authorization || '').replace(/^Bearer /, ''));
    const body = (await readBody(req)).toString('latin1');
    if (!claims) return json(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'invalid JWT' });
    if (!PHOTO_READERS.has(claims.sub)) return json(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    const type = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|pdf)$/.exec(name)?.[1];
    if (!type) return json(res, 400, { statusCode: '400', error: 'InvalidKey', message: 'Invalid key' });
    const mime = type === 'pdf' ? 'application/pdf' : 'image/jpeg';
    if (!new RegExp(`content-type: ${mime.replace('/', '\\/')}`, 'i').test(body) && req.headers['content-type'] !== mime) return json(res, 400, { statusCode: '415', error: 'invalid_mime_type', message: 'mime type not supported' });
    if (UPLOADED.has(object)) return json(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
    UPLOADED.add(object);
    return json(res, 200, { Key: object, Id: crypto.randomUUID() });
  }
  if (p.startsWith('/sb/storage/v1/object/trf-fleet-photos/') && req.method === 'POST') {
    // Like the storage rule trf_fleet_photos_insert: the panel accounts upload a photo (JPEG) into the folder of a card. A
    // second upload of the same photo is a duplicate.
    const object = decodeURIComponent(p.slice('/sb/storage/v1/object/'.length));
    const name = object.slice('trf-fleet-photos/'.length);
    const claims = verifyJwt(String(req.headers.authorization || '').replace(/^Bearer /, ''));
    const body = (await readBody(req)).toString('latin1');
    if (!claims) return json(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'invalid JWT' });
    if (!PHOTO_READERS.has(claims.sub)) return json(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(name)) return json(res, 400, { statusCode: '400', error: 'InvalidKey', message: 'Invalid key' });
    if (!/content-type: image\/jpeg/i.test(body) && req.headers['content-type'] !== 'image/jpeg') return json(res, 400, { statusCode: '415', error: 'invalid_mime_type', message: 'mime type not supported' });
    if (UPLOADED.has(object)) return json(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
    UPLOADED.add(object);
    return json(res, 200, { Key: object, Id: crypto.randomUUID() });
  }
  if (p.startsWith('/sb/storage/v1/object/trf-fuel-receipts/') && req.method === 'POST') {
    // Like the storage rule fuel_photos_insert: a signed-in account uploads into its own folder, out of a trip
    // ("standalone"); the bucket takes JPEG only. A second upload of the same photo is a duplicate.
    const object = decodeURIComponent(p.slice('/sb/storage/v1/object/'.length));
    const [, owner, folder, file] = object.split('/');
    const claims = verifyJwt(String(req.headers.authorization || '').replace(/^Bearer /, ''));
    const body = (await readBody(req)).toString('latin1');
    if (!claims) return json(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'invalid JWT' });
    if (owner !== claims.sub || folder !== 'standalone' || !/^[0-9a-f-]{36}\.jpg$/.test(file ?? '')) return json(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    if (!/content-type: image\/jpeg/i.test(body) && req.headers['content-type'] !== 'image/jpeg') return json(res, 400, { statusCode: '415', error: 'invalid_mime_type', message: 'mime type not supported' });
    if (UPLOADED.has(object)) return json(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
    UPLOADED.add(object);
    return json(res, 200, { Key: object, Id: crypto.randomUUID() });
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
