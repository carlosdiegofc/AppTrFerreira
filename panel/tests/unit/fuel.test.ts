import { describe, expect, it } from 'vitest';
import {
  account,
  balances,
  type CatalogStation,
  catalogStations,
  filterReceipts,
  type FuelRow,
  groupStations,
  isFuture,
  type Movement,
  movementFromRow,
  type MovementRow,
  NO_STATION,
  parseStationKey,
  receiptFromRow,
  stationKey,
  stationName,
  statement,
  totals,
} from '../../src/lib/fuel';
import { arrivalNote, correctedPanelData, movementFormValues, movementRow, newReceiptRow, receiptFormValues, sameMovement, sameReceipt, validateMovementForm, validateReceiptForm } from '../../src/lib/fuelForm';

const STATIONS: CatalogStation[] = [
  { id: 'est-ruta5', name: 'Ancap Ruta 5 km 32' },
  { id: 'est-salto', name: 'Petrobras Salto' },
];
const TRUCKS = [{ model: 'Volvo FH 460', plate: 'ABC1234' }];

const row = (over: Partial<FuelRow> = {}): FuelRow => ({
  id: 'r1', trip_id: null, driver_id: 'd1', driver_name: 'Ana Pereira', vehicle: 'Volvo FH 460 · ABC1234', recorded_at: '2026-10-15T12:00:00Z',
  receipt_date: '2026-10-15', distance_meters: 0, object_path: null, archived: false, station_id: '', station_name: 'Ancap Ruta 5 km 32',
  liters: 180, total: 9800, panel_data: null, updated_at: null, updated_by: null, full_tank: null, ...over,
});
const move = (over: Partial<MovementRow> = {}): MovementRow => ({
  id: 'm1', station_key: 'id:est-ruta5', station_name: 'Ancap Ruta 5 km 32', kind: 'payment', happened_on: '2026-10-12', amount: 20000, currency: 'UYU',
  method: 'transferencia', notes: null, deleted_at: null, created_at: '2026-10-12T15:00:00Z', created_by: 'u1', updated_at: '2026-10-12T15:00:00Z', updated_by: 'u1', ...over,
});

describe('estaciones', () => {
  it('lee la lista del catálogo, también guardada como texto, sin repetidas ni incompletas', () => {
    const data = { estaciones: [{ id: 'est-ruta5', nombre: 'Ancap Ruta 5 km 32' }, { id: 'est-ruta5', nombre: 'Repetida' }, { id: '', nombre: 'Sin id' }, { id: 'x' }] };
    expect(catalogStations(data)).toEqual([{ id: 'est-ruta5', name: 'Ancap Ruta 5 km 32' }]);
    expect(catalogStations(JSON.stringify(data))).toEqual([{ id: 'est-ruta5', name: 'Ancap Ruta 5 km 32' }]);
    expect(catalogStations(null)).toEqual([]);
  });

  it('agrupa por nombre sin importar mayúsculas, tildes ni espacios de más, y reconoce las de la lista', () => {
    expect(stationName('  Estación  EL Tala ')).toBe('estacion el tala');
    expect(stationKey(null, 'Estacion el tala', STATIONS)).toBe(stationKey(null, ' ESTACIÓN  El Tala', STATIONS));
    expect(stationKey(null, 'ANCAP  ruta 5 KM 32', STATIONS)).toBe('id:est-ruta5');
    expect(stationKey('est-salto', 'otro nombre', STATIONS)).toBe('id:est-salto');
    expect(stationKey(null, '  ', STATIONS)).toBe(NO_STATION);
    expect(parseStationKey('name:estacion el tala')).toBe('name:estacion el tala');
    // The receipts that do not say the station have their own page too.
    expect(parseStationKey(NO_STATION)).toBe(NO_STATION);
    expect(parseStationKey('id:')).toBeNull();
    expect(parseStationKey('otra cosa')).toBeNull();
    expect(parseStationKey(undefined)).toBeNull();
  });
});

describe('boletas', () => {
  it('las correcciones de la oficina ganan y lo declarado queda aparte', () => {
    const r = receiptFromRow(
      row({ panel_data: { fecha: '2026-10-14', litros: '182,5', monto: '9.950', moneda: 'USD', vehicle: 'Volvo FH 460', estacionNombre: 'Petrobras  salto' }, updated_at: '2026-10-15T13:00:00Z' }),
      TRUCKS,
      STATIONS,
    );
    expect(r).toMatchObject({ date: '2026-10-14', liters: 182.5, total: 9950, currency: 'USD', vehicle: 'Volvo FH 460 · ABC1234', station: 'Petrobras  salto', stationKey: 'id:est-salto', updatedAt: '2026-10-15T13:00:00Z' });
    expect(r.declared).toEqual({ date: '2026-10-15', vehicle: 'Volvo FH 460 · ABC1234', stationId: null, station: 'Ancap Ruta 5 km 32', liters: 180, total: 9800, fullTank: null });
  });

  it('el tanque lleno: lo que dijo el chofer, salvo que la oficina lo corrija; y los metros del viaje al cargar', () => {
    expect(receiptFromRow(row()).fullTank).toBe(false);
    expect(receiptFromRow(row({ full_tank: true })).fullTank).toBe(true);
    expect(receiptFromRow(row({ full_tank: true, panel_data: { tanque_lleno: false } })).fullTank).toBe(false);
    expect(receiptFromRow(row({ full_tank: null, panel_data: { tanque_lleno: true } }))).toMatchObject({ fullTank: true, declared: { fullTank: null } });
    expect(receiptFromRow(row({ trip_id: 't1', distance_meters: 152300 })).tripMeters).toBe(152300);
    expect(receiptFromRow(row({ trip_id: null, distance_meters: 0 })).tripMeters).toBeNull();
  });

  it('panel_data guardado como texto se lee igual', () => {
    expect(receiptFromRow(row({ panel_data: '{"monto": "10.000"}' })).total).toBe(10000);
  });

  it('una estación corregida a mano deja de ser la de la lista que había declarado el chofer', () => {
    const r = receiptFromRow(row({ station_id: 'est-ruta5', panel_data: { estacionNombre: 'Estación El Tala' } }), [], STATIONS);
    expect(r.stationKey).toBe('name:estacion el tala');
    expect(receiptFromRow(row({ station_id: 'est-ruta5', panel_data: { estacionId: 'est-salto', estacionNombre: 'Petrobras Salto' } }), [], STATIONS).stationKey).toBe('id:est-salto');
  });

  it('sin fecha en la boleta toma el día en que llegó, en hora de Uruguay', () => {
    expect(receiptFromRow(row({ receipt_date: '', recorded_at: '2026-10-16T01:30:00Z' })).date).toBe('2026-10-15');
  });

  it('filtra por período, estación, camión, búsqueda y papelera', () => {
    const list = [
      receiptFromRow(row({ id: 'a', receipt_date: '2026-10-01', driver_name: 'Diego Silva' }), TRUCKS, STATIONS),
      receiptFromRow(row({ id: 'b', receipt_date: '2026-10-10', station_name: 'Estación El Tala', vehicle: '' }), TRUCKS, STATIONS),
      receiptFromRow(row({ id: 'c', receipt_date: '2026-10-12', archived: true }), TRUCKS, STATIONS),
    ];
    expect(filterReceipts(list).map((r) => r.id)).toEqual(['b', 'a']);
    expect(filterReceipts(list, { bin: true }).map((r) => r.id)).toEqual(['c']);
    expect(filterReceipts(list, { from: '2026-10-05', to: '2026-10-31' }).map((r) => r.id)).toEqual(['b']);
    expect(filterReceipts(list, { station: 'id:est-ruta5' }).map((r) => r.id)).toEqual(['a']);
    expect(filterReceipts(list, { vehicle: 'Volvo FH 460 · ABC1234' }).map((r) => r.id)).toEqual(['a']);
    expect(filterReceipts(list, { q: 'diego' }).map((r) => r.id)).toEqual(['a']);
    expect(filterReceipts(list, { q: 'estacion el' }).map((r) => r.id)).toEqual(['b']);
    // The station also by the name the page shows: a catalog station saved with an older name or none.
    const stale = [receiptFromRow(row({ id: 'd', station_id: 'est-salto', station_name: '' }), TRUCKS, STATIONS)];
    expect(filterReceipts(stale, { q: 'petrobras' })).toEqual([]);
    expect(filterReceipts(stale, { q: 'petrobras', names: new Map([['id:est-salto', 'Petrobras Salto']]) }).map((r) => r.id)).toEqual(['d']);
  });

  it('suma litros y montos por moneda, sin mezclar pesos con dólares', () => {
    const list = [
      receiptFromRow(row({ id: 'a', liters: 100.25, total: 5000.1 })),
      receiptFromRow(row({ id: 'b', liters: 50, total: 300, panel_data: { moneda: 'USD' } })),
      receiptFromRow(row({ id: 'c', liters: null, total: null })),
      receiptFromRow(row({ id: 'd', liters: 10, total: 0.2 })),
    ];
    expect(totals(list)).toEqual({ receipts: 4, liters: 160.25, amounts: { UYU: 5000.3, USD: 300 }, withoutAmount: 1 });
  });
});

describe('cuenta de cada estación', () => {
  const receipts = [
    // Before the opening balance of the 5th: inside it.
    receiptFromRow(row({ id: 'old', receipt_date: '2026-09-25', total: 11000, station_id: 'est-ruta5' }), [], STATIONS),
    receiptFromRow(row({ id: 'same-day', receipt_date: '2026-10-05', total: 1000, recorded_at: '2026-10-05T20:00:00Z' }), [], STATIONS),
    receiptFromRow(row({ id: 'typed', receipt_date: '2026-10-13', total: 16500, station_name: 'ANCAP  ruta 5 KM 32' }), [], STATIONS),
    receiptFromRow(row({ id: 'no-amount', receipt_date: '2026-10-14', total: null }), [], STATIONS),
    receiptFromRow(row({ id: 'binned', receipt_date: '2026-10-14', total: 99999, archived: true }), [], STATIONS),
    receiptFromRow(row({ id: 'usd', receipt_date: '2026-10-14', total: 310, station_name: 'Petrobras Salto', panel_data: { moneda: 'USD' } }), [], STATIONS),
    receiptFromRow(row({ id: 'tala', receipt_date: '2026-10-10', total: 6600, station_name: 'Estación El Tala' }), [], STATIONS),
  ];
  const movements: Movement[] = [
    movementFromRow(move({ id: 'open', kind: 'opening', happened_on: '2026-10-05', amount: 25000, method: null, created_at: '2026-10-15T10:00:00Z' })),
    movementFromRow(move({ id: 'pay', happened_on: '2026-10-12', amount: 20000 })),
    movementFromRow(move({ id: 'pay-old', happened_on: '2026-09-30', amount: 5000 })),
    movementFromRow(move({ id: 'annulled', happened_on: '2026-10-13', amount: 1000, deleted_at: '2026-10-14T00:00:00Z' })),
    movementFromRow(move({ id: 'pay-usd', station_key: 'id:est-salto', station_name: 'Petrobras Salto', happened_on: '2026-10-14', amount: 100, currency: 'USD', method: 'efectivo' })),
  ];
  const stations = groupStations(receipts, movements, [...STATIONS, { id: 'est-sin-uso', name: 'Ducsa Young' }]);
  const find = (key: string) => stations.find((s) => s.key === key)!;

  it('junta las boletas de la lista y las escritas a mano, y muestra también las estaciones de la lista sin cargas', () => {
    expect(stations.map((s) => [s.key, s.name, s.listed])).toEqual([
      ['id:est-ruta5', 'Ancap Ruta 5 km 32', true],
      ['id:est-salto', 'Petrobras Salto', true],
      ['name:estacion el tala', 'Estación El Tala', false],
      ['id:est-sin-uso', 'Ducsa Young', true],
    ]);
    expect(find('id:est-ruta5').receipts.map((r) => r.id)).toEqual(['no-amount', 'typed', 'same-day', 'old']);
    expect(find('id:est-sin-uso').accounts).toEqual([]);
  });

  it('saldo inicial con su fecha, más las cargas desde ese día, menos los pagos; lo anterior queda adentro', () => {
    const [uyu] = find('id:est-ruta5').accounts;
    expect(uyu).toMatchObject({ currency: 'UYU', loaded: 17500, paid: 20000, balance: 22500, withoutAmount: 1 });
    expect(uyu?.opening?.id).toBe('open');
    expect(find('id:est-salto').accounts).toEqual([expect.objectContaining({ currency: 'USD', loaded: 310, paid: 100, balance: 210, opening: null })]);
    // Without an opening balance the account starts with the first receipt.
    expect(find('name:estacion el tala').accounts).toEqual([expect.objectContaining({ currency: 'UYU', balance: 6600 })]);
  });

  it('una estación escrita a mano se llama como se escribió más veces y, si empatan, como la primera vez', () => {
    const tala = (id: string, day: string, name: string) => receiptFromRow(row({ id, receipt_date: day, station_name: name }), [], STATIONS);
    expect(groupStations([tala('a', '2026-10-01', 'Estación El Tala'), tala('b', '2026-10-05', 'estacion el tala')], [], [])[0]!.name).toBe('Estación El Tala');
    expect(groupStations([tala('a', '2026-10-01', 'Estación El Tala'), tala('b', '2026-10-05', 'ESTACION EL TALA'), tala('c', '2026-10-06', 'ESTACION EL TALA')], [], [])[0]!.name).toBe('ESTACION EL TALA');
  });

  it('un saldo inicial a favor de la empresa resta', () => {
    const s = groupStations([receipts[2]!], [movementFromRow(move({ kind: 'opening', amount: -3000, method: null, happened_on: '2026-10-01' }))], STATIONS)[0]!;
    expect(account(s, 'UYU').balance).toBe(13500);
  });

  it('una estación escrita a mano que después entra en la lista sigue con sus pagos en la misma cuenta', () => {
    const listed = [...STATIONS, { id: 'est-tala', name: 'Estación El Tala' }];
    const pay = move({ id: 'p-tala', station_key: 'name:estacion el tala', station_name: 'Estación El Tala', amount: 600, method: 'efectivo' });
    expect(movementFromRow(pay, listed).stationKey).toBe('id:est-tala');
    expect(movementFromRow(pay, STATIONS).stationKey).toBe('name:estacion el tala');
    expect(movementFromRow(move({ station_key: NO_STATION }), listed).stationKey).toBe(NO_STATION);
    const tala = receiptFromRow(row({ id: 'r-tala', receipt_date: '2026-10-10', total: 6600, station_name: 'Estación El Tala' }), [], listed);
    const grouped = groupStations([tala], [movementFromRow(pay, listed)], listed).filter((s) => s.receipts.length > 0 || s.payments.length > 0);
    expect(grouped.map((s) => [s.key, s.accounts.map((a) => a.balance)])).toEqual([['id:est-tala', [6000]]]);
  });

  it('las boletas que no dicen la estación no se le deben a ninguna: quedan para corregir, sin cuenta', () => {
    const lost = receiptFromRow(row({ id: 'sin-estacion', station_id: '', station_name: '  ', total: 4000 }), [], STATIONS);
    const all = groupStations([...receipts, lost], movements, STATIONS);
    const none = all.find((s) => s.key === NO_STATION)!;
    expect(none.receipts.map((r) => r.id)).toEqual(['sin-estacion']);
    expect(none.accounts).toEqual([]);
    expect(balances(all)).toEqual(balances(stations));
  });

  it('lo que se les debe a unas estaciones no se compensa con lo que otras tienen a favor', () => {
    const favor = groupStations([], [movementFromRow(move({ id: 'f', station_key: 'name:estacion el tala', station_name: 'Estación El Tala', kind: 'opening', amount: -6600, method: null, happened_on: '2026-10-01' }))], STATIONS);
    expect(balances([...stations, ...favor])).toEqual({ owed: { UYU: 29100, USD: 210 }, credit: { UYU: 6600, USD: 0 } });
  });

  it('el estado de cuenta va del saldo inicial en adelante, con el saldo después de cada renglón', () => {
    const s = statement(find('id:est-ruta5'), 'UYU');
    expect(s.lines.map((l) => [l.day, l.kind, l.amount, l.balance])).toEqual([
      ['2026-10-05', 'opening', 25000, 25000],
      ['2026-10-05', 'receipt', 1000, 26000],
      ['2026-10-12', 'payment', -20000, 6000],
      ['2026-10-13', 'receipt', 16500, 22500],
      ['2026-10-14', 'receipt', null, 22500],
    ]);
    expect(s.earlier).toBe(2);
    expect(s.balance).toBe(22500);
  });

  it('una boleta con fecha posterior a hoy es una carga real: suma en la cuenta y se marca para corregir la fecha', () => {
    const future = receiptFromRow(row({ id: 'future', receipt_date: '2026-11-15', total: 5000 }), [], STATIONS);
    expect(isFuture(future, '2026-10-15')).toBe(true);
    expect(isFuture(receiptFromRow(row(), [], STATIONS), '2026-10-15')).toBe(false);
    expect(isFuture({ date: null }, '2026-10-15')).toBe(false);
    const s = groupStations([...receipts, future], movements, STATIONS).find((x) => x.key === 'id:est-ruta5')!;
    expect(account(s, 'UYU').balance).toBe(27500);
    expect(statement(s, 'UYU').lines.at(-1)).toMatchObject({ day: '2026-11-15', kind: 'receipt', balance: 27500 });
  });

  it('si aparecen dos saldos iniciales de la misma moneda vale el último guardado', () => {
    const two = [
      movementFromRow(move({ id: 'a', kind: 'opening', amount: 1000, method: null, updated_at: '2026-10-01T00:00:00Z' })),
      movementFromRow(move({ id: 'b', kind: 'opening', amount: 2000, method: null, updated_at: '2026-10-02T00:00:00Z' })),
    ];
    expect(groupStations([], two, STATIONS)[0]!.openings.map((o) => o.id)).toEqual(['b']);
    expect(groupStations([], [...two].reverse(), STATIONS)[0]!.openings.map((o) => o.id)).toEqual(['b']);
  });
});

describe('formulario de boleta', () => {
  const today = '2026-10-15';

  it('una boleta nueva necesita fecha, estación e importe; los litros son opcionales', () => {
    const empty = validateReceiptForm(receiptFormValues(null, STATIONS, today), STATIONS, today);
    expect(empty.ok).toBe(false);
    expect(empty.errors).toEqual({ station: 'Elegí la estación de la lista o escribí su nombre.', total: 'Escribí el importe de la boleta.' });
    const future = validateReceiptForm({ ...receiptFormValues(null, STATIONS, today), date: '2026-10-16', station: 'El Tala', total: '0' }, STATIONS, today);
    expect(future.errors).toEqual({ date: 'La fecha no puede ser posterior a hoy.', total: 'El importe tiene que ser mayor que cero.' });
    const ok = validateReceiptForm({ ...receiptFormValues(null, STATIONS, today), stationId: 'est-ruta5', total: '12.500', liters: '230,5', currency: 'USD' }, STATIONS, today);
    expect(ok.ok && ok.payload).toEqual({ date: today, at: null, stationId: 'est-ruta5', station: 'Ancap Ruta 5 km 32', vehicle: '', liters: 230.5, total: 12500, currency: 'USD', fullTank: false });
    // A full tank is a truck's: without the truck it cannot be said.
    const full = validateReceiptForm({ ...receiptFormValues(null, STATIONS, today), stationId: 'est-ruta5', total: '12.500', fullTank: true }, STATIONS, today);
    expect(full.errors).toEqual({ vehicle: 'Para marcar el tanque lleno, escribí el camión.' });
  });

  it('una boleta cargada en el panel queda a nombre de quien la carga, sin viaje y con la foto en su carpeta', () => {
    const check = validateReceiptForm({ ...receiptFormValues(null, STATIONS, today), station: ' Estación El Tala ', total: '6600', vehicle: 'Volvo FH 460 · ABC1234', currency: 'USD' }, STATIONS, today);
    if (!check.ok) throw new Error('tendría que ser válida');
    expect(newReceiptRow('r9', { id: 'u2', name: 'Socio Lectura' }, check.payload, true)).toEqual({
      id: 'r9', driver_id: 'u2', driver_name: 'Socio Lectura', trip_id: null, vehicle: 'Volvo FH 460 · ABC1234', receipt_date: today, station_id: '',
      station_name: 'Estación El Tala', liters: null, total: 6600, object_path: 'u2/standalone/r9.jpg', panel_data: { moneda: 'USD' }, full_tank: false,
    });
    expect(newReceiptRow('r9', { id: 'u2', name: 'Socio Lectura' }, { ...check.payload, currency: 'UYU' }, false)).toMatchObject({ object_path: null, panel_data: null });
  });

  it('reconoce cuando la base ya tenía la boleta de un intento anterior con otros datos', () => {
    const check = validateReceiptForm({ ...receiptFormValues(null, STATIONS, today), stationId: 'est-ruta5', total: '6600', currency: 'USD' }, STATIONS, today);
    if (!check.ok) throw new Error('tendría que ser válida');
    const sent = newReceiptRow('r9', { id: 'u2', name: 'Socio Lectura' }, check.payload, true);
    const saved = { ...row({ id: 'r9', driver_id: 'u2', driver_name: 'Socio Lectura', vehicle: '' }), ...sent } as FuelRow;
    expect(sameReceipt(saved, sent)).toBe(true);
    expect(sameReceipt({ ...saved, total: 6000 }, sent)).toBe(false);
    expect(sameReceipt({ ...saved, object_path: null }, sent)).toBe(false);
    expect(sameReceipt({ ...saved, panel_data: null }, sent)).toBe(false);
    expect(sameReceipt({ ...saved, full_tank: true }, sent)).toBe(false);
  });

  it('una boleta nueva va con su hora, en hora de Uruguay: así el tanque ubica la carga entre los viajes del camión', () => {
    const base = { ...receiptFormValues(null, STATIONS, today, '12:00'), stationId: 'est-ruta5', total: '6600', vehicle: 'Volvo FH 460 · ABC1234' };
    expect(base.time).toBe('12:00');
    const yesterday = validateReceiptForm({ ...base, date: '2026-10-14', time: '07:30' }, STATIONS, today, undefined, '12:00');
    if (!yesterday.ok) throw new Error('tendría que ser válida');
    expect(yesterday.payload.at).toBe('2026-10-14T10:30:00.000Z');
    const sent = newReceiptRow('r9', { id: 'u2', name: 'Socio Lectura' }, yesterday.payload, false);
    expect(sent.recorded_at).toBe('2026-10-14T10:30:00.000Z');
    // The database writes the instant its own way: it is the same one.
    const saved = { ...row({ id: 'r9', driver_id: 'u2', driver_name: 'Socio Lectura' }), ...sent, recorded_at: '2026-10-14T10:30:00+00:00' } as FuelRow;
    expect(sameReceipt(saved, sent)).toBe(true);
    expect(sameReceipt({ ...saved, recorded_at: '2026-10-14T15:00:00+00:00' }, sent)).toBe(false);
    // Today it cannot be later than now; any other day, any time.
    expect(validateReceiptForm({ ...base, time: '12:01' }, STATIONS, today, undefined, '12:00').errors).toEqual({ time: 'La hora no puede ser posterior a ahora.' });
    expect(validateReceiptForm({ ...base, date: '2026-10-14', time: '23:59' }, STATIONS, today, undefined, '12:00').ok).toBe(true);
    expect(validateReceiptForm({ ...base, time: '' }, STATIONS, today, undefined, '12:00').errors).toEqual({ time: 'Escribí la hora de la boleta.' });
    expect(validateReceiptForm({ ...base, time: '25:00' }, STATIONS, today, undefined, '12:00').errors).toEqual({ time: 'La hora no es válida.' });
    // A correction keeps the moment the receipt has.
    const r = receiptFromRow(row(), TRUCKS, STATIONS);
    const fix = validateReceiptForm({ ...receiptFormValues(r, STATIONS, today, '12:00'), total: '9000' }, STATIONS, today, r.declared);
    expect(fix.ok && fix.payload.at).toBeNull();
  });

  it('al corregir, lo que la boleta tenía no se puede dejar vacío: volvería a leerse lo declarado', () => {
    const r = receiptFromRow(row(), TRUCKS, STATIONS);
    const values = { ...receiptFormValues(r, STATIONS, today), liters: '', vehicle: ' ' };
    expect(validateReceiptForm(values, STATIONS, today, r.declared).errors).toEqual({
      liters: 'La boleta tiene litros: para corregirlos, escribí el número correcto.',
      vehicle: 'La boleta tiene camión: para cambiarlo, escribí el correcto.',
    });
    // Without liters or truck declared, they stay optional.
    const bare = receiptFromRow(row({ liters: null, vehicle: '' }), TRUCKS, STATIONS);
    expect(validateReceiptForm({ ...receiptFormValues(bare, STATIONS, today), liters: '', vehicle: '' }, STATIONS, today, bare.declared).ok).toBe(true);
  });

  it('avisa cuando la fecha cae en otro mes que el día en que llegó la boleta, que es como la cuentan la app y el panel actual', () => {
    const r = receiptFromRow(row({ recorded_at: '2026-10-15T15:00:00Z' }), TRUCKS, STATIONS);
    expect(arrivalNote(r, '2026-10-01')).toBeNull();
    expect(arrivalNote(r, '2026-09-30')).toBe('El resumen del mes de la app y el panel actual la cuentan el 15/10/2026, el día en que llegó.');
    expect(arrivalNote(r, '')).toBeNull();
    // 23:30 of 31/10 in Uruguay is already November in UTC.
    expect(arrivalNote(receiptFromRow(row({ recorded_at: '2026-11-01T02:30:00Z' }), TRUCKS, STATIONS), '2026-10-31')).toBeNull();
  });

  it('una corrección guarda solo lo que cambió y deja lo declarado como estaba', () => {
    const r = receiptFromRow(row({ panel_data: { litros: 182.5, otro: 'se conserva' } }), TRUCKS, STATIONS);
    const initial = receiptFormValues(r, STATIONS, today);
    expect(initial).toMatchObject({ stationId: 'est-ruta5', station: '', liters: '182,5', total: '9800', currency: 'UYU' });
    const save = (changes: Partial<typeof initial>) => {
      const values = { ...initial, ...changes };
      const check = validateReceiptForm(values, STATIONS, today);
      if (!check.ok) throw new Error(JSON.stringify(check.errors));
      return correctedPanelData(r, initial, values, check.payload, STATIONS, TRUCKS);
    };
    // Unchanged: what was there stays.
    expect(save({})).toEqual({ litros: 182.5, otro: 'se conserva' });
    expect(save({ total: '9.950', currency: 'USD', date: '2026-10-14' })).toEqual({ litros: 182.5, otro: 'se conserva', monto: 9950, moneda: 'USD', fecha: '2026-10-14' });
    // Back to what the driver declared: the correction goes away.
    expect(save({ liters: '180' })).toEqual({ otro: 'se conserva' });
    expect(save({ stationId: '', station: 'Estación El Tala' })).toEqual({ litros: 182.5, otro: 'se conserva', estacionNombre: 'Estación El Tala' });
    expect(save({ stationId: 'est-salto' })).toEqual({ litros: 182.5, otro: 'se conserva', estacionNombre: 'Petrobras Salto', estacionId: 'est-salto' });
    expect(save({ vehicle: 'abc1234' })).toEqual({ litros: 182.5, otro: 'se conserva' });
    // The full tank: the office's word goes in panel_data, and back to what was said it goes away.
    expect(save({ fullTank: true })).toEqual({ litros: 182.5, otro: 'se conserva', tanque_lleno: true });
    const said = receiptFromRow(row({ full_tank: true, panel_data: { tanque_lleno: false } }), TRUCKS, STATIONS);
    const saidStart = receiptFormValues(said, STATIONS, today);
    expect(saidStart.fullTank).toBe(false);
    const saidBack = { ...saidStart, fullTank: true };
    const saidCheck = validateReceiptForm(saidBack, STATIONS, today);
    expect(saidCheck.ok && correctedPanelData(said, saidStart, saidBack, saidCheck.payload, STATIONS, TRUCKS)).toBeNull();
    const clean = receiptFromRow(row({ panel_data: { monto: 9950 } }), TRUCKS, STATIONS);
    const start = receiptFormValues(clean, STATIONS, today);
    const back = { ...start, total: '9800' };
    const check = validateReceiptForm(back, STATIONS, today);
    expect(check.ok && correctedPanelData(clean, start, back, check.payload, STATIONS, TRUCKS)).toBeNull();
  });
});

describe('pagos y saldos iniciales', () => {
  const today = '2026-10-15';
  const known = new Set(['id:est-ruta5', 'name:estacion el tala']);

  it('un pago necesita estación, fecha, monto mayor que cero y forma de pago', () => {
    const empty = validateMovementForm('payment', movementFormValues(null, '', today), known, today);
    expect(empty.errors).toEqual({ station: 'Elegí la estación.', amount: 'Escribí cuánto se pagó.', method: 'Elegí cómo se pagó.' });
    const ok = validateMovementForm('payment', { ...movementFormValues(null, 'id:est-ruta5', today), amount: '20.000', method: 'transferencia', notes: ' BROU ' }, known, today);
    expect(ok.ok && ok.payload).toEqual({ station: 'id:est-ruta5', date: today, amount: 20000, currency: 'UYU', method: 'transferencia', notes: 'BROU' });
    expect(validateMovementForm('payment', { ...movementFormValues(null, NO_STATION, today), amount: '1', method: 'otro' }, new Set([NO_STATION]), today).errors).toEqual({ station: 'Elegí la estación.' });
  });

  it('un saldo inicial puede ser cero o a favor de la empresa, y no lleva forma de pago', () => {
    const credit = validateMovementForm('opening', { ...movementFormValues(null, 'name:estacion el tala', today), amount: '3.000', side: 'credit', currency: 'USD', method: 'efectivo' }, known, today);
    expect(credit.ok && credit.payload).toEqual({ station: 'name:estacion el tala', date: today, amount: -3000, currency: 'USD', method: null, notes: null });
    expect(validateMovementForm('opening', { ...movementFormValues(null, 'id:est-ruta5', today), amount: '0' }, known, today).ok).toBe(true);
    if (!credit.ok) throw new Error('tendría que ser válido');
    expect(movementRow('opening', credit.payload, 'Estación El Tala')).toEqual({ station_key: 'name:estacion el tala', station_name: 'Estación El Tala', kind: 'opening', happened_on: today, amount: -3000, currency: 'USD', method: null, notes: null });
  });

  it('reconoce cuando la base ya tenía el pago de un intento anterior con otros datos', () => {
    const ok = validateMovementForm('payment', { ...movementFormValues(null, 'id:est-ruta5', today), amount: '20.000', method: 'transferencia' }, known, today);
    if (!ok.ok) throw new Error('tendría que ser válido');
    const sent = { ...movementRow('payment', ok.payload, 'Ancap Ruta 5 km 32'), id: 'm9' };
    const saved = move({ id: 'm9', happened_on: today, amount: 20000, method: 'transferencia', notes: null });
    expect(sameMovement(saved, sent)).toBe(true);
    expect(sameMovement({ ...saved, amount: 2000 }, sent)).toBe(false);
    expect(sameMovement({ ...saved, method: 'efectivo' }, sent)).toBe(false);
  });

  it('al corregir, el formulario arranca con lo guardado', () => {
    const m = movementFromRow(move({ kind: 'opening', amount: -3000, method: null, notes: 'Cierre de septiembre' }));
    expect(movementFormValues(m, 'otra', today)).toEqual({ station: 'id:est-ruta5', date: '2026-10-12', amount: '3000', currency: 'UYU', method: '', notes: 'Cierre de septiembre', side: 'credit' });
  });
});
