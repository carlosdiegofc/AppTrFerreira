import { describe, expect, it } from 'vitest';
import type { Receipt } from '../../src/lib/fuel';
import { EMPTY_SIMULATOR, lastDieselPrice, simulate, type SimulatorValues } from '../../src/lib/simulator';

const values = (over: Partial<SimulatorValues> = {}): SimulatorValues => ({ ...EMPTY_SIMULATOR, loadedKm: '300', returnKm: '300', kmPerLiter: '3', dieselPrice: '54,5', tolls: '1.800', driverPay: '4.500', margin: '20', ...over });

describe('simulate', () => {
  it('adds the fuel, the tolls and the driver, and the margin on top of the cost', () => {
    const { quote, errors } = simulate(values());
    expect(errors).toEqual({});
    expect(quote).toMatchObject({ liters: 200, fuel: 10900, tolls: 1800, driverPay: 4500, cost: 17200, margin: 20, profit: 3440, price: 20640 });
    expect(quote?.pricePerLoadedKm).toBeCloseTo(68.8);
    expect(quote?.costPerKm).toBeCloseTo(28.6667, 3);
  });

  it('works without a return, tolls, driver or margin', () => {
    const { quote } = simulate(values({ returnKm: '', tolls: '', driverPay: '', margin: '' }));
    expect(quote).toMatchObject({ liters: 100, fuel: 5450, cost: 5450, profit: 0, price: 5450 });
  });

  it('a return alone has no price per kilometre with cargo', () => {
    expect(simulate(values({ loadedKm: '', returnKm: '120' })).quote?.pricePerLoadedKm).toBeNull();
  });

  it('says what is missing or wrong', () => {
    expect(simulate(values({ loadedKm: '', returnKm: '' })).errors).toEqual({ loadedKm: 'Escribí los kilómetros del viaje.' });
    expect(simulate(values({ kmPerLiter: '0', dieselPrice: '' })).errors).toEqual({ kmPerLiter: 'Escribí cuántos kilómetros hace por litro.', dieselPrice: 'Escribí el precio del litro de gasoil.' });
    expect(simulate(values({ margin: '-5', tolls: 'mucho' })).errors).toEqual({ margin: 'No puede ser negativo.', tolls: 'Escribí solo números.' });
    expect(simulate(values({ loadedKm: '25.000' })).errors).toEqual({ loadedKm: 'Es demasiado grande. Revisá el número.' });
    expect(simulate(values({ loadedKm: '' })).quote).not.toBeNull();
  });
});

describe('lastDieselPrice', () => {
  const r = (over: Partial<Receipt>): Receipt => ({
    id: 'r',
    tripId: null,
    driverId: 'd',
    driverName: null,
    recordedAt: null,
    date: '2026-10-10',
    vehicle: null,
    stationKey: 'name:',
    station: 'Ancap Ruta 5 km 32',
    liters: 100,
    total: 5450,
    currency: 'UYU',
    fullTank: false,
    tripMeters: null,
    objectPath: null,
    archived: false,
    updatedAt: null,
    declared: { date: null, vehicle: null, stationId: null, station: null, liters: null, total: null, fullTank: null },
    panelData: {},
    ...over,
  });

  it('takes the last receipt in pesos with litres and amount', () => {
    expect(
      lastDieselPrice([
        r({ date: '2026-10-10', total: 5450 }),
        r({ date: '2026-10-12', total: 5600, station: 'Petrobras Salto', recordedAt: '2026-10-12T10:00:00Z' }),
        r({ date: '2026-10-12', total: 5500, recordedAt: '2026-10-12T09:00:00Z' }),
        r({ date: '2026-10-14', total: 300, currency: 'USD' }),
        r({ date: '2026-10-14', liters: null }),
        r({ date: '2026-10-14', archived: true }),
      ], '2026-10-14'),
    ).toEqual({ price: 56, date: '2026-10-12', station: 'Petrobras Salto' });
    expect(lastDieselPrice([], '2026-10-14')).toBeNull();
  });

  it('leaves out the receipts dated after today: a wrong date is no price to quote with', () => {
    const list = [r({ date: '2026-10-10', total: 5450 }), r({ date: '2026-10-12', total: 5600, station: 'Petrobras Salto' }), r({ date: '2026-10-15', total: 9000 })];
    expect(lastDieselPrice(list, '2026-10-14')).toEqual({ price: 56, date: '2026-10-12', station: 'Petrobras Salto' });
    // A receipt of today counts; only the ones after it do not.
    expect(lastDieselPrice(list, '2026-10-15')?.date).toBe('2026-10-15');
    expect(lastDieselPrice(list, '2026-10-09')).toBeNull();
  });
});
