#!/usr/bin/env python3
"""Screenshots of every screen of the app, in light and in dark, on an Android emulator. TEST ONLY.

The design of the app (decision of 28/10/2026, «vidrio») is approved from these screenshots. The debug APK opens each
screen with made-up data and no network (the sample view, MainActivity.sampleView): trf_sample says the account
(«driver» or «owner») and trf_sample_screen the screen. The sign-in is taken without an account. Each screen says in the
log that it is up (TRF-muestra) and, unless it changes every second, has to show its words; it fails if one does not, or
if the app closes by itself. The emulator starts without DNS anyway.

Usage: capturas_app.py <debug apk> <output folder>. The screenshots and the phone's log are left in the folder.
"""
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PKG = 'com.transportesferreira.app'
MAIN = PKG + '/uy.transportesferreira.gps.MainActivity'
# Each screen: its name in the screenshot, the account, the screen of the sample view and a text it has to show. The trip
# screens go last: their trip in progress would show on the start screens. Their clock changes every second, so the
# reader of screens (uiautomator) never finds them still: for them (None) the line of the log is enough.
SCREENS = [
    ('modo', 'driver', 'mode', '¿Qué modo querés usar?'),
    ('inicio', 'driver', 'home', 'Martín Pereira'),
    ('nuevo-viaje', 'driver', 'newtrip', 'Con carga'),
    ('elegir-camion', 'driver', 'pick', '¿Con qué camión salís?'),
    ('datos-del-viaje', 'driver', 'prepare', 'Datos del viaje'),
    ('combustible', 'driver', 'fuel', 'Foto de la boleta'),
    ('remito', 'driver', 'document', 'Agregar remito'),
    ('mis-viajes', 'driver', 'triphistory', 'Mis viajes'),
    ('mi-combustible', 'driver', 'fuelhistory', 'Mi combustible'),
    ('detalle-del-viaje', 'driver', 'tripdetail', 'Detalle del viaje'),
    ('documentos', 'driver', 'documents', 'Mis documentos'),
    ('mantenimiento', 'driver', 'maintenance', 'Cambio de aceite'),
    ('mi-cuenta', 'driver', 'settings', 'Mi cuenta'),
    ('juegos', 'driver', 'games', 'Ajedrez'),
    ('sencillo-inicio', 'driver', 'simplehome', 'INICIAR VIAJE'),
    ('sencillo-iniciar', 'driver', 'simpleask', '¿Iniciar el viaje?'),
    ('menu-del-dueno', 'owner', 'ownermenu', 'Toda la flota, desde tu cuenta'),
    ('flota-en-vivo', 'owner', 'owner', 'Flota en vivo'),
    ('rendimiento', 'owner', 'performance', 'Rendimiento'),
    ('viaje-activo', 'driver', 'trip', None),
    ('finalizar-viaje', 'driver', 'tripfinish', None),
    ('sencillo-viaje', 'driver', 'simpletrip', None),
    ('sencillo-finalizar', 'driver', 'simplefinish', None),
]

apk, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)


def adb(*args: str, check: bool = True, timeout: int = 60) -> subprocess.CompletedProcess:
    # The phone's log can carry bytes that are not UTF-8.
    result = subprocess.run(['adb', *args], capture_output=True, text=True, errors='replace', timeout=timeout)
    if check and result.returncode != 0:
        raise SystemExit(f'adb {" ".join(args)} falló: {result.stdout}{result.stderr}')
    return result


def step(text: str) -> None:
    print(f'--- {text}', flush=True)


def fail(why: str) -> None:
    raise SystemExit(f'Las capturas de la app fallaron: {why}.')


def running() -> bool:
    return bool(adb('shell', 'pidof', PKG, check=False).stdout.split())


def screen() -> ET.Element | None:
    adb('shell', 'rm', '-f', '/sdcard/ui.xml', check=False)
    adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml', check=False, timeout=30)
    xml = adb('shell', 'cat', '/sdcard/ui.xml', check=False).stdout
    if '<hierarchy' not in xml:
        return None
    try:
        return ET.fromstring(xml[xml.index('<hierarchy'):xml.rindex('>') + 1].encode())
    except ET.ParseError:
        return None


def shows(root: ET.Element, text: str) -> bool:
    return any(n.get('package') == PKG and n.get('text') == text for n in root.iter('node'))


def wait(what: str, text: str, seconds: int = 40) -> None:
    end = time.time() + seconds
    while time.time() < end:
        root = screen()
        if root is not None and shows(root, text):
            return
        if not running():
            fail(f'la app se cerró mientras se esperaba {what}')
        time.sleep(1)
    fail(f'no apareció {what} («{text}»)')


def ready(what: str, tag: str, seconds: int = 40) -> None:
    """Waits for the line the sample view writes in the log once the screen of that tag is up."""
    end = time.time() + seconds
    while time.time() < end:
        if f'lista {tag}.' in adb('logcat', '-d', '-s', 'TRF-muestra:I', check=False, timeout=60).stdout:
            return
        if not running():
            fail(f'la app se cerró mientras se esperaba {what}')
        time.sleep(1)
    fail(f'no apareció {what}')


def shot(name: str) -> None:
    image = subprocess.run(['adb', 'exec-out', 'screencap', '-p'], capture_output=True, timeout=30).stdout
    (out / f'{name}.png').write_bytes(image)


def open_screen(extras: list[str]) -> None:
    adb('shell', 'am', 'force-stop', PKG)
    adb('shell', 'am', 'start', '-W', '-n', MAIN, *extras, timeout=120)


def check_log() -> None:
    log = adb('logcat', '-d', '-b', 'all', '-v', 'threadtime', check=False, timeout=120).stdout
    (out / 'logcat.txt').write_text(log)
    crashes = adb('logcat', '-d', '-b', 'crash', check=False).stdout
    problems = []
    if PKG in crashes:
        problems.append('la app se cerró sola')
    if f'ANR in {PKG}' in log:
        problems.append('la app dejó de responder')
    if problems:
        fail('; '.join(problems) + ' (ver logcat.txt)')


try:
    step('Instalar la versión de prueba')
    adb('install', '-r', str(apk), timeout=240)
    adb('logcat', '-c', check=False)
    for theme, night in (('claro', 'no'), ('oscuro', 'yes')):
        step(f'Pantallas en modo {theme}')
        # Each pass starts with the phone clean: no account, no trip, no data.
        adb('shell', 'pm', 'clear', PKG)
        adb('shell', 'cmd', 'uimode', 'night', night, check=False)
        time.sleep(2)
        open_screen([])
        wait('el ingreso', 'Tu viaje empieza acá.')
        time.sleep(1.5)
        shot(f'{theme}-00-ingreso')
        for i, (name, who, see, text) in enumerate(SCREENS, start=1):
            step(f'{name} ({theme})')
            tag = f'{theme}-{i}'
            open_screen(['--es', 'trf_sample', who, '--es', 'trf_sample_screen', see, '--es', 'trf_sample_tag', tag])
            ready(name, tag)
            if text is not None:
                wait(name, text)
            elif not running():
                fail(f'la app se cerró en {name}')
            # The photo of the room fades in and the screen settles.
            time.sleep(1.5)
            shot(f'{theme}-{i:02d}-{name}')
    adb('shell', 'cmd', 'uimode', 'night', 'no', check=False)
    step('Revisar el registro del teléfono')
    check_log()
    print(f'Listas las capturas de {len(SCREENS) + 1} pantallas, en claro y en oscuro.', flush=True)
except BaseException:
    try:
        shot('capturas-falla')
        if not (out / 'logcat.txt').exists():
            (out / 'logcat.txt').write_text(adb('logcat', '-d', '-b', 'all', '-v', 'threadtime', check=False, timeout=120).stdout)
    except Exception as e:  # The failure itself matters more than its screenshot.
        print(f'No se pudo guardar la captura o el registro: {e}', flush=True)
    raise
