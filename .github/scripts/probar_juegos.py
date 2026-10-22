#!/usr/bin/env python3
"""The games on an Android emulator. TEST ONLY.

Installs the debug APK, the only one that opens the games without an account (MainActivity.gamesTest), and plays chess
the way a driver does it with the screen: a game against the phone (a move, the phone's answer, undo, turning the board
and the screen), and two games between two people on the phone: one that crowns a pawn and one that ends in mate. It
fails if the app closes by itself or if a screen does not show what it must. The rule of the truck stopped is tested in
GamesTest: without a trip, here, the games always open. Nothing of the games goes out of the phone, and the emulator
starts without DNS anyway.

Usage: probar_juegos.py <debug apk> <output folder>. Screenshots and the phone's log are left in the folder.
"""
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PKG = 'com.transportesferreira.app'
MAIN = PKG + '/uy.transportesferreira.gps.MainActivity'
BOARD = 'Tablero de ajedrez.'

apk, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
pids: set[str] = set()


def adb(*args: str, check: bool = True, timeout: int = 60) -> subprocess.CompletedProcess:
    # The phone's log can carry bytes that are not UTF-8.
    result = subprocess.run(['adb', *args], capture_output=True, text=True, errors='replace', timeout=timeout)
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
    adb('shell', 'rm', '-f', '/sdcard/ui.xml', check=False)
    adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml', check=False, timeout=30)
    xml = adb('shell', 'cat', '/sdcard/ui.xml', check=False).stdout
    if '<hierarchy' not in xml:
        return None
    try:
        return ET.fromstring(xml[xml.index('<hierarchy'):xml.rindex('>') + 1].encode())
    except ET.ParseError:
        return None


def nodes(root: ET.Element, text: str | None = None, part: str | None = None, desc: str | None = None, desc_part: str | None = None) -> list[ET.Element]:
    """The app's views with that text (whole or part of it) or description (whole or part of it)."""
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
        if desc_part is not None and desc_part not in (n.get('content-desc') or ''):
            continue
        found.append(n)
    return found


def shot(name: str) -> None:
    image = subprocess.run(['adb', 'exec-out', 'screencap', '-p'], capture_output=True, timeout=30).stdout
    (out / f'{name}.png').write_bytes(image)


def fail(why: str) -> None:
    raise SystemExit(f'La prueba de los juegos falló: {why}.')


def present(hit) -> bool:
    """Whether found() found something: a view without children is a false Element, so its truth is not used."""
    if hit is None or hit is False:
        return False
    return len(hit) > 0 if isinstance(hit, list) else True


last_rotation = '?'


def poll(what: str, found, seconds: int):
    """What found(screen) gives within those seconds, or None; fails if the app closes meanwhile."""
    global last_rotation
    end = time.time() + seconds
    while time.time() < end:
        alive = running()
        root = screen()
        if root is not None:
            last_rotation = root.get('rotation', '?')
        hit = found(root) if root is not None else None
        if present(hit):
            return hit
        if not alive:
            fail(f'la app se cerró mientras se esperaba {what}')
        time.sleep(1)
    return None


def wait(what: str, found, seconds: int = 30):
    hit = poll(what, found, seconds)
    if hit is None:
        fail(f'no apareció {what}')
    return hit


def rotate(rotation: str, what: str, found):
    """Turns the screen like the test of the optimized build; if it did not turn, asks the window manager again."""
    adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0')
    adb('shell', 'settings', 'put', 'system', 'user_rotation', rotation)
    turned = lambda r: r.get('rotation') == rotation and found(r)
    hit = poll(what, turned, 15)
    if hit is None:
        adb('shell', 'wm', 'user-rotation', 'lock', rotation, check=False)
        hit = poll(what, turned, 30)
    if hit is None:
        fail(f'no apareció {what} (la pantalla quedó en la rotación {last_rotation})')
    return hit


def bounds(node: ET.Element) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds', '')))
    return x1, y1, x2, y2


def tap_at(x: int, y: int) -> None:
    adb('shell', 'input', 'tap', str(x), str(y))


def tap(node: ET.Element) -> None:
    x1, y1, x2, y2 = bounds(node)
    tap_at((x1 + x2) // 2, (y1 + y2) // 2)


def board(root: ET.Element, says: str = '') -> ET.Element | None:
    """The board, when its description (the move number and the line under it) says that."""
    found = [n for n in nodes(root, desc_part=BOARD) if says in (n.get('content-desc') or '')]
    return found[0] if found else None


def square(node: ET.Element, name: str, flipped: bool = False) -> tuple[int, int]:
    """The middle of a square of the board, as the screen shows it."""
    x1, y1, x2, y2 = bounds(node)
    size = (x2 - x1) / 8
    col, row = 'abcdefgh'.index(name[0]), 8 - int(name[1])
    if flipped:
        col, row = 7 - col, 7 - row
    return int(x1 + (col + 0.5) * size), int(y1 + (row + 0.5) * size)


def move(uci: str, then: str, flipped: bool = False) -> None:
    """Taps a piece and where it goes, and waits for the line under the board to say then."""
    node = wait('el tablero', lambda r: board(r))
    tap_at(*square(node, uci[:2], flipped))
    time.sleep(0.4)
    tap_at(*square(node, uci[2:4], flipped))
    wait(f'«{then}» después de {uci}', lambda r: board(r, then))


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


def new_game(two: bool) -> None:
    """From the board or the games list: a new game against the phone (easy, white) or between two people."""
    tap(wait('el botón de partida nueva o el ajedrez', lambda r: nodes(r, desc='Partida nueva') or nodes(r, text='Ajedrez'))[0])
    root = wait('las opciones de la partida nueva', lambda r: nodes(r, desc='Empezar') and r)
    if two:
        tap(nodes(root, text='Entre dos, en este teléfono')[0])
        root = wait('la opción de dos personas elegida', lambda r: nodes(r, part='Se juega pasando el teléfono') and r)
    else:
        tap(nodes(root, text='Fácil')[0])
        tap(nodes(root, text='Blancas')[0])
    shot('juegos-2-partida-nueva' if not two else 'juegos-7-entre-dos')
    tap(wait('el botón Empezar', lambda r: nodes(r, desc='Empezar'))[0])


try:
    step('Instalar la versión de prueba (la optimizada tiene otra firma)')
    adb('uninstall', PKG, check=False)
    adb('install', '-r', str(apk), timeout=240)
    adb('logcat', '-b', 'all', '-c', check=False)
    adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0')
    adb('shell', 'settings', 'put', 'system', 'user_rotation', '0')

    step('Abrir los juegos: sin viaje se pueden usar')
    adb('shell', 'am', 'start', '-W', '-n', MAIN, '--ez', 'trf_test_games', 'true', timeout=120)
    wait('la lista de juegos con el ajedrez', lambda r: nodes(r, text='Ajedrez') and nodes(r, text='Contra el teléfono o entre dos'), seconds=60)
    root = screen()
    if root is not None and nodes(root, text='Primero, el camión parado'):
        fail('sin viaje, la lista de juegos dice que el camión tiene que estar parado')
    shot('juegos-1-lista')

    step('Contra el teléfono: una jugada y su respuesta')
    new_game(two=False)
    node = wait('el tablero en la jugada 1', lambda r: board(r, 'Jugada 1. Te toca mover.'))
    shot('juegos-3-tablero')
    tap_at(*square(node, 'e2'))
    time.sleep(1)
    shot('juegos-4-pieza-elegida')
    tap_at(*square(node, 'e4'))
    # The phone thinks at least half a second, and answers: white moves again in move 2.
    wait('la respuesta del teléfono', lambda r: board(r, 'Jugada 2. Te toca mover.'), seconds=40)
    wait('«Deshacer» habilitado después de jugar', lambda r: [n for n in nodes(r, desc='Deshacer') if n.get('enabled') == 'true'], seconds=10)
    shot('juegos-5-respuesta')

    step('Deshacer: vuelve la jugada propia con la respuesta del teléfono')
    tap(wait('el botón Deshacer', lambda r: nodes(r, desc='Deshacer'))[0])
    wait('el tablero de vuelta en la jugada 1', lambda r: board(r, 'Jugada 1. Te toca mover.'))

    step('Girar el tablero y la pantalla')
    tap(wait('el botón de girar el tablero', lambda r: nodes(r, desc='Girar el tablero'))[0])
    time.sleep(1)
    shot('juegos-6-tablero-girado')
    tap(wait('el botón de girar el tablero', lambda r: nodes(r, desc='Girar el tablero'))[0])
    rotate('1', 'el tablero con la pantalla girada', lambda r: board(r, 'Jugada 1.'))
    shot('juegos-6b-pantalla-girada')
    rotate('0', 'el tablero con la pantalla derecha', lambda r: board(r, 'Jugada 1. Te toca mover.'))

    step('Entre dos: un peón llega al final y se elige la pieza')
    new_game(two=True)
    wait('el tablero de dos personas', lambda r: board(r, 'Mueven las blancas'))
    for uci, then in [('a2a4', 'Mueven las negras'), ('b7b5', 'Mueven las blancas'), ('a4b5', 'Mueven las negras'), ('a7a6', 'Mueven las blancas'),
                      ('b5a6', 'Mueven las negras'), ('c8b7', 'Mueven las blancas'), ('a6b7', 'Mueven las negras'), ('b8c6', 'Mueven las blancas')]:
        move(uci, then)
    node = wait('el tablero antes de coronar', lambda r: board(r, 'Mueven las blancas'))
    tap_at(*square(node, 'b7'))
    time.sleep(0.4)
    tap_at(*square(node, 'a8'))
    choice = wait('la pregunta de en qué se convierte el peón', lambda r: nodes(r, text='Dama') and nodes(r, text='Caballo'))
    shot('juegos-8-coronar')
    tap(choice[0])
    wait('el turno de las negras después de coronar', lambda r: board(r, 'Jugada 5. Mueven las negras'))
    shot('juegos-9-coronado')

    step('Entre dos: jaque mate')
    tap(wait('el botón de partida nueva', lambda r: nodes(r, desc='Partida nueva'))[0])
    tap(wait('la confirmación de dejar la partida', lambda r: nodes(r, text='EMPEZAR OTRA') or nodes(r, text='Empezar otra'))[0])
    root = wait('las opciones de la partida nueva', lambda r: nodes(r, desc='Empezar') and r)
    tap(nodes(root, desc='Empezar')[0])
    for uci, then in [('f2f3', 'Mueven las negras'), ('e7e5', 'Mueven las blancas'), ('g2g4', 'Mueven las negras'), ('d8h4', 'Jaque mate. Ganan las negras.')]:
        move(uci, then)
    shot('juegos-10-mate')

    step('Modo oscuro: el tablero con sus colores de noche, y de vuelta')
    adb('shell', 'cmd', 'uimode', 'night', 'yes', check=False)
    time.sleep(2)
    wait('el tablero en modo oscuro', lambda r: board(r, 'Jaque mate. Ganan las negras.'))
    time.sleep(1)
    shot('juegos-11-oscuro')
    adb('shell', 'cmd', 'uimode', 'night', 'no', check=False)
    time.sleep(2)
    wait('el tablero en modo claro', lambda r: board(r, 'Jaque mate. Ganan las negras.'))

    step('Volver a la lista: la partida terminada no queda para seguir')
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK')
    wait('la lista de juegos', lambda r: nodes(r, text='Ajedrez') and nodes(r, text='Contra el teléfono o entre dos'))
    if not running():
        fail('la app se cerró al volver a la lista')

    step('Revisar el registro del teléfono')
    check_log()
    print('Los juegos pasaron la prueba.', flush=True)
except BaseException:
    try:
        shot('juegos-falla')
        if not (out / 'logcat.txt').exists():
            (out / 'logcat.txt').write_text(adb('logcat', '-d', '-b', 'all', '-v', 'threadtime', check=False, timeout=120).stdout)
    except Exception as e:  # The failure itself matters more than its screenshot.
        print(f'No se pudo guardar la captura o el registro: {e}', flush=True)
    raise
