// The freight simulator (decisions of 26/10/2026 and 27/10/2026), in Gastos y finanzas: what a freight costs and what to
// charge for it. The fuel of the kilometres with cargo and back at the truck's consumption and the price of diesel, the
// route's tolls and what the driver is paid for the trip; the margin goes on top of the cost. It only calculates:
// nothing is saved, and leaving the page clears it.
import { type ReactNode, useId, useMemo, useState } from 'react';
import { FinanceTabs } from '../components/FinanceTabs';
import { Icon } from '../components/Icon';
import { PageHead } from '../components/ui';
import { useFuel, useNow } from '../data/hooks';
import { useTanks } from '../data/tanks';
import { dayInZone, formatDay } from '../lib/dates';
import { count, decimal, money } from '../lib/format';
import { EMPTY_SIMULATOR, lastDieselPrice, simulate, type SimulatorField, type SimulatorValues } from '../lib/simulator';
import { kmPerLiter } from '../lib/tanks';

/** A number as the form writes it: «2,95». */
const typed = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/** What the price needs, as the result asks for it while it is missing. */
const REQUIRED: readonly [SimulatorField, string][] = [
  ['loadedKm', 'los kilómetros'],
  ['kmPerLiter', 'el consumo'],
  ['dieselPrice', 'el precio del gasoil'],
];

export function Simulador() {
  const id = useId();
  const fuel = useFuel();
  const tanks = useTanks();
  const [values, setValues] = useState<SimulatorValues>(EMPTY_SIMULATOR);
  const [truck, setTruck] = useState('');
  // The consumption the chosen truck brought: choosing one without it takes it away, but not one typed by hand.
  const [brought, setBrought] = useState<string | null>(null);
  const { quote, errors } = simulate(values);
  const set = (field: SimulatorField, value: string) => setValues((v) => ({ ...v, [field]: value }));

  // Each truck with a consumption to start from: the one measured between its last two full tanks, else its tank's.
  const trucks = useMemo(
    () =>
      (tanks.rows ?? [])
        .map((r) => {
          const measured = r.measured ? { km: kmPerLiter(r.measured.litersPer100), from: `medido entre los dos últimos tanques llenos, en ${count(Math.round(r.measured.km))} km` } : null;
          const own = r.settings ? { km: kmPerLiter(r.settings.consumption), from: 'el de su tanque en Combustible' } : null;
          return { key: r.key, name: r.name, consumption: measured ?? own };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [tanks.rows],
  );
  const chosen = trucks.find((t) => t.key === truck) ?? null;
  const today = dayInZone(useNow(60_000));
  const diesel = useMemo(() => lastDieselPrice(fuel.receipts, today), [fuel.receipts, today]);

  const chooseTruck = (key: string) => {
    setTruck(key);
    const t = trucks.find((x) => x.key === key);
    const value = t?.consumption ? typed(t.consumption.km) : null;
    if (value !== null) set('kmPerLiter', value);
    else if (brought !== null && values.kmPerLiter === brought) set('kmPerLiter', '');
    setBrought(value);
  };
  const startAgain = () => {
    setValues(EMPTY_SIMULATOR);
    setTruck('');
    setBrought(null);
  };

  const field = (name: SimulatorField, label: string, hint: ReactNode, unit?: string) => {
    // A field still empty does not complain: what is missing goes in the result.
    const error = values[name] !== '' ? errors[name] : undefined;
    return (
      <div className="field">
        <label htmlFor={`${id}-${name}`}>{label}</label>
        <div className={unit ? 'input-unit' : undefined}>
          <input
            id={`${id}-${name}`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={values[name]}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-${name}-note`}
            onChange={(e) => set(name, e.target.value)}
          />
          {unit && <span aria-hidden="true">{unit}</span>}
        </div>
        <p className={error ? 'field-error' : 'hint'} id={`${id}-${name}-note`}>
          {error ?? hint}
        </p>
      </div>
    );
  };

  const wrong = (Object.keys(errors) as SimulatorField[]).some((f) => values[f] !== '');
  const missing = REQUIRED.filter(([f]) => errors[f] !== undefined).map(([, what]) => what);

  return (
    <div className="page">
      <PageHead title="Gastos y finanzas" subtitle="Cuánto cuesta un flete y cuánto cobrarlo: el combustible, los peajes y lo que se le paga al chofer, con el margen sumado al costo. Calcula y no guarda nada." />
      <FinanceTabs />

      <div className="sim-grid">
        <section className="card card-body" aria-label="Datos del flete">
          <h2 className="card-title">El flete</h2>
          <div className="form-grid">
            <div className="field sim-truck">
              <label htmlFor={`${id}-truck`}>Camión</label>
              <select id={`${id}-truck`} value={truck} onChange={(e) => chooseTruck(e.target.value)} aria-describedby={`${id}-truck-note`}>
                <option value="">Sin elegir</option>
                {trucks.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name}
                  </option>
                ))}
              </select>
              <p className="hint" id={`${id}-truck-note`}>
                {chosen
                  ? chosen.consumption
                    ? `Trae su consumo: ${decimal(chosen.consumption.km, 2)} km por litro, ${chosen.consumption.from}.`
                    : 'Todavía no tiene un consumo: escribilo abajo, o cargalo en Combustible, en «Tanques».'
                  : 'Si lo elegís, trae su consumo.'}
              </p>
            </div>
            {field('loadedKm', 'Kilómetros con carga', 'La ida, cargado.', 'km')}
            {field('returnKm', 'Kilómetros de vuelta', 'El regreso; vacío si no hay nada.', 'km')}
            {field('kmPerLiter', 'Consumo', 'Kilómetros por litro: un camión suele hacer entre 2 y 4.', 'km/L')}
            {field(
              'dieselPrice',
              'Precio del gasoil',
              diesel ? (
                <>
                  Por litro. La última boleta en pesos: {money(diesel.price, 'UYU')} el litro, del {formatDay(diesel.date)}
                  {diesel.station ? ` en ${diesel.station}` : ''}.{' '}
                  {values.dieselPrice !== typed(diesel.price) && (
                    <button type="button" className="link-button" onClick={() => set('dieselPrice', typed(diesel.price))}>
                      Usar ese
                    </button>
                  )}
                </>
              ) : (
                'Por litro, en pesos.'
              ),
              '$/L',
            )}
            {field('tolls', 'Peajes de la ruta', 'En pesos, de ida y de vuelta.', '$')}
            {field('driverPay', 'Lo que se le paga al chofer', 'En pesos, por este viaje.', '$')}
            {field('margin', 'Margen', 'Lo que se suma al costo: con 20 %, un costo de $ 1.000 se cobra $ 1.200.', '%')}
          </div>
          <button type="button" className="btn btn-quiet sim-clear" onClick={startAgain}>
            <Icon name="undo" size={18} /> Empezar de nuevo
          </button>
        </section>

        <section className="card card-body sim-result" aria-label="Precio del flete" aria-live="polite">
          <h2 className="card-title">Lo que cuesta y lo que se cobra</h2>
          {quote ? (
            <>
              <div className="sim-price">
                <span>Precio a cobrar</span>
                <strong>{money(quote.price, 'UYU')}</strong>
                {quote.pricePerLoadedKm !== null && <small>{money(Math.round(quote.pricePerLoadedKm * 100) / 100, 'UYU')} por kilómetro con carga</small>}
              </div>
              <table className="sim-table">
                <tbody>
                  <tr>
                    <th scope="row">
                      Combustible
                      <small>
                        {decimal(quote.liters, 1)} litros para {count(quote.loadedKm + quote.returnKm)} km
                      </small>
                    </th>
                    <td>{money(quote.fuel, 'UYU')}</td>
                  </tr>
                  <tr>
                    <th scope="row">Peajes</th>
                    <td>{money(quote.tolls, 'UYU')}</td>
                  </tr>
                  <tr>
                    <th scope="row">Chofer</th>
                    <td>{money(quote.driverPay, 'UYU')}</td>
                  </tr>
                  <tr className="is-total">
                    <th scope="row">
                      Costo
                      <small>{money(Math.round(quote.costPerKm * 100) / 100, 'UYU')} por kilómetro recorrido</small>
                    </th>
                    <td>{money(quote.cost, 'UYU')}</td>
                  </tr>
                  <tr>
                    <th scope="row">Margen de {decimal(quote.margin, quote.margin % 1 === 0 ? 0 : 1)} %</th>
                    <td>{money(quote.profit, 'UYU')}</td>
                  </tr>
                  <tr className="is-total">
                    <th scope="row">Precio</th>
                    <td>{money(quote.price, 'UYU')}</td>
                  </tr>
                </tbody>
              </table>
            </>
          ) : (
            <p className="note">{wrong ? 'Revisá los datos marcados.' : `Para calcularlo, escribí ${missing.join(', ').replace(/, ([^,]*)$/, ' y $1')}.`}</p>
          )}
          <p className="note">No se guarda: al salir de la página se borra. Los gastos de cada camión, los sueldos y los gastos generales no entran: para eso está «Ganancia».</p>
        </section>
      </div>
    </div>
  );
}
