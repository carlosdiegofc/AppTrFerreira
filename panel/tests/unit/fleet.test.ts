import { describe, expect, it } from 'vitest';
import { type ActiveTrip, canonical, catalogTrucks, type FinishedTrip, fleetCounts, fleetUnits, lastTripByTruck, tripState, truck, truckParts, withLivePositions } from '../../src/lib/fleet';

const fleet = [
  { model: 'Ford Cargo 1722', plate: 'GTP4265' },
  { model: 'Mercedes Benz 1618', plate: 'ATM2661' },
  { model: 'Mercedes Benz 1630', plate: 'GTP1393' },
  { model: 'Leyland', plate: 'HTP1545' },
];
const NOW = Date.parse('2026-10-18T15:00:00Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

function trip(over: Partial<ActiveTrip>): ActiveTrip {
  return { id: 't1', driver_id: 'd1', driver_name: 'Chofer Uno', vehicle: 'Ford Cargo 1722 · GTP4265', started_at: minutesAgo(90), paused: false, load_type: 'loaded', distance_meters: 42_500, last: { latitude: -34.9, longitude: -56.16, speed_kmh: 72, recorded_at: minutesAgo(1) }, ...over };
}

describe('truck labels (same rules as FleetStats.kt)', () => {
  it('splits model and plate', () => {
    expect(truckParts('Ford Cargo 1722 · GTP4265')).toEqual({ model: 'Ford Cargo 1722', plate: 'GTP4265' });
    expect(truckParts('Ford Cargo')).toEqual({ model: 'Ford Cargo', plate: '' });
  });
  it('a trip without truck is not a truck', () => {
    expect(truck('Sin camión asignado')).toBeNull();
    expect(truck('  ')).toBeNull();
    expect(truck('Leyland · HTP1545')).toBe('Leyland · HTP1545');
  });
  it('a plate decides on its own, even with another model written', () => {
    expect(canonical('Otro modelo · gtp-4265', fleet)).toBe('Ford Cargo 1722 · GTP4265');
  });
  it('older labels without plate count for the only truck of that model', () => {
    expect(canonical('Ford Cargo', fleet)).toBe('Ford Cargo 1722 · GTP4265');
    expect(canonical('Ford Cargo 1722', fleet)).toBe('Ford Cargo 1722 · GTP4265');
    expect(canonical('Mercedes-Benz 1618', fleet)).toBe('Mercedes Benz 1618 · ATM2661');
  });
  it('a model that names two trucks keeps its own label', () => {
    expect(canonical('Mercedes Benz', fleet)).toBe('Mercedes Benz');
  });
  it('reads the catalog as jsonb or as text', () => {
    const data = { equipos: [{ id: 'a', tipo: 'Leyland', matriculaCamion: 'HTP1545' }, { id: 'b', tipo: ' ', matriculaCamion: '' }] };
    expect(catalogTrucks(data)).toEqual([{ model: 'Leyland', plate: 'HTP1545' }]);
    expect(catalogTrucks(JSON.stringify(data))).toEqual([{ model: 'Leyland', plate: 'HTP1545' }]);
    expect(catalogTrucks(null)).toEqual([]);
    expect(catalogTrucks('{no es json')).toEqual([]);
  });
});

describe('state of a truck on a trip (same rules as the owner fleet screen)', () => {
  it('on the road from 5 km/h', () => {
    expect(tripState(trip({}), NOW)).toBe('moving');
    expect(tripState(trip({ last: { latitude: 0, longitude: 0, speed_kmh: 5, recorded_at: minutesAgo(2) } }), NOW)).toBe('moving');
  });
  it('stopped below 5 km/h or without speed', () => {
    expect(tripState(trip({ last: { latitude: 0, longitude: 0, speed_kmh: 4.9, recorded_at: minutesAgo(2) } }), NOW)).toBe('stopped');
    expect(tripState(trip({ last: { latitude: 0, longitude: 0, speed_kmh: null, recorded_at: minutesAgo(2) } }), NOW)).toBe('stopped');
  });
  it('without signal after 15 minutes or with no reading at all', () => {
    expect(tripState(trip({ last: { latitude: 0, longitude: 0, speed_kmh: 80, recorded_at: minutesAgo(15) } }), NOW)).toBe('moving');
    expect(tripState(trip({ last: { latitude: 0, longitude: 0, speed_kmh: 80, recorded_at: minutesAgo(16) } }), NOW)).toBe('nosignal');
    expect(tripState(trip({ last: null }), NOW)).toBe('nosignal');
  });
  it('paused wins over everything', () => {
    expect(tripState(trip({ paused: true, last: null }), NOW)).toBe('paused');
  });
});

describe('the whole fleet', () => {
  const finished = [
    { driver_name: 'Chofer Dos', vehicle: 'Leyland · HTP1545', ended_at: minutesAgo(300), arrival_lat: -34.48, arrival_lng: -57.84 },
    { driver_name: 'Chofer Tres', vehicle: 'Leyland · HTP1545', ended_at: minutesAgo(3000), arrival_lat: -33.0, arrival_lng: -56.0 },
  ];
  const active = [
    trip({ id: 'a', vehicle: 'Ford Cargo', last: { latitude: -34.9, longitude: -56.2, speed_kmh: 0, recorded_at: minutesAgo(3) } }),
    trip({ id: 'b', vehicle: 'Mercedes Benz 1630 · GTP1393', driver_name: 'Chofer Cuatro' }),
  ];
  const units = fleetUnits(active, finished, fleet, NOW);

  it('lists trucks on a trip first, on the road before stopped, then the idle ones', () => {
    expect(units.map((u) => [u.plate, u.state])).toEqual([
      ['GTP1393', 'moving'],
      ['GTP4265', 'stopped'],
      ['ATM2661', 'idle'],
      ['HTP1545', 'idle'],
    ]);
  });
  it('an older label still marks its truck as busy, so no truck shows twice', () => {
    expect(units.filter((u) => u.plate === 'GTP4265')).toHaveLength(1);
  });
  it('places an idle truck where its latest trip ended', () => {
    const leyland = units.find((u) => u.plate === 'HTP1545');
    expect(leyland).toMatchObject({ driver: 'Chofer Dos', lat: -34.48, lng: -57.84, at: Date.parse(minutesAgo(300)) });
    expect(units.find((u) => u.plate === 'ATM2661')).toMatchObject({ lat: null, lng: null, at: null });
  });
  it('counts like the app: stopped, paused and without signal are "detenidos"', () => {
    const more = fleetUnits([...active, trip({ id: 'c', vehicle: 'Sin camión asignado', paused: true }), trip({ id: 'd', vehicle: 'X · Y', last: null })], finished, fleet, NOW);
    expect(fleetCounts(more)).toEqual({ moving: 1, halted: 3, noSignal: 1, idle: 2 });
  });
});

describe('last trip of each truck (to place the ones without a trip)', () => {
  const ended = (driver: string, vehicle: string, day: number): FinishedTrip => ({ driver_name: driver, vehicle, ended_at: `2026-10-${day}T12:00:00Z`, arrival_lat: -34.9, arrival_lng: -56.1 });
  it('keeps the newest trip of each catalog truck, older labels included', () => {
    const found = lastTripByTruck([ended('Uno', 'Ford Cargo', 18), ended('Dos', 'Ford Cargo 1722 · GTP4265', 17), ended('Tres', 'Camión prestado', 16), ended('Cuatro', 'Leyland · HTP1545', 15)], fleet);
    expect([...found.keys()]).toEqual(['Ford Cargo 1722 · GTP4265', 'Leyland · HTP1545']);
    expect(found.get('Ford Cargo 1722 · GTP4265')?.driver_name).toBe('Uno');
  });
  it('a later page only adds the trucks still missing', () => {
    const found = lastTripByTruck([ended('Uno', 'Leyland · HTP1545', 18)], fleet);
    lastTripByTruck([ended('Dos', 'Leyland · HTP1545', 10), ended('Tres', 'Mercedes Benz 1618 · ATM2661', 9)], fleet, found);
    expect(found.get('Leyland · HTP1545')?.driver_name).toBe('Uno');
    expect(found.get('Mercedes Benz 1618 · ATM2661')?.driver_name).toBe('Tres');
  });
});

describe('live positions (one row per driver, updated with each reading)', () => {
  const started = '2026-10-18T12:00:00Z';
  const pos = (driver_id: string, recorded_at: string, speed_kmh: number | null = 80) => ({ driver_id, latitude: -33.1, longitude: -57.2, speed_kmh, recorded_at });

  it('gives each trip in progress its driver\'s latest position', () => {
    const [t] = withLivePositions([trip({ driver_id: 'd1', started_at: started })], [pos('d2', '2026-10-18T12:05:00Z'), pos('d1', '2026-10-18T12:04:58Z', 62)]);
    expect(t?.last).toEqual({ latitude: -33.1, longitude: -57.2, speed_kmh: 62, recorded_at: '2026-10-18T12:04:58Z' });
  });

  it('a position from before the trip, like where the previous trip ended, is not this trip\'s', () => {
    const [t] = withLivePositions([trip({ driver_id: 'd1', started_at: started })], [pos('d1', '2026-10-18T11:30:00Z')]);
    expect(t?.last).toBeNull();
    expect(withLivePositions([trip({ driver_id: 'd1', started_at: started })], [])[0]?.last).toBeNull();
  });
});
