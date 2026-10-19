#!/usr/bin/env python3
"""Smoke test of the Google Play build (R8: optimized and obfuscated) on an Android emulator. TEST ONLY.

Installs the release APK, which carries the same optimized code and resources as the .aab, and goes through what works
without an account: the sign-in screen, the privacy policy (read from the app's files), turning the screen, a sign-in
without connection (it must say that it could not sign in) and opening the app again. It fails if the app closes by
itself or if the phone's log shows something R8 left out or renamed. The emulator starts without DNS and the test checks
it before signing in, so it never reaches the real database. The trip with GPS, the photos and the sync need a real
account: they are tested on a phone before launching the version (docs/google-play/GUIA.md).

Usage: probar_app_optimizada.py <apk> <output folder>. Screenshots and the phone's log are left in the folder.
"""
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PKG = 'com.transportesferreira.app'
MAIN = PKG + '/uy.transportesferreira.gps.MainActivity'
# What a shrinker that left out or renamed something looked up by name looks like at run time.
R8_ERRORS = re.compile(
    r'ClassNotFoundException|NoClassDefFoundError|NoSuchMethodError|NoSuchMethodException|NoSuchFieldError|'
    r'NoSuchFieldException|AbstractMethodError|IncompatibleClassChangeError|VerifyError|Resources\$NotFoundException'
)

apk, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
# Every process the app had during the test, to read only its lines of the log.
pids: set[str] = set()


def adb(*args: str, check: bool = True, timeout: int = 60) -> subprocess.CompletedProcess:
    result = subprocess.run(['adb', *args], capture_output=True, text=True, timeout=timeout)
    if check and result.returncode != 0:
        raise SystemExit(f'adb {" ".join(args)} falló: {result.stdout}{result.stderr}')
    return result


def step(text: str) -> None:
    print(f'--- {text}', flush=True)


def running() -> bool:
    found = adb('shell', 'pidof', PKG, check=False).stdout.split()
    pids.update(found)
    return bool(found)


def screen() -> ET.Element | None:
    """The views on screen as uiautomator sees them; None while it cannot read them (the screen is changing)."""
    adb('shell', 'rm', '-f', '/sdcard/ui.xml', check=False)
    adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml', check=False, timeout=30)
    xml = adb('shell', 'cat', '/sdcard/ui.xml', check=False).stdout
    if '<hierarchy' not in xml:
        return None
    try:
        return ET.fromstring(xml[xml.index('<hierarchy'):xml.rindex('>') + 1].encode())
    except ET.ParseError:
        return None


def nodes(root: ET.Element, text: str | None = None, part: str | None = None, desc: str | None = None, cls: str | None = None) -> list[ET.Element]:
    """The app's views with that text (whole or part of it), description or class. A dialog of the system does not count."""
    found = []
    for n in root.iter('node'):
        if n.get('package') != PKG:
            continue
        if text is not None and n.get('text') != text:
            continue
        if part is not None and part not in (n.get('text') or ''):
            continue
        if desc is not None and n.get('content-desc') != desc:
            continue
        if cls is not None and n.get('class') != cls:
            continue
        found.append(n)
    return found


def shot(name: str) -> None:
    image = subprocess.run(['adb', 'exec-out', 'screencap', '-p'], capture_output=True, timeout=30).stdout
    (out / f'{name}.png').write_bytes(image)


def fail(why: str) -> None:
    raise SystemExit(f'La prueba falló: {why}.')


def wait(what: str, found, seconds: int = 30):
    """Waits until found(screen) gives something and returns it; fails if the app closes or it does not show up."""
    end = time.time() + seconds
    while time.time() < end:
        alive = running()
        root = screen()
        hit = found(root) if root is not None else None
        if hit:
            return hit
        if not alive:
            fail(f'la app se cerró mientras se esperaba {what}')
        time.sleep(1)
    fail(f'no apareció {what}')


def tap(node: ET.Element) -> None:
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds', '')))
    adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))


def sign_in_screen(root: ET.Element):
    return nodes(root, text='Ingresar')


def sign_in_fields(root: ET.Element):
    fields = nodes(root, cls='android.widget.EditText')
    return fields if len(fields) >= 2 else None


def check_log() -> None:
    """The phone's log: the app never closed by itself, hung or missed something R8 left out."""
    log = adb('logcat', '-d', '-b', 'all', '-v', 'threadtime', check=False, timeout=120).stdout
    (out / 'logcat.txt').write_text(log)
    crashes = adb('logcat', '-d', '-b', 'crash', check=False).stdout
    pids.update(re.findall(rf'Start proc (\d+):{re.escape(PKG)}[/:]', log))
    problems = []
    if PKG in crashes:
        problems.append('la app se cerró sola')
    if f'ANR in {PKG}' in log:
        problems.append('la app dejó de responder')
    # threadtime: date, time, pid, tid, level, tag: message.
    ours = [line for line in log.splitlines() if len(line.split()) > 2 and line.split()[2] in pids]
    missing = [line for line in ours if R8_ERRORS.search(line)]
    if missing:
        problems.append('faltan clases, métodos o recursos:\n' + '\n'.join(missing[:20]))
    if problems:
        fail('; '.join(problems) + ' (ver logcat.txt)')


try:
    step('Instalar la versión optimizada')
    adb('install', '-r', str(apk), timeout=240)
    adb('logcat', '-b', 'all', '-c', check=False)

    step('Abrir la app: tiene que aparecer el ingreso')
    adb('shell', 'am', 'start', '-W', '-n', MAIN, timeout=120)
    wait('la pantalla de ingreso', sign_in_screen, seconds=60)
    shot('1-ingreso')

    step('Política de privacidad: sale de los archivos de la app')
    tap(wait('el enlace a la política de privacidad', lambda r: nodes(r, text='Política de privacidad'))[0])
    wait('el texto de la política de privacidad', lambda r: nodes(r, part='Última actualización'))
    shot('2-privacidad')
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK')
    wait('el ingreso al volver de la política', sign_in_screen)

    step('Girar la pantalla: la app se vuelve a armar en el ingreso')
    adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0')
    adb('shell', 'settings', 'put', 'system', 'user_rotation', '1')
    wait('el ingreso con la pantalla girada', lambda r: r.get('rotation') == '1' and nodes(r, desc='TR Ferreira'))
    shot('3-girada')
    adb('shell', 'settings', 'put', 'system', 'user_rotation', '0')
    wait('el ingreso con la pantalla derecha', lambda r: r.get('rotation') == '0' and sign_in_screen(r))

    step('Ingreso sin conexión: tiene que avisar que no se pudo ingresar')
    # The emulator starts without DNS (-dns-server 127.0.0.1): the sign-in must not reach the real database.
    adb('shell', 'svc', 'wifi', 'disable', check=False)
    adb('shell', 'svc', 'data', 'disable', check=False)
    ping = adb('shell', 'ping', '-c', '1', '-W', '2', 'supabase.co', check=False)
    said = (ping.stdout + ping.stderr).lower()
    if re.search(r'\(\d+\.\d+\.\d+\.\d+\)', said) or 'unknown host' not in said:
        fail('el emulador todavía resuelve nombres de internet, y el ingreso de prueba podría llegar a la base real')
    # Without a soft keyboard the button stays on screen; adb types into the field anyway.
    for ime in adb('shell', 'ime', 'list', '-s', check=False).stdout.split():
        adb('shell', 'ime', 'disable', ime, check=False)
    fields = wait('los campos de correo y contraseña', sign_in_fields)
    tap(fields[0])
    adb('shell', 'input', 'text', 'prueba@example.com')
    tap(fields[1])
    adb('shell', 'input', 'text', 'clave-de-prueba')
    wait('el correo escrito en su campo', lambda r: nodes(r, text='prueba@example.com'))
    if 'mInputShown=true' in adb('shell', 'dumpsys', 'input_method', check=False).stdout:
        adb('shell', 'input', 'keyevent', 'KEYCODE_BACK')
        time.sleep(1)
    tap(wait('el botón Ingresar', sign_in_screen)[0])
    wait('el aviso de que no se pudo ingresar', lambda r: nodes(r, part='No se pudo ingresar'), seconds=90)
    shot('4-ingreso-sin-conexion')

    step('Volver a abrir la app, desde el inicio del teléfono y de cero')
    adb('shell', 'input', 'keyevent', 'KEYCODE_HOME')
    time.sleep(2)
    adb('shell', 'am', 'start', '-W', '-n', MAIN, timeout=120)
    wait('el ingreso al volver a la app', sign_in_screen)
    adb('shell', 'am', 'force-stop', PKG)
    adb('shell', 'am', 'start', '-W', '-n', MAIN, timeout=120)
    wait('el ingreso al abrir la app de cero', sign_in_screen, seconds=60)
    time.sleep(5)
    if not running():
        fail('la app se cerró después de abrirla de cero')
    shot('5-final')

    step('Revisar el registro del teléfono')
    check_log()
    print('La versión optimizada pasó la prueba.', flush=True)
except BaseException:
    try:
        shot('falla')
        if not (out / 'logcat.txt').exists():
            (out / 'logcat.txt').write_text(adb('logcat', '-d', '-b', 'all', '-v', 'threadtime', check=False, timeout=120).stdout)
    except Exception as e:  # The failure itself matters more than its screenshot.
        print(f'No se pudo guardar la captura o el registro: {e}', flush=True)
    raise
