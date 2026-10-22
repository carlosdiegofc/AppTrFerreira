#!/usr/bin/env python3
"""Temporary: gathers where the tolls and the MTOP weigh stations of Uruguay are, to load them in GPS. TEMPORARY.

Runs on GitHub (this session cannot reach these sites). It saves, in the output folder:
- what the MTOP geoportal publishes (WFS capabilities, and as GeoJSON every layer about tolls or weighing);
- the toll booths, toll gantries and weigh stations mapped in OpenStreetMap (Overpass), grouped by place;
- the MTOP page about the toll stations;
- for every place found (and the 3 tolls already in the base), a satellite picture of about 300 m around it with the
  point marked, to check it by eye (Esri World Imagery, whose terms allow it to validate positions).

Usage: datos_mapa.py <output folder>.
"""
import io
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

out = Path(sys.argv[1])
(out / 'fotos').mkdir(parents=True, exist_ok=True)
log = open(out / 'registro.txt', 'w', encoding='utf-8')
AGENT = 'TransportesFerreira-panel/1.0 (datos de peajes y balanzas; github.com/carlosdiegofc/AppTrFerreira)'


def note(text: str) -> None:
    print(text, flush=True)
    log.write(text + '\n')
    log.flush()


def get(url: str, data: bytes | None = None, timeout: int = 90, headers: dict | None = None) -> bytes | None:
    request = urllib.request.Request(url, data=data, headers={'User-Agent': AGENT, **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read()
            note(f'OK {response.status} {len(body)} bytes {url[:160]}')
            return body
    except Exception as e:  # Each source is optional: what fails is written down and the rest goes on.
        note(f'FALLO {url[:160]}: {e}')
        return None


# ---------- MTOP geoportal ----------
pages = {
    'mtop-peajes.html': 'https://www.gub.uy/ministerio-transporte-obras-publicas/politicas-y-gestion/informacion-sobre-puestos-peaje',
    'mtop-geoservicios.html': 'https://geoportal.mtop.gub.uy/geoservicios',
    'mtop-geoservicios-en.html': 'https://geoportal.mtop.gub.uy/en/geoservicios',
}
for name, url in pages.items():
    body = get(url)
    if body:
        (out / name).write_bytes(body)

endpoints = set()
for name in ['mtop-geoservicios.html', 'mtop-geoservicios-en.html']:
    path = out / name
    if path.exists():
        text = path.read_text(errors='replace')
        for m in re.findall(r'https?://[^"\'<>\s]+', text):
            if re.search(r'wfs|wms|ows|geoserver|arcgis|mapserver', m, re.I):
                endpoints.add(m.split('?')[0])
endpoints.update([
    'https://geoservicios.mtop.gub.uy/geoserver/ows',
    'https://geoservicios.mtop.gub.uy/geoserver/wfs',
    'https://geoportal.mtop.gub.uy/geoserver/ows',
    'https://geoportal.mtop.gub.uy/geoserver/wfs',
])
(out / 'mtop-servicios-encontrados.txt').write_text('\n'.join(sorted(endpoints)))

layers = []
for base in sorted(endpoints):
    if 'wms' in base.lower() and 'wfs' not in base.lower() and 'ows' not in base.lower():
        continue
    caps = get(base + '?service=WFS&version=2.0.0&request=GetCapabilities')
    if not caps or b'FeatureType' not in caps:
        continue
    safe = re.sub(r'[^a-z0-9]+', '-', base.lower())[-60:]
    (out / f'wfs-{safe}.xml').write_bytes(caps)
    text = caps.decode('utf-8', 'replace')
    for block in re.findall(r'<(?:wfs:)?FeatureType>(.*?)</(?:wfs:)?FeatureType>', text, re.S):
        name = re.search(r'<(?:wfs:)?Name>(.*?)</(?:wfs:)?Name>', block)
        title = re.search(r'<(?:wfs:)?Title>(.*?)</(?:wfs:)?Title>', block)
        if name:
            layers.append((base, name.group(1), title.group(1) if title else ''))
(out / 'mtop-capas.txt').write_text('\n'.join(f'{b}\t{n}\t{t}' for b, n, t in layers))
wanted = [l for l in layers if re.search(r'peaj|pesa|balanz|bascul', l[1] + ' ' + l[2], re.I)]
mtop_points = []
for base, name, title in wanted:
    url = base + '?' + urllib.parse.urlencode({'service': 'WFS', 'version': '2.0.0', 'request': 'GetFeature', 'typeNames': name,
                                               'outputFormat': 'application/json', 'srsName': 'EPSG:4326'})
    body = get(url, timeout=180)
    if not body:
        continue
    safe = re.sub(r'[^A-Za-z0-9]+', '-', name)
    (out / f'mtop-{safe}.geojson').write_bytes(body)
    try:
        for f in json.loads(body).get('features', []):
            g = f.get('geometry') or {}
            if g.get('type') == 'Point':
                lng, lat = g['coordinates'][:2]
            elif g.get('type') == 'MultiPoint' and g['coordinates']:
                lng, lat = g['coordinates'][0][:2]
            else:
                continue
            # Some layers come in lat/lng order with EPSG:4326 in WFS 2.0.
            if abs(lng) < abs(lat):
                lat, lng = lng, lat
            mtop_points.append({'source': f'MTOP {name}', 'layer': title, 'lat': lat, 'lng': lng, 'props': f.get('properties', {})})
    except Exception as e:
        note(f'No se pudo leer {name}: {e}')

# ---------- OpenStreetMap ----------
query = '''[out:json][timeout:180];
area["ISO3166-1"="UY"][admin_level=2]->.uy;
(
  nwr["barrier"="toll_booth"](area.uy);
  nwr["highway"="toll_gantry"](area.uy);
  nwr["amenity"="weighbridge"](area.uy);
  nwr["man_made"="weighbridge"](area.uy);
  nwr["highway"="weigh_station"](area.uy);
  nwr["name"~"[Bb]alanza|[Pp]esaje|[Pp]eaje"](area.uy);
);
out center tags;'''
osm = None
for server in ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']:
    body = get(server, data=urllib.parse.urlencode({'data': query}).encode(), timeout=240)
    if body and body.lstrip().startswith(b'{'):
        osm = json.loads(body)
        (out / 'osm.json').write_bytes(body)
        break
osm_points = []
for e in (osm or {}).get('elements', []):
    lat = e.get('lat') or (e.get('center') or {}).get('lat')
    lng = e.get('lon') or (e.get('center') or {}).get('lon')
    if lat is None or lng is None:
        continue
    osm_points.append({'source': f"OSM {e['type']}/{e['id']}", 'lat': lat, 'lng': lng, 'tags': e.get('tags', {})})


def meters(a: dict, b: dict) -> float:
    k = math.pi / 180
    x = (b['lng'] - a['lng']) * k * math.cos((a['lat'] + b['lat']) / 2 * k)
    y = (b['lat'] - a['lat']) * k
    return math.hypot(x, y) * 6371000


# Booths of one plaza (one per lane or per way) become one place: their middle, and all their names.
groups: list[list[dict]] = []
for p in osm_points:
    for g in groups:
        if any(meters(p, q) < 350 for q in g):
            g.append(p)
            break
    else:
        groups.append([p])
places = []
for g in groups:
    lat = sum(p['lat'] for p in g) / len(g)
    lng = sum(p['lng'] for p in g) / len(g)
    names = sorted({p['tags'].get('name', '') for p in g} - {''})
    kinds = sorted({k + '=' + v for p in g for k, v in p['tags'].items() if k in ('barrier', 'highway', 'amenity', 'man_made')})
    places.append({'lat': lat, 'lng': lng, 'names': names, 'kinds': kinds, 'count': len(g), 'members': [p['source'] for p in g],
                   'tags': [p['tags'] for p in g]})

existing = [
    {'name': 'Base: Peaje Queguay', 'lat': -32.14554, 'lng': -57.93869},
    {'name': 'Base: Peaje Mercedes', 'lat': -33.211988, 'lng': -58.047956},
    {'name': 'Base: Peaje Mendoza', 'lat': -34.33482, 'lng': -56.24509},
]

# What each MTOP point has nearby in OpenStreetMap, and how far.
for p in mtop_points:
    near = min(places, key=lambda q: meters(p, q), default=None)
    p['osm_nearest_m'] = round(meters(p, near)) if near else None
    p['osm_nearest'] = {'lat': near['lat'], 'lng': near['lng'], 'names': near['names'], 'kinds': near['kinds']} if near else None
(out / 'resumen.json').write_text(json.dumps({'mtop': mtop_points, 'osm': places, 'base': existing}, ensure_ascii=False, indent=1))
note(f'MTOP: {len(mtop_points)} puntos en {len(wanted)} capas; OSM: {len(osm_points)} elementos en {len(places)} lugares')

# ---------- Satellite pictures to check by eye ----------
ZOOM = 18
tiles: dict[tuple[int, int], Image.Image | None] = {}


def tile(x: int, y: int) -> Image.Image | None:
    if (x, y) not in tiles:
        body = get(f'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{ZOOM}/{y}/{x}', timeout=60)
        tiles[(x, y)] = Image.open(io.BytesIO(body)).convert('RGB') if body else None
        time.sleep(0.05)
    return tiles[(x, y)]


def pixel(lat: float, lng: float) -> tuple[float, float]:
    n = 2 ** ZOOM
    x = (lng + 180) / 360 * n * 256
    s = math.sin(lat * math.pi / 180)
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n * 256
    return x, y


def picture(name: str, lat: float, lng: float, marks: list[tuple[float, float, str]], size: int = 512) -> None:
    cx, cy = pixel(lat, lng)
    left, top = int(cx - size / 2), int(cy - size / 2)
    img = Image.new('RGB', (size, size), (40, 40, 40))
    for tx in range(left // 256, (left + size) // 256 + 1):
        for ty in range(top // 256, (top + size) // 256 + 1):
            t = tile(tx, ty)
            if t:
                img.paste(t, (tx * 256 - left, ty * 256 - top))
    d = ImageDraw.Draw(img)
    for mlat, mlng, color in marks:
        x, y = pixel(mlat, mlng)
        x, y = x - left, y - top
        d.ellipse([x - 9, y - 9, x + 9, y + 9], outline=color, width=3)
        d.line([x - 16, y, x - 5, y], fill=color, width=2)
        d.line([x + 5, y, x + 16, y], fill=color, width=2)
        d.line([x, y - 16, x, y - 5], fill=color, width=2)
        d.line([x, y + 5, x, y + 16], fill=color, width=2)
    # 50 m scale bar at this latitude.
    mpp = 156543.03392 * math.cos(lat * math.pi / 180) / 2 ** ZOOM
    bar = 50 / mpp
    d.rectangle([10, size - 30, 10 + bar, size - 24], fill=(255, 255, 255))
    d.text((12, size - 22), '50 m', fill=(255, 255, 255))
    d.rectangle([0, 0, size, 22], fill=(0, 0, 0))
    d.text((6, 5), f'{name}  {lat:.6f}, {lng:.6f}', fill=(255, 255, 255))
    safe = re.sub(r'[^A-Za-z0-9]+', '-', name)[:80]
    img.save(out / 'fotos' / f'{safe}.jpg', quality=82)


for i, p in enumerate(mtop_points):
    label = ' '.join(str(v) for k, v in p['props'].items() if re.search(r'nom|name|ruta|km|depto|depar', k, re.I))[:60] or f'punto {i}'
    marks = [(p['lat'], p['lng'], '#ff2a2a')]
    if p.get('osm_nearest') and p['osm_nearest_m'] is not None and p['osm_nearest_m'] < 400:
        marks.append((p['osm_nearest']['lat'], p['osm_nearest']['lng'], '#2aa8ff'))
    picture(f'MTOP {i:02d} {label}', p['lat'], p['lng'], marks)
for i, q in enumerate(places):
    label = (q['names'][0] if q['names'] else ' '.join(q['kinds']))[:50]
    picture(f'OSM {i:02d} {label}', q['lat'], q['lng'], [(q['lat'], q['lng'], '#2aa8ff')])
for b in existing:
    picture(b['name'], b['lat'], b['lng'], [(b['lat'], b['lng'], '#ffd400')])
note('Listo.')
