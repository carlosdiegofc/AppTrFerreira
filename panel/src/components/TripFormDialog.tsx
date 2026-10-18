// The form of a trip, in a dialog: complete what the office needs of an app trip, or type a trip by hand. Same fields
// and rules as the current panel. Closing it with changes asks first; if someone else saved the trip meanwhile, nothing
// is overwritten and the page reads the trip again.
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ConflictError, describeWriteError } from '../data/api';
import { useCatalog, useFormSuggestions, useSaveTrip } from '../data/hooks';
import { formatDayTime } from '../lib/dates';
import { truckLabel } from '../lib/fleet';
import { decimal, number } from '../lib/format';
import { parseNumber } from '../lib/numbers';
import { type FormField, formChanged, formMode, formValues, LIMITS, type TripFormValues, validateTripForm } from '../lib/tripForm';
import { EMPTY_RETURN, type LatLng, type PanelTripRow, type Trip } from '../lib/trips';
import { Icon } from './Icon';

interface Props {
  /** The trip to complete or edit; null types a new one by hand. */
  trip: Trip | null;
  onClose: () => void;
  onSaved: (row: PanelTripRow) => void;
  /** Someone else saved the trip while it was open here: nothing was saved. */
  onConflict: () => void;
}

const samePlace = (a: LatLng | null, b: LatLng | null) => a !== null && b !== null && a[0] === b[0] && a[1] === b[1];
const unique = (values: readonly string[]) => [...new Set(values.filter((v) => v.trim() !== ''))].sort((a, b) => a.localeCompare(b, 'es'));

export function TripFormDialog({ trip: opened, onClose, onSaved, onConflict }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  // The trip as it was when the form opened: the page may read it again meanwhile, but the save has to be checked
  // against this version, so a change saved by someone else in between is never overwritten.
  const [trip] = useState(opened);
  const mode = formMode(trip);
  const [initial] = useState(() => formValues(trip));
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<FormField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const save = useSaveTrip();
  const catalog = useCatalog();
  const suggestions = useFormSuggestions(true);
  const dirty = formChanged(initial, values);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    // Typing starts in the first field, not on the close button.
    form.current?.querySelector<HTMLInputElement>('.form-body input')?.focus();
  }, []);

  const requestClose = () => {
    if (save.isPending) return;
    if (dirty) setLeaving(true);
    else onClose();
  };

  const set = <K extends keyof TripFormValues>(field: K, value: TripFormValues[K]) => {
    setValues((v) => ({ ...v, [field]: value }));
    // An old message goes away as soon as its field is edited.
    const shown = (field === 'origin' ? 'origin_name' : field === 'destination' ? 'destination_name' : field) as FormField;
    setErrors((e) => (shown in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== shown)) : e));
    setLeaving(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (save.isPending) return;
    setFormError(null);
    const check = validateTripForm(values, mode);
    setErrors(check.errors);
    if (!check.ok) {
      setFormError('Revisá los campos marcados.');
      form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    // A trip of the app is saved even unchanged the first time: that confirms what the phone sent.
    if (trip?.panelId && !dirty) {
      onClose();
      return;
    }
    try {
      onSaved(await save.mutateAsync({ trip, payload: check.payload }));
    } catch (err) {
      if (err instanceof ConflictError) {
        onConflict();
        return;
      }
      console.error(err);
      setFormError(describeWriteError(err));
    }
  };

  const fieldProps = (name: FormField) => ({
    id: `${id}-${name}`,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': `${id}-${name}-note`,
  });
  const field = (name: FormField, label: string, control: ReactNode, note?: ReactNode, { wide = false, extra }: { wide?: boolean; extra?: ReactNode } = {}) => (
    <div className={`field${wide ? ' field-full' : ''}`}>
      <label htmlFor={`${id}-${name}`}>{label}</label>
      {control}
      {extra}
      <p className={errors[name] ? 'field-error' : 'hint'} id={`${id}-${name}-note`}>
        {errors[name] ?? note}
      </p>
    </div>
  );
  const textInput = (name: 'order_number' | 'client' | 'product' | 'origin_name' | 'destination_name' | 'vehicle' | 'driver_name', list?: string) => (
    <input {...fieldProps(name)} type="text" value={values[name]} maxLength={LIMITS[name]} list={list ? `${id}-${list}` : undefined} autoComplete="off" onChange={(e) => set(name, e.target.value)} />
  );
  const numberInput = (name: 'billable_km' | 'kg' | 'amount', unit: string, decimals: number) => {
    const parsed = parseNumber(values[name]);
    const preview = parsed.ok ? (parsed.value === null ? '' : `Se guarda: ${decimal(parsed.value, decimals)}${unit ? ` ${unit}` : ''}`) : parsed.error;
    return [<input key="input" {...fieldProps(name)} type="text" inputMode="decimal" value={values[name]} autoComplete="off" onChange={(e) => set(name, e.target.value)} />, preview] as const;
  };
  // The point on the map is optional: it keeps the one the trip has, can be taken from the GPS, or removed.
  const place = (prefix: 'origin' | 'destination', label: string, gps: LatLng | null, gpsLabel: string) => {
    const point = values[prefix];
    return field(`${prefix}_name`, label, textInput(`${prefix}_name`), undefined, {
      extra: (
        <span className="coords">
          <Icon name="pin" size={15} />
          <span>{point ? 'Marcado en el mapa' : 'Sin ubicación en el mapa (es opcional)'}</span>
          {point && (
            <button type="button" className="link-button" onClick={() => set(prefix, null)}>
              Quitar
            </button>
          )}
          {gps && !samePlace(point, gps) && (
            <button type="button" className="link-button" onClick={() => set(prefix, gps)}>
              {gpsLabel}
            </button>
          )}
        </span>
      ),
    });
  };

  const trucks = unique([...(catalog.data ?? []).map(truckLabel), ...(trip?.vehicle ? [trip.vehicle] : [])]);
  const [kg, kgNote] = numberInput('kg', 'kg', 1);
  const [km, kmNote] = numberInput('billable_km', 'km', 1);
  const [amount, amountNote] = numberInput('amount', '', 2);
  const title = !trip ? 'Nuevo viaje' : trip.panelId ? 'Editar datos del viaje' : 'Completar datos del viaje';
  const saveLabel = save.isPending ? 'Guardando…' : trip?.source === 'app' && !trip.panelId ? 'Guardar datos' : 'Guardar';

  return (
    <dialog
      ref={dialog}
      className="form-dialog"
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        // Escape asks first when something would be lost.
        e.preventDefault();
        requestClose();
      }}
      // The browser can still close it (Escape twice in a row): the page then knows it is closed.
      onClose={onClose}
    >
      <form ref={form} noValidate onSubmit={(e) => void submit(e)}>
        <header>
          <h2 id={`${id}-title`}>{title}</h2>
          <button type="button" className="btn btn-icon" aria-label="Cerrar sin guardar" onClick={requestClose} disabled={save.isPending}>
            <Icon name="close" size={18} />
          </button>
        </header>

        <datalist id={`${id}-clients`}>{unique(suggestions.clients).map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id={`${id}-products`}>{unique([...suggestions.products, EMPTY_RETURN]).map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id={`${id}-trucks`}>{trucks.map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id={`${id}-drivers`}>{unique(suggestions.drivers).map((v) => <option key={v} value={v} />)}</datalist>

        <div className="form-body">
          {trip && mode === 'app' && (
            <div className="gps-facts" aria-label="Datos del GPS">
              <strong>Lo registró la app y no se cambia acá</strong>
              <span>Chofer: {trip.driverName ?? '—'}</span>
              <span>Salida: {formatDayTime(trip.departureAt ? Date.parse(trip.departureAt) : null) || '—'}</span>
              <span>Llegada: {trip.active ? 'en curso' : formatDayTime(trip.arrivalAt ? Date.parse(trip.arrivalAt) : null) || '—'}</span>
              <span>Recorrido GPS: {trip.gpsKm === null ? '—' : `${number(trip.gpsKm, 1)} km`}</span>
            </div>
          )}
          {formError && (
            <p className="form-error" role="alert">
              <Icon name="warning" size={18} /> {formError}
            </p>
          )}

          <fieldset>
            <legend>Carga</legend>
            <div className="form-grid">
              {field('order_number', 'Orden de carga', textInput('order_number'))}
              {field('client', 'Cliente', textInput('client', 'clients'))}
              {field('product', 'Producto', textInput('product', 'products'), trip?.loadType === 'empty' ? 'Retorno vacío: no hace falta' : undefined)}
              {field('kg', 'Kilos', kg, kgNote)}
            </div>
          </fieldset>

          <fieldset>
            <legend>Recorrido</legend>
            <div className="form-grid">
              {place('origin', 'Origen', mode === 'app' ? trip?.gpsStart ?? null : null, 'Usar donde salió (GPS)')}
              {place('destination', 'Destino', mode === 'app' ? trip?.gpsEnd ?? null : null, 'Usar donde llegó (GPS)')}
              {mode === 'manual' && field('departure_at', 'Salida (hora de Uruguay)', <input {...fieldProps('departure_at')} type="datetime-local" value={values.departure_at} onChange={(e) => set('departure_at', e.target.value)} />)}
              {mode === 'manual' && field('arrival_at', 'Llegada (hora de Uruguay)', <input {...fieldProps('arrival_at')} type="datetime-local" value={values.arrival_at} min={values.departure_at || undefined} onChange={(e) => set('arrival_at', e.target.value)} />, 'Opcional')}
              {field('billable_km', 'Km facturables', km, kmNote || (trip?.gpsKm != null ? `El GPS midió ${number(trip.gpsKm, 1)} km` : undefined))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Camión y chofer</legend>
            <div className="form-grid">
              {field('vehicle', 'Camión', textInput('vehicle', 'trucks'), mode === 'manual' ? 'Por ejemplo: Ford Cargo 1722 · ITP2187' : undefined)}
              {mode === 'manual' && field('driver_name', 'Chofer', textInput('driver_name', 'drivers'))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Facturación</legend>
            <div className="form-grid">
              {field('amount', 'Importe', amount, amountNote)}
              {field(
                'currency',
                'Moneda',
                <select {...fieldProps('currency')} value={values.currency} onChange={(e) => set('currency', e.target.value === 'USD' ? 'USD' : 'UYU')}>
                  <option value="UYU">Pesos ($)</option>
                  <option value="USD">Dólares (US$)</option>
                </select>,
              )}
            </div>
          </fieldset>

          {field('notes', 'Notas', <textarea {...fieldProps('notes')} rows={3} value={values.notes} maxLength={LIMITS.notes} onChange={(e) => set('notes', e.target.value)} />, undefined, { wide: true })}
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
            <button type="button" className="btn" onClick={requestClose} disabled={save.isPending}>
              Cancelar
            </button>
            <button type="submit" className={`btn btn-primary${save.isPending ? ' is-busy' : ''}`} disabled={save.isPending}>
              {saveLabel}
            </button>
          </footer>
        )}
      </form>
    </dialog>
  );
}
