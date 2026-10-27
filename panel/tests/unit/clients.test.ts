import { describe, expect, it } from 'vitest';
import {
  account,
  billedAmount,
  clientBalances,
  clientKey,
  clientWithoutAmount,
  type ClientMovement,
  clientMovementFromRow,
  type ClientMovementRow,
  clientName,
  collectionTotals,
  filterClients,
  filterCollections,
  groupClients,
  missingAmount,
  NO_CLIENT,
  parseClientKey,
  periodSums,
  statement,
  withoutAmount,
} from '../../src/lib/clients';
import { clientMovementRow, collectionFormChanged, collectionFormValues, sameClientMovement, validateCollectionForm } from '../../src/lib/clientForm';
import type { Trip } from '../../src/lib/trips';

let n = 0;
/** A finished app trip with cargo that started at noon in Uruguay of a day. */
function trip(over: Partial<Trip> & { day?: string } = {}): Trip {
  const { day = '2026-10-10', ...rest } = over;
  n++;
  return {
    key: 'app:' + n,
    source: 'app',
    appTripId: String(n),
    panelId: null,
    deleted: false,
    deletedAt: null,
    active: false,
    paused: false,
    driverId: null,
    driverName: null,
    vehicle: 'Volvo FH 460 · ABC1234',
    departureAt: `${day}T15:00:00Z`,
    arrivalAt: null,
    gpsKm: 100,
    loadType: 'loaded',
    orderNumber: null,
    client: 'Molino San José',
    product: null,
    originName: null,
    origin: null,
    gpsStart: null,
    destinationName: null,
    destination: null,
    gpsEnd: null,
    billableKm: null,
    kg: null,
    amount: 10000,
    currency: 'UYU',
    notes: null,
    updatedAt: null,
    status: { code: 'complete', label: 'Completo', missing: [] },
    ...rest,
  };
}

const row = (over: Partial<ClientMovementRow> = {}): ClientMovementRow => ({
  id: 'm1', client_key: 'name:molino san jose', client_name: 'Molino San José', kind: 'payment', happened_on: '2026-10-12', amount: 5000, currency: 'UYU',
  method: 'cheque', notes: '', deleted_at: null, created_at: '2026-10-12T15:00:00Z', created_by: 'u1', updated_at: '2026-10-12T15:00:00Z', updated_by: 'u1', ...over,
});
const move = (over: Partial<ClientMovementRow> = {}): ClientMovement => clientMovementFromRow(row(over));

describe('clientes', () => {
  it('juntan el nombre escrito de cualquier manera, y la dirección de su página es su clave', () => {
    expect(clientName('  MOLINO  san josé ')).toBe('molino san jose');
    expect(clientKey('Molino San José')).toBe('name:molino san jose');
    expect(clientKey('molino  SAN JOSE')).toBe(clientKey('Molino San José'));
    expect(clientKey('   ')).toBeNull();
    expect(clientKey(null)).toBeNull();
    expect(parseClientKey('name:molino san jose')).toBe('name:molino san jose');
    // An address typed by hand, with capitals or accents, is the same client.
    expect(parseClientKey('name:Molino San José')).toBe('name:molino san jose');
    // The trips billed without a client have their page too.
    expect(parseClientKey(NO_CLIENT)).toBe(NO_CLIENT);
    expect(parseClientKey('name:   ')).toBeNull();
    expect(parseClientKey('id:12')).toBeNull();
    expect(parseClientKey(undefined)).toBeNull();
  });

  it('lee cada cobro y saldo inicial con la clave como la arma hoy', () => {
    const m = move({ client_key: 'name:MOLINO  san josé', client_name: '  Molino   San José ', method: 'transferencia', notes: 'Transferencia BROU' });
    expect(m).toMatchObject({ clientKey: 'name:molino san jose', clientName: 'Molino San José', kind: 'payment', day: '2026-10-12', amount: 5000, method: 'transferencia', deleted: false });
    expect(move({ kind: 'opening', method: null, amount: -1200, currency: 'USD', deleted_at: '2026-10-13T10:00:00Z' })).toMatchObject({ kind: 'opening', amount: -1200, currency: 'USD', method: null, deleted: true });
    expect(move({ method: 'trueque' }).method).toBeNull();
  });

  it('salen de los viajes, de la lista de la app y de los cobros, sin los viajes en la papelera', () => {
    const trips = [
      trip({ day: '2026-10-01', client: 'molino san jose' }),
      trip({ day: '2026-10-05', client: 'Molino San José' }),
      trip({ day: '2026-10-09', client: 'MOLINO  SAN JOSE' }),
      trip({ day: '2026-10-11', client: 'Molino San José' }),
      trip({ day: '2026-10-12', client: 'Molino San José', deleted: true }),
      trip({ day: '2026-10-03', client: 'Cooperativa Agraria', amount: 1250.5, currency: 'USD' }),
      // Without saying the client: apart, without an account, when billed or waiting for its amount. An empty return or
      // a trip on the road without either: nowhere.
      trip({ day: '2026-10-08', client: null, amount: 3000 }),
      trip({ day: '2026-10-07', client: null, amount: null }),
      trip({ day: '2026-10-08', client: null, amount: null, loadType: 'empty' }),
      trip({ day: '2026-10-08', client: null, amount: null, active: true }),
    ];
    const clients = groupClients(trips, [move({ client_key: 'name:navios', client_name: 'Navios', happened_on: '2026-10-14', amount: 700 })], ['Cliente Uno', ' cooperativa  agraria ']);
    expect(clients.map((c) => [c.name, c.key])).toEqual([
      ['Navios', 'name:navios'],
      ['Molino San José', 'name:molino san jose'],
      ['Cliente sin indicar', NO_CLIENT],
      ['cooperativa agraria', 'name:cooperativa agraria'],
      ['Cliente Uno', 'name:cliente uno'],
    ]);
    const molino = clients[1]!;
    // The way written most often; the trip in the trash does not count.
    expect(molino.trips).toHaveLength(4);
    expect(molino.lastTrip).toBe('2026-10-11');
    expect(molino.listed).toBe(false);
    // The app's list names its clients, even when a trip writes them another way.
    expect(clients[3]).toMatchObject({ listed: true, lastTrip: '2026-10-03' });
    expect(clients[4]).toMatchObject({ listed: true, trips: [], accounts: [], lastDay: null });
    expect(clients[2]).toMatchObject({ trips: [expect.objectContaining({ amount: 3000 }), expect.objectContaining({ amount: null })], accounts: [] });
    // The one waiting for its amount counts among the trips to complete, with the clients' ones.
    expect(clientWithoutAmount(clients[2]!)).toBe(1);
    expect(withoutAmount(clients)).toBe(1);
    // A client with only a collection: named by it, with an account in its favor.
    expect(clients[0]!.accounts).toEqual([expect.objectContaining({ currency: 'UYU', paid: 700, balance: -700 })]);
  });

  it('el nombre escrito de varias maneras empata en la más vieja', () => {
    const clients = groupClients([trip({ day: '2026-10-02', client: 'MOLINO SAN JOSE' }), trip({ day: '2026-10-04', client: 'Molino San José' })], [], []);
    expect(clients[0]!.name).toBe('MOLINO SAN JOSE');
  });

  it('un saldo inicial por moneda: si aparecen dos, gana el más nuevo; los anulados no cuentan', () => {
    const clients = groupClients([], [
      move({ id: 'o1', kind: 'opening', method: null, amount: 100, updated_at: '2026-10-01T10:00:00Z' }),
      move({ id: 'o2', kind: 'opening', method: null, amount: 200, updated_at: '2026-10-02T10:00:00Z' }),
      move({ id: 'o3', kind: 'opening', method: null, amount: 300, currency: 'USD', deleted_at: '2026-10-03T10:00:00Z' }),
      move({ id: 'p1', deleted_at: '2026-10-03T10:00:00Z' }),
    ], []);
    expect(clients[0]!.openings.map((o) => o.id)).toEqual(['o2']);
    expect(clients[0]!.payments).toEqual([]);
    expect(clients[0]!.accounts.map((a) => [a.currency, a.balance])).toEqual([['UYU', 200]]);
  });
});

describe('cuenta de cada cliente', () => {
  it('el saldo inicial, los viajes que suman y los cobros que restan, en orden y con el saldo de cada línea', () => {
    const client = groupClients(
      [
        trip({ day: '2026-09-28', amount: 9000 }),
        trip({ day: '2026-10-05', amount: 38500 }),
        trip({ day: '2026-10-10', amount: 12000 }),
        trip({ day: '2026-10-03', amount: 5000 }),
      ],
      [
        move({ id: 'o1', kind: 'opening', method: null, happened_on: '2026-10-03', amount: 15000 }),
        move({ id: 'p0', happened_on: '2026-10-01', amount: 9000 }),
        move({ id: 'p1', happened_on: '2026-10-05', amount: 20000, created_at: '2026-10-05T18:00:00Z' }),
        move({ id: 'p2', happened_on: '2026-10-11', amount: 30000.5 }),
      ],
      [],
    )[0]!;
    const s = statement(client, 'UYU');
    // The trip and the collection before the opening are inside it; the ones of its day count after it.
    expect(s.earlier).toBe(2);
    expect(s.lines.map((l) => [l.day, l.kind, l.amount, l.balance])).toEqual([
      ['2026-10-03', 'opening', 15000, 15000],
      ['2026-10-03', 'trip', 5000, 20000],
      ['2026-10-05', 'trip', 38500, 58500],
      ['2026-10-05', 'payment', -20000, 38500],
      ['2026-10-10', 'trip', 12000, 50500],
      ['2026-10-11', 'payment', -30000.5, 20499.5],
    ]);
    expect(s).toMatchObject({ billed: 55500, paid: 50000.5, balance: 20499.5, withoutAmount: 0 });
    // The account is the statement without its lines: they never disagree.
    expect(account(client, 'UYU')).toEqual({ currency: 'UYU', opening: client.openings[0], earlier: 2, billed: 55500, paid: 50000.5, balance: 20499.5, withoutAmount: 0 });
    expect(client.accounts).toEqual([account(client, 'UYU')]);
  });

  it('sin saldo inicial, la cuenta empieza con el primer viaje; pesos y dólares nunca se suman', () => {
    const client = groupClients([trip({ amount: 1250.5, currency: 'USD' }), trip({ amount: 8000 })], [move({ currency: 'USD', amount: 1000, happened_on: '2026-10-14' })], [])[0]!;
    expect(client.accounts.map((a) => [a.currency, a.billed, a.paid, a.balance])).toEqual([
      ['UYU', 8000, 0, 8000],
      ['USD', 1250.5, 1000, 250.5],
    ]);
    expect(statement(client, 'USD').lines.map((l) => l.balance)).toEqual([1250.5, 250.5]);
  });

  it('un saldo a favor del cliente resta, y los viajes lo van usando', () => {
    const client = groupClients([trip({ day: '2026-10-06', amount: 500 })], [move({ kind: 'opening', method: null, happened_on: '2026-10-01', amount: -1200 })], [])[0]!;
    expect(statement(client, 'UYU').lines.map((l) => l.balance)).toEqual([-1200, -700]);
  });

  it('los viajes sin importe no suman: la oficina completa los terminados con carga; los vacíos y los que van en viaje no', () => {
    const trips = [
      trip({ amount: null }),
      trip({ amount: 0 }),
      trip({ amount: null, source: 'manual', loadType: null }),
      trip({ amount: null, active: true }),
      trip({ amount: null, loadType: 'empty' }),
      trip({ amount: 4000 }),
    ];
    expect(trips.map((t) => missingAmount(t))).toEqual([true, true, true, false, false, false]);
    expect(billedAmount(trips[1]!)).toBeNull();
    const client = groupClients(trips, [], [])[0]!;
    const s = statement(client, 'UYU');
    expect(s.lines.filter((l) => l.amount === null)).toHaveLength(5);
    expect(s).toMatchObject({ billed: 4000, balance: 4000, withoutAmount: 3 });
    expect(withoutAmount([client])).toBe(3);
  });

  it('un viaje sin fecha queda dentro del saldo inicial; sin saldo va primero', () => {
    const undated = trip({ departureAt: null, amount: 100 });
    const withOpening = groupClients([undated], [move({ kind: 'opening', method: null, amount: 50 })], [])[0]!;
    expect(statement(withOpening, 'UYU')).toMatchObject({ earlier: 1, balance: 50 });
    const without = groupClients([undated, trip({ amount: 200 })], [], [])[0]!;
    expect(statement(without, 'UYU').lines.map((l) => [l.day, l.balance])).toEqual([
      ['', 100],
      ['2026-10-10', 300],
    ]);
  });
});

describe('totales de cobros', () => {
  const clients = groupClients(
    [
      trip({ day: '2026-10-02', amount: 38500 }),
      trip({ day: '2026-09-20', amount: 10000 }),
      trip({ day: '2026-10-03', client: 'Cooperativa Agraria', amount: 1250.5, currency: 'USD' }),
      trip({ day: '2026-10-04', client: null, amount: 999 }),
      trip({ day: '2026-10-05', client: 'Navios', amount: null }),
    ],
    [
      move({ happened_on: '2026-10-12', amount: 15000 }),
      move({ id: 'm2', client_key: 'name:cooperativa agraria', client_name: 'Cooperativa Agraria', happened_on: '2026-10-14', amount: 1000, currency: 'USD', method: 'transferencia', notes: 'Transferencia Itaú' }),
      move({ id: 'm3', client_key: 'name:navios', client_name: 'Navios', happened_on: '2026-10-11', amount: 5000, deleted_at: '2026-10-12T10:00:00Z' }),
      move({ id: 'm4', client_key: 'name:navios', client_name: 'Navios', kind: 'opening', method: null, happened_on: '2026-09-01', amount: 2000 }),
      move({ id: 'm5', client_key: 'name:sucesores', client_name: 'Sucesores', happened_on: '2026-10-13', amount: 300 }),
    ],
    [],
  );

  it('lo facturado y lo cobrado en un período, sin los viajes sin cliente ni los cobros anulados', () => {
    expect(periodSums(clients, '2026-10-01', '2026-10-31')).toEqual({ billed: { UYU: 38500, USD: 1250.5 }, trips: 2, paid: { UYU: 15300, USD: 1000 }, payments: 3 });
    expect(periodSums(clients)).toMatchObject({ billed: { UYU: 48500, USD: 1250.5 }, trips: 3 });
  });

  it('lo que deben los clientes y lo que tienen a favor, por moneda: una cuenta no paga otra', () => {
    expect(clientBalances(clients)).toEqual({ owed: { UYU: 35500, USD: 250.5 }, credit: { UYU: 300, USD: 0 }, owing: 3 });
    expect(withoutAmount(clients)).toBe(1);
  });

  it('busca el cliente escrito de cualquier manera', () => {
    expect(filterClients(clients, 'COOPERATIVA agraria').map((c) => c.key)).toEqual(['name:cooperativa agraria']);
    expect(filterClients(clients, 'jose').map((c) => c.key)).toEqual(['name:molino san jose']);
    expect(filterClients(clients, '')).toHaveLength(clients.length);
  });

  it('los cobros del período, y los anulados aparte con los saldos iniciales anulados', () => {
    const movements = [
      move({ id: 'a', happened_on: '2026-10-12' }),
      move({ id: 'b', happened_on: '2026-10-14', method: 'transferencia', notes: 'Transferencia Itaú' }),
      move({ id: 'c', happened_on: '2026-09-30' }),
      move({ id: 'd', kind: 'opening', method: null, happened_on: '2026-10-01' }),
      move({ id: 'e', happened_on: '2026-10-11', deleted_at: '2026-10-12T10:00:00Z' }),
      move({ id: 'f', kind: 'opening', method: null, happened_on: '2026-10-02', deleted_at: '2026-10-12T10:00:00Z' }),
    ];
    const names = new Map([['name:molino san jose', 'Molino San José del Este']]);
    expect(filterCollections(movements, { from: '2026-10-01', to: '2026-10-31' }).map((m) => m.id)).toEqual(['b', 'a']);
    expect(filterCollections(movements, { from: '2026-10-01', to: '2026-10-31', annulled: true }).map((m) => m.id)).toEqual(['e', 'f']);
    expect(filterCollections(movements, { q: 'itau' }).map((m) => m.id)).toEqual(['b']);
    expect(filterCollections(movements, { q: 'cheque' }).map((m) => m.id)).toEqual(['a', 'c']);
    // By the name the screens show, too.
    expect(filterCollections(movements, { q: 'del este' }).map((m) => m.id)).toEqual([]);
    expect(filterCollections(movements, { q: 'del este', names }).map((m) => m.id)).toEqual(['b', 'a', 'c']);
    expect(collectionTotals(filterCollections(movements))).toEqual({ count: 3, amounts: { UYU: 15000, USD: 0 } });
  });
});

describe('formulario de cobros y saldos iniciales', () => {
  const today = '2026-10-15';

  it('arranca vacío para un cliente, o como está el que se corrige', () => {
    expect(collectionFormValues(null, 'Molino San José', today, 'USD')).toEqual({ client: 'Molino San José', date: today, amount: '', currency: 'USD', method: '', notes: '', side: 'debt' });
    const opening = move({ kind: 'opening', method: null, amount: -1250.5, currency: 'USD', happened_on: '2026-10-01', notes: 'Adelanto' });
    expect(collectionFormValues(opening, 'Molino San José', today)).toEqual({ client: 'Molino San José', date: '2026-10-01', amount: '1250,5', currency: 'USD', method: '', notes: 'Adelanto', side: 'credit' });
    const v = collectionFormValues(move(), 'Molino San José', today);
    expect(collectionFormChanged(v, { ...v })).toBe(false);
    expect(collectionFormChanged(v, { ...v, amount: '5001' })).toBe(true);
  });

  it('pide el cliente, una fecha que no sea futura, el importe y cómo se cobró', () => {
    const empty = { client: '  ', date: '', amount: '', currency: 'UYU' as const, method: '' as const, notes: '', side: 'debt' as const };
    const check = validateCollectionForm('payment', empty, today);
    expect(check.ok).toBe(false);
    expect(check.errors).toEqual({ client: 'Elegí o escribí el cliente.', date: 'Elegí la fecha.', amount: 'Escribí cuánto se cobró.', method: 'Elegí cómo se cobró.' });
    const bad = validateCollectionForm('payment', { ...empty, client: 'x'.repeat(201), date: '2026-10-16', amount: '0', method: 'cheque', notes: 'y'.repeat(501) }, today);
    expect(bad.errors).toEqual({ client: 'Hasta 200 letras.', date: 'La fecha no puede ser posterior a hoy.', amount: 'El cobro tiene que ser mayor que cero.', notes: 'Hasta 500 letras.' });
    expect(validateCollectionForm('payment', { ...empty, client: 'Navios', date: today, amount: '100.000.000', method: 'efectivo' }, today).errors.amount).toBe('Es demasiado grande. Revisá el número.');
    // The database takes days from 2000 on: an older one is said in the form, not refused when saving.
    expect(validateCollectionForm('payment', { ...empty, client: 'Navios', date: '1999-12-31', amount: '100', method: 'efectivo' }, today).errors).toEqual({ date: 'La fecha no puede ser anterior al 01/01/2000.' });
    expect(validateCollectionForm('payment', { ...empty, client: 'Navios', date: '2000-01-01', amount: '100', method: 'efectivo' }, today).ok).toBe(true);
    // An opening balance of zero is fine: the account starts that day from nothing. It has no form of payment.
    const zero = validateCollectionForm('opening', { ...empty, client: 'Navios', date: today, amount: '0' }, today);
    expect(zero.ok && zero.payload).toMatchObject({ amount: 0, method: null });
    expect(validateCollectionForm('opening', { ...empty, client: 'Navios', date: today }, today).errors.amount).toBe('Escribí el saldo. Si no hay saldo, poné 0.');
  });

  it('guarda el cliente con su clave, el importe en centésimos y el saldo a favor en negativo', () => {
    const check = validateCollectionForm('payment', { client: '  MOLINO  san josé ', date: '2026-10-14', amount: '15.000,556', currency: 'UYU', method: 'cheque', notes: ' Cheque BROU 4521 ', side: 'debt' }, today);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.payload).toEqual({ clientKey: 'name:molino san jose', clientName: 'MOLINO san josé', date: '2026-10-14', amount: 15000.56, currency: 'UYU', method: 'cheque', notes: 'Cheque BROU 4521' });
    const r = clientMovementRow('payment', check.payload);
    expect(r).toEqual({ client_key: 'name:molino san jose', client_name: 'MOLINO san josé', kind: 'payment', happened_on: '2026-10-14', amount: 15000.56, currency: 'UYU', method: 'cheque', notes: 'Cheque BROU 4521' });
    // What the database gives back after a save tried again is that save, or one with other data.
    expect(sameClientMovement(row({ ...r, amount: 15000.56 }), r)).toBe(true);
    expect(sameClientMovement(row({ ...r, amount: 15000 }), r)).toBe(false);
    expect(sameClientMovement(row({ ...r, notes: '' }), r)).toBe(false);
    const credit = validateCollectionForm('opening', { client: 'Navios', date: '2026-10-01', amount: '1.200', currency: 'USD', method: 'cheque', notes: '', side: 'credit' }, today);
    expect(credit.ok && clientMovementRow('opening', credit.payload)).toMatchObject({ kind: 'opening', amount: -1200, currency: 'USD', method: null });
  });
});
