#!/usr/bin/env python3
"""Finishing a trip on an Android emulator: the app must stay open and go back to its start screen. TEST ONLY.

A driver reported on 29/10/2026 that finishing a trip closed the app. The debug APK opens a trip with made-up data (the
sample view, MainActivity.sampleView) and ends it a few seconds later the same way the finish button does (GpsService
FINISH), with the location permission granted so the GPS service runs as on a phone. Three cases: a driver in normal
mode, a driver in simple mode and the owner on a trip (his map also shows the fleet). It fails if the app closes by itself,
and then prints the error from the phone's log.

Usage: probar_finalizar.py <debug apk> <output folder>. Screenshots and the phone's log are left in the folder.
"""
import subprocess
import sys
import time
from pathlib import Path

PKG = 'com.transportesferreira.app'
MAIN = PKG + '/uy.transportesferreira.gps.MainActivity'
CASES = [
    ('chofer-normal', 'driver', 'tripend'),
    ('chofer-sencillo', 'driver', 'simpletripend'),
    ('dueno-de-viaje', 'owner', 'tripend'),
]

apk, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)


def adb(*args: str, check: bool = True, timeout: int = 60) -> subprocess.CompletedProcess:
    result = subprocess.run(['adb', *args], capture_output=True, text=True, errors='replace', timeout=timeout)
    if check and result.returncode != 0:
        raise SystemExit(f'adb {" ".join(args)} falló: {result.stdout}{result.stderr}')
    return result


def running() -> bool:
    return bool(adb('shell', 'pidof', PKG, check=False).stdout.split())


def shot(name: str) -> None:
    (out / f'{name}.png').write_bytes(subprocess.run(['adb', 'exec-out', 'screencap', '-p'], capture_output=True, timeout=30).stdout)


def crashes() -> str:
    return adb('logcat', '-d', '-b', 'crash', check=False).stdout


def ready(tag: str, seconds: int = 40) -> None:
    end = time.time() + seconds
    while time.time() < end:
        if f'lista {tag}.' in adb('logcat', '-d', '-s', 'TRF-muestra:I', check=False, timeout=60).stdout:
            return
        if not running():
            break
        time.sleep(1)
    raise SystemExit(f'No se abrió el viaje de muestra ({tag}).\n{crashes()}')


failed = []
try:
    print('--- Instalar la versión de prueba', flush=True)
    adb('install', '-r', str(apk), timeout=240)
    for name, who, see in CASES:
        print(f'--- {name}', flush=True)
        adb('shell', 'pm', 'clear', PKG)
        for permission in ('ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'POST_NOTIFICATIONS'):
            adb('shell', 'pm', 'grant', PKG, f'android.permission.{permission}', check=False)
        adb('logcat', '-c', check=False)
        adb('logcat', '-b', 'crash', '-c', check=False)
        adb('shell', 'am', 'start', '-W', '-n', MAIN, '--es', 'trf_sample', who, '--es', 'trf_sample_screen', see, '--es', 'trf_sample_tag', name, timeout=120)
        ready(name)
        time.sleep(2)
        shot(f'{name}-1-viaje')
        # The trip ends 4 seconds after it opens; the screen checks every second and goes back to the start.
        time.sleep(12)
        shot(f'{name}-2-despues')
        log = crashes()
        if not running() or PKG in log:
            failed.append(f'{name}: la app se cerró al finalizar el viaje.\n{log}')
            print(f'FALLA {name}', flush=True)
        else:
            print(f'bien {name}: la app sigue abierta', flush=True)
        (out / f'{name}-logcat.txt').write_text(adb('logcat', '-d', '-b', 'all', '-v', 'threadtime', check=False, timeout=120).stdout)
finally:
    adb('shell', 'am', 'force-stop', PKG, check=False)
if failed:
    raise SystemExit('Finalizar el viaje falló:\n\n' + '\n\n'.join(failed))
print('Finalizar el viaje: la app siguió abierta en los tres casos.', flush=True)
