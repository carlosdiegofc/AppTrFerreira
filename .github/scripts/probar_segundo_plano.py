#!/usr/bin/env python3
"""The GPS of a trip with the app in the background, with the phone locked and after the system kills the app. TEST ONLY.

The owner reported on 30/10/2026 that the GPS stops when the app goes to the background or the phone is locked: at
110 km/h the route had no readings for 17 minutes, and they came back when the app was opened. The debug APK opens a
trip with made-up data (MainActivity.sampleView) and the emulator's GPS moves at 108 km/h (adb emu geo fix). Each phase
checks that the trip's last reading keeps moving forward: the app in front, in the background, the phone locked, and
the app's process killed as a phone short of memory or battery does, which Android then starts again by itself.
It fails if the trip stops reading in any of them.

Usage: probar_segundo_plano.py <debug apk> <output folder>. The phone's log is left in the folder.
"""
import json
import subprocess
import sys
import threading
import time
from pathlib import Path

PKG = 'com.transportesferreira.app'
MAIN = PKG + '/uy.transportesferreira.gps.MainActivity'

apk, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)


def adb(*args: str, check: bool = True, timeout: int = 60) -> subprocess.CompletedProcess:
    result = subprocess.run(['adb', *args], capture_output=True, text=True, errors='replace', timeout=timeout)
    if check and result.returncode != 0:
        raise SystemExit(f'adb {" ".join(args)} falló: {result.stdout}{result.stderr}')
    return result


def pid() -> str:
    return adb('shell', 'pidof', PKG, check=False).stdout.strip()


def trip() -> dict:
    """The trip in progress as the phone keeps it."""
    names = adb('shell', 'run-as', PKG, 'ls', 'files/trips', check=False).stdout.split()
    for name in names:
        text = adb('shell', 'run-as', PKG, 'cat', f'files/trips/{name}', check=False).stdout
        try:
            t = json.loads(text)
        except json.JSONDecodeError:
            continue
        if t.get('active'):
            return t
    return {}


def last() -> str:
    return (trip().get('last_point') or {}).get('recorded_at', '')


# The emulator's GPS goes east along a straight line at 30 m/s (108 km/h), one fix every 2 seconds.
moving = threading.Event()
moving.set()


def drive() -> None:
    lat, lng = -34.50, -56.30
    while moving.is_set():
        lng += 60 / 92000  # About 60 m at this latitude, every 2 seconds.
        subprocess.run(['adb', 'emu', 'geo', 'fix', f'{lng:.6f}', f'{lat:.6f}'], capture_output=True, timeout=30)
        time.sleep(2)


def phase(name: str, seconds: int) -> bool:
    """Does the trip's last reading move forward during this phase?"""
    before = last()
    time.sleep(seconds)
    after = last()
    ok = bool(after) and after != before
    alive = pid()
    print(f'{"bien" if ok else "FALLA"} {name}: última lectura {before or "—"} → {after or "—"} · proceso {alive or "no está"}', flush=True)
    return ok


results = {}
feeder = threading.Thread(target=drive, daemon=True)
try:
    print('--- Instalar la versión de prueba', flush=True)
    adb('install', '-r', str(apk), timeout=240)
    adb('shell', 'pm', 'clear', PKG)
    for permission in ('ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'POST_NOTIFICATIONS'):
        adb('shell', 'pm', 'grant', PKG, f'android.permission.{permission}', check=False)
    adb('shell', 'settings', 'put', 'secure', 'location_mode', '3', check=False)
    adb('logcat', '-c', check=False)
    feeder.start()
    time.sleep(4)
    adb('shell', 'am', 'start', '-n', MAIN, '--es', 'trf_sample', 'driver', '--es', 'trf_sample_screen', 'tripgps', '--es', 'trf_sample_tag', 'segundo-plano', timeout=60)
    time.sleep(15)
    print('--- La app adelante', flush=True)
    results['adelante'] = phase('la app adelante', 30)
    print('--- La app en segundo plano', flush=True)
    adb('shell', 'input', 'keyevent', 'KEYCODE_HOME')
    results['segundo plano'] = phase('la app en segundo plano', 60)
    print('--- El teléfono bloqueado', flush=True)
    adb('shell', 'input', 'keyevent', 'KEYCODE_SLEEP')
    results['bloqueado'] = phase('el teléfono bloqueado', 60)
    adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP')
    adb('shell', 'wm', 'dismiss-keyguard', check=False)
    print('--- El sistema cierra la app (falta de memoria o batería) y la vuelve a abrir solo', flush=True)
    before_kill = pid()
    adb('shell', 'run-as', PKG, 'kill', '-9', before_kill, check=False)
    time.sleep(3)
    print(f'proceso antes {before_kill or "—"}, después {pid() or "no está"}', flush=True)
    results['después de cerrarla el sistema'] = phase('después de que el sistema cerró la app', 120)
    services = adb('shell', 'dumpsys', 'activity', 'services', PKG, check=False).stdout
    print('\n'.join(l for l in services.splitlines() if 'GpsService' in l or 'isForeground' in l or 'foregroundServiceType' in l)[:3000], flush=True)
    notes = adb('shell', 'dumpsys', 'notification', '--noredact', check=False).stdout
    print('\n'.join(l.strip() for l in notes.splitlines() if 'android.title=' in l or 'android.text=' in l)[-1500:], flush=True)
finally:
    moving.clear()
    log = adb('logcat', '-d', '-v', 'threadtime', check=False, timeout=120).stdout
    (out / 'logcat.txt').write_text(log)
    print('\n'.join(l for l in log.splitlines() if 'GpsService' in l or 'ForegroundService' in l or ('location' in l.lower() and PKG in l))[-40:], flush=True)
    adb('shell', 'am', 'force-stop', PKG, check=False)
print('Resultado: ' + ', '.join(f'{k} {"bien" if v else "FALLA"}' for k, v in results.items()), flush=True)
# On 30/10/2026 the four phases went well on the emulator: the cut came from the owner's phone putting the app to sleep.
# From then on the test keeps it that way.
if len(results) < 4 or not all(results.values()):
    raise SystemExit('El GPS del viaje dejó de registrar en alguna de las fases.')
