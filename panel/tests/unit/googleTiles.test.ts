import { describe, expect, it } from 'vitest';
import { keptSession, maxZoomAt, readSession, readViewport, SESSION_REQUEST, sessionUrl, tileUrl, viewportUrl } from '../../src/lib/googleTiles';

describe('vista satelital de Google (Map Tiles API)', () => {
  it('pide satélite con las rutas y los nombres, en español, desde Uruguay', () => {
    expect(SESSION_REQUEST).toEqual({ mapType: 'satellite', language: 'es-419', region: 'UY', layerTypes: ['layerRoadmap'] });
    expect(sessionUrl('a b')).toBe('https://tile.googleapis.com/v1/createSession?key=a%20b');
  });

  it('lee la sesión que devuelve Google: el vencimiento viene en segundos, como texto', () => {
    expect(readSession({ session: 'abc', expiry: '1700000000', tileWidth: 256 })).toEqual({ session: 'abc', expiry: 1_700_000_000_000 });
    expect(readSession({ session: 'abc', expiry: 1700000000 })).toEqual({ session: 'abc', expiry: 1_700_000_000_000 });
    expect(readSession({ session: '', expiry: '1' })).toBeNull();
    expect(readSession({ session: 'abc', expiry: 'pronto' })).toBeNull();
    expect(readSession({ error: { code: 403 } })).toBeNull();
    expect(readSession(null)).toBeNull();
  });

  it('usa la sesión guardada mientras le quede más de una hora', () => {
    const now = 1_700_000_000_000;
    const hour = 3_600_000;
    expect(keptSession({ session: 's', expiry: now + 2 * hour }, now)).toEqual({ session: 's', expiry: now + 2 * hour });
    expect(keptSession({ session: 's', expiry: now + hour - 1 }, now)).toBeNull();
    expect(keptSession({ session: 's', expiry: String(now + 2 * hour) }, now)).toBeNull();
    expect(keptSession('s', now)).toBeNull();
    expect(keptSession(null, now)).toBeNull();
  });

  it('arma las direcciones de las imágenes y de los créditos de lo que se ve', () => {
    expect(tileUrl('k&1', 's/2')).toBe('https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=s%2F2&key=k%261');
    expect(viewportUrl('k', 's', 12.4, { north: -34.1234567, south: -34.9, east: -55.5, west: -56.25 })).toBe(
      'https://tile.googleapis.com/tile/v1/viewport?session=s&key=k&zoom=12&north=-34.123457&south=-34.9&east=-55.5&west=-56.25',
    );
  });

  it('lee los créditos y hasta dónde llegan las fotos, y descarta lo que no entiende', () => {
    const v = readViewport({
      copyright: 'Imágenes ©2026 Maxar Technologies',
      maxZoomRects: [{ maxZoom: 19, north: 1, south: -1, east: 1, west: -1 }, { maxZoom: 'x' }, null],
    });
    expect(v).toEqual({ copyright: 'Imágenes ©2026 Maxar Technologies', maxZoomRects: [{ maxZoom: 19, north: 1, south: -1, east: 1, west: -1 }] });
    expect(readViewport({})).toEqual({ copyright: '', maxZoomRects: [] });
    expect(readViewport('nada')).toBeNull();
  });

  it('la foto más profunda que cubre un lugar, también si el rectángulo cruza el meridiano 180', () => {
    const rects = [
      { maxZoom: 15, north: 90, south: -90, east: 180, west: -180 },
      { maxZoom: 21, north: -34.8, south: -34.95, east: -56.0, west: -56.3 },
      { maxZoom: 18, north: 10, south: -10, east: -170, west: 170 },
    ];
    expect(maxZoomAt(rects, -34.9, -56.16, 19)).toBe(21);
    expect(maxZoomAt(rects, -32.3, -58.08, 19)).toBe(15);
    expect(maxZoomAt(rects, 0, 175, 19)).toBe(18);
    expect(maxZoomAt(rects, 0, -175, 19)).toBe(18);
    expect(maxZoomAt([], -34.9, -56.16, 19)).toBe(19);
  });
});
