// The tank of a truck in a dialog: its capacity, consumption and alert, or what it has now, measured or full. A
// measurement starts the estimate again from here; if someone else saved the tank meanwhile, nothing is overwritten.
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ConflictError, describeWriteError, fetchTankTrips } from '../data/api';
import { type TankRow, useMeasureTank, useSaveTank } from '../data/tanks';
import { dayInZone, formatDay } from '../lib/dates';
import { decimal } from '../lib/format';
import type { Receipt } from '../lib/fuel';
import { roadVehicleKey } from '../lib/road';
import { defaultWarning, kmPerLiter, type TankFormValues, tankFormValues, validateMeasurement, validateTankForm } from '../lib/tanks';
import { parseNumber } from '../lib/numbers';
import { Icon } from './Icon';

interface Common {
  row: TankRow;
  onClose: () => void;
  onDone: (text: string) => void;
  onConflict: () => void;
}

/** The dialog both forms share: it opens itself, and closing with changes asks first. */
function Dialog({ title, intro, busy, dirty, error, onClose, onSubmit, children }: { title: string; intro: ReactNode; busy: boolean; dirty: boolean; error: string | null; onClose: () => void; onSubmit: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    form.current?.querySelector<HTMLElement>('.form-body input')?.focus();
  }, []);
  const requestClose = () => {
    if (busy) return;
    if (dirty) setLeaving(true);
    else onClose();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) onSubmit();
  };
  return (
    <dialog
      ref={dialog}
      className="form-dialog form-dialog-small"
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClose={onClose}
    >
      <form ref={form} noValidate onSubmit={submit}>
        <header>
          <h2 id={`${id}-title`}>{title}</h2>
          <button type="button" className="btn btn-icon" aria-label="Cerrar sin guardar" onClick={requestClose} disabled={busy}>
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="form-body">
          <p className="hint form-intro">{intro}</p>
          {error && (
            <p className="form-error" role="alert">
              <Icon name="warning" size={18} /> {error}
            </p>
          )}
          {children}
        </div>
        {leaving ? (
          <footer className="form-leave" role="alert">
            <span>Hay cambios sin guardar: si salís, se pierden.</span>
            <button type="button" className="btn" onClick={() => setLeaving(false)}>
              Seguir editando
            </button>
            <button type="button" className="btn btn-danger" onClick={onClose}>
              Salir sin guardar
            </button>
          </footer>
        ) : (
          <footer>
            <button type="button" className="btn" onClick={requestClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className={`btn btn-primary${busy ? ' is-busy' : ''}`} disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </footer>
        )}
      </form>
    </dialog>
  );
}

const preview = (raw: string, unit: string) => {
  const n = parseNumber(raw);
  return n.ok && n.value !== null ? `Se guarda: ${decimal(n.value, 2)}${unit}` : undefined;
};

/** Capacity, kilometres per litre and the alert. */
export function TankSettingsDialog({ row, onClose, onDone, onConflict }: Common) {
  const save = useSaveTank();
  const id = useId();
  // The tank as it was when the form opened: a read meanwhile must not hand a newer version to the stale values.
  const [base] = useState(row.settings);
  const [initial] = useState(() => tankFormValues(base));
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof TankFormValues, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const set = (field: keyof TankFormValues, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const submit = async () => {
    setFormError(null);
    const check = validateTankForm(values);
    setErrors(check.errors);
    if (!check.row) return setFormError('Revisá los campos marcados.');
    if (base?.updatedAt && !dirty) return onClose();
    try {
      await save.mutateAsync({ settings: base, row: { vehicle_key: row.key, vehicle_name: row.name, ...check.row } });
      onDone(`Tanque de ${row.name} guardado.`);
    } catch (err) {
      if (err instanceof ConflictError) return onConflict();
      console.error(err);
      setFormError(describeWriteError(err, 'tanques'));
    }
  };

  const capacity = parseNumber(values.capacity);
  const field = (name: keyof TankFormValues, label: string, note: ReactNode) => (
    <div className="field">
      <label htmlFor={`${id}-${name}`}>{label}</label>
      <input
        id={`${id}-${name}`}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={values[name]}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={`${id}-${name}-note`}
        onChange={(e) => set(name, e.target.value)}
      />
      <p className={errors[name] ? 'field-error' : 'hint'} id={`${id}-${name}-note`}>
        {errors[name] ?? note}
      </p>
    </div>
  );
  const measured = row.measured;
  return (
    <Dialog
      title={`Tanque de ${row.name}`}
      intro="Con esto se estima cuánto combustible tiene: arranca en la última medición o en la última carga con el tanque lleno, suma las cargas y resta los kilómetros del GPS."
      busy={save.isPending}
      dirty={dirty}
      error={formError}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <div className="form-grid">
        {field('capacity', 'Le entran (litros)', preview(values.capacity, ' L') ?? 'Lo que le entra al tanque lleno.')}
        {field(
          'kmPerLiter',
          'Kilómetros por litro',
          <>
            {preview(values.kmPerLiter, ' km por litro') ?? 'Un camión suele hacer entre 2 y 4 km por litro.'}
            {measured && (
              <>
                {' '}
                Entre los dos últimos tanques llenos hizo {decimal(kmPerLiter(measured.litersPer100), 2)} km por litro en {decimal(measured.km, 0)} km.{' '}
                <button type="button" className="link-button" onClick={() => set('kmPerLiter', String(Math.round(kmPerLiter(measured.litersPer100) * 100) / 100).replace('.', ','))}>
                  Usar ese
                </button>
              </>
            )}
          </>,
        )}
        {field(
          'warning',
          'Avisar con (litros)',
          preview(values.warning, ' L') ?? (capacity.ok && capacity.value ? `Vacío: avisa con el 20 % del tanque, ${decimal(defaultWarning(capacity.value), 0)} L.` : 'Vacío: avisa con el 20 % del tanque.'),
        )}
      </div>
    </Dialog>
  );
}

/**
 * What the tank has now: measured, or full. It keeps the trips and loads it already knows, so the estimate counts only
 * what comes after.
 */
export function TankMeasureDialog({ row, receipts, onClose, onDone, onConflict }: Common & { receipts: readonly Receipt[] }) {
  const measure = useMeasureTank();
  const id = useId();
  const [base] = useState(row.reference);
  const settings = row.settings;
  const [full, setFull] = useState(true);
  const [liters, setLiters] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const busy = measure.isPending || reading;
  if (!settings) return null;

  const submit = async () => {
    setFormError(null);
    const check = full ? { liters: settings.capacity, error: null } : validateMeasurement(liters, settings.capacity);
    setError(check.error);
    if (check.liters === null) return setFormError('Revisá los litros.');
    try {
      // The trips as they are now: their kilometres so far are inside the measurement.
      setReading(true);
      const trips = await fetchTankTrips(new Date(Date.now() - 7 * 86_400_000).toISOString()).finally(() => setReading(false));
      const mine = (label: string | null) => label !== null && label !== '' && roadVehicleKey(label) === row.key;
      const now = new Date().toISOString();
      await measure.mutateAsync({
        before: base?.updated_at ?? null,
        row: {
          vehicle_key: row.key,
          vehicle_name: row.name,
          capacity_l: settings.capacity,
          liters: check.liters,
          consumption: settings.consumption,
          warning_l: settings.warning,
          trip_meters: Object.fromEntries(trips.filter((t) => mine(t.vehicle)).map((t) => [t.id, t.meters])),
          receipt_liters: Object.fromEntries(
            receipts
              .filter((r) => !r.archived && mine(r.vehicle) && r.liters !== null && r.recordedAt !== null && Date.parse(r.recordedAt) > Date.now() - 7 * 86_400_000)
              .map((r) => [r.id, r.liters as number]),
          ),
          measured_at: now,
          updated_at: base?.updated_at ?? now,
        },
      });
      onDone(full ? `Tanque de ${row.name}: lleno desde ahora.` : `Tanque de ${row.name}: ${decimal(check.liters, 1)} L desde ahora.`);
    } catch (err) {
      if (err instanceof ConflictError) return onConflict();
      console.error(err);
      setFormError(describeWriteError(err, 'tanques'));
    }
  };

  return (
    <Dialog
      title={`Medir el tanque de ${row.name}`}
      intro={`Desde ahora el cálculo arranca con lo que tiene. ${base ? `La última medición fue el ${formatDay(dayInZone(Date.parse(base.measured_at)))}.` : ''}`}
      busy={busy}
      dirty={!full || liters !== ''}
      error={formError}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      <fieldset>
        <legend>¿Cuánto tiene ahora?</legend>
        <label className="check-row">
          <input type="radio" name={`${id}-level`} checked={full} onChange={() => setFull(true)} />
          Está lleno ({decimal(settings.capacity, 0)} L)
        </label>
        <label className="check-row">
          <input type="radio" name={`${id}-level`} checked={!full} onChange={() => setFull(false)} />
          Tiene otra cantidad
        </label>
        {!full && (
          <div className="field">
            <label htmlFor={`${id}-liters`}>Litros que tiene</label>
            <input
              id={`${id}-liters`}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={liters}
              aria-invalid={error ? true : undefined}
              aria-describedby={`${id}-liters-note`}
              onChange={(e) => {
                setLiters(e.target.value);
                setError(null);
              }}
            />
            <p className={error ? 'field-error' : 'hint'} id={`${id}-liters-note`}>
              {error ?? preview(liters, ' L') ?? 'Lo que marca el reloj del tanque o la varilla.'}
            </p>
          </div>
        )}
      </fieldset>
    </Dialog>
  );
}
