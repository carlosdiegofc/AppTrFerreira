// A payment to a station or its opening balance, in a dialog: a new one, or the correction of one already saved, which
// can also be annulled (nothing is deleted). Closing it with changes asks first; if someone else saved it meanwhile,
// nothing is overwritten.
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ConflictError, DataError, describeWriteError } from '../data/api';
import { useSaveMovement, useSetMovementDeleted } from '../data/hooks';
import { type Currency, type Movement, NO_STATION, PAYMENT_METHODS, type Station } from '../lib/fuel';
import { FUEL_LIMITS, type MovementField, movementFormChanged, type MovementFormValues, movementFormValues, type MovementKind, movementRow, sameMovement, validateMovementForm } from '../lib/fuelForm';
import { decimal } from '../lib/format';
import { parseNumber } from '../lib/numbers';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';

interface Props {
  kind: MovementKind;
  /** The payment or opening balance to correct; null registers a new one. */
  movement: Movement | null;
  /** The station it starts with (a station's page opens it with its own). */
  station: string;
  currency?: Currency;
  stations: readonly Station[];
  today: string;
  onClose: () => void;
  onDone: (text: string) => void;
  onConflict: () => void;
}

const CURRENCY_NAME: Record<Currency, string> = { UYU: 'pesos', USD: 'dólares' };

export function MovementFormDialog({ kind, movement: opened, station, currency, stations, today, onClose, onDone, onConflict }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  const [movement] = useState(opened);
  // A new one keeps its id while the dialog is open: a save tried again after a cut does not count it twice.
  const [newId] = useState(() => crypto.randomUUID());
  const [initial] = useState(() => movementFormValues(movement, station, today, currency));
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<MovementField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [annulling, setAnnulling] = useState(false);
  const save = useSaveMovement();
  const annul = useSetMovementDeleted();
  const busy = save.isPending || annul.isPending;
  const dirty = movementFormChanged(initial, values);
  const choices = stations.filter((s) => s.key !== NO_STATION);
  const opening = kind === 'opening';

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    form.current?.querySelector<HTMLElement>('.form-body select, .form-body input')?.focus();
  }, []);

  const requestClose = () => {
    if (busy) return;
    if (dirty) setLeaving(true);
    else onClose();
  };

  const set = <K extends MovementField>(field: K, value: MovementFormValues[K]) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== field)));
    setLeaving(false);
  };

  const fail = (err: unknown) => {
    if (err instanceof ConflictError) {
      onConflict();
      return;
    }
    console.error(err);
    setFormError(
      err instanceof DataError && err.code === '23505'
        ? `Esa estación ya tiene un saldo inicial en ${CURRENCY_NAME[values.currency]}: corregí el que está.`
        : describeWriteError(err, opening ? 'saldos' : 'pagos'),
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    const check = validateMovementForm(kind, values, new Set(choices.map((s) => s.key)), today);
    const errs = { ...check.errors };
    // One opening balance per station and currency: the one there is gets corrected.
    const other = choices.find((s) => s.key === values.station)?.openings.find((o) => o.currency === values.currency && o.id !== movement?.id);
    if (opening && other) errs.currency = `Esta estación ya tiene un saldo inicial en ${CURRENCY_NAME[values.currency]}: corregí el que está.`;
    setErrors(errs);
    if (!check.ok || Object.keys(errs).length > 0) {
      setFormError('Revisá los campos marcados.');
      form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    if (movement && !dirty) {
      onClose();
      return;
    }
    const name = choices.find((s) => s.key === check.payload.station)?.name ?? '';
    const row = movement ? movementRow(kind, check.payload, name) : { ...movementRow(kind, check.payload, name), id: newId };
    try {
      const saved = await save.mutateAsync({ movement, row });
      if (!movement && !sameMovement(saved, row)) {
        onDone(`${opening ? 'Ese saldo inicial ya se había guardado' : 'Ese pago ya se había registrado'} en el intento anterior, con lo que tenía entonces: revisalo y, si hace falta, corregilo.`);
        return;
      }
      onDone(opening ? (movement ? 'Saldo inicial corregido.' : 'Saldo inicial guardado.') : movement ? 'Pago corregido.' : 'Pago registrado.');
    } catch (err) {
      fail(err);
    }
  };

  const doAnnul = async () => {
    if (!movement) return;
    try {
      await annul.mutateAsync({ movement, deleted: true });
      onDone(opening ? 'Saldo inicial quitado: la cuenta vuelve a empezar con la primera boleta.' : 'Pago anulado: ya no descuenta del saldo.');
    } catch (err) {
      setAnnulling(false);
      fail(err);
    }
  };

  const fieldProps = (name: MovementField) => ({ id: `${id}-${name}`, 'aria-invalid': errors[name] ? true : undefined, 'aria-describedby': `${id}-${name}-note` });
  const field = (name: MovementField, label: string, control: ReactNode, note?: ReactNode, full = false) => (
    <div className={`field${full ? ' field-full' : ''}`}>
      <label htmlFor={`${id}-${name}`}>{label}</label>
      {control}
      <p className={errors[name] ? 'field-error' : 'hint'} id={`${id}-${name}-note`}>
        {errors[name] ?? note}
      </p>
    </div>
  );
  const parsed = parseNumber(values.amount);
  const amountNote = parsed.ok ? (parsed.value === null ? undefined : `Se guarda: ${decimal(parsed.value, 2)}`) : parsed.error;
  const title = opening ? (movement ? 'Corregir saldo inicial' : 'Saldo inicial') : movement ? 'Corregir pago' : 'Registrar pago';

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
      <form ref={form} noValidate onSubmit={(e) => void submit(e)}>
        <header>
          <h2 id={`${id}-title`}>{title}</h2>
          <button type="button" className="btn btn-icon" aria-label="Cerrar sin guardar" onClick={requestClose} disabled={busy}>
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="form-body">
          {opening && <p className="hint form-intro">Lo que se le debía a la estación ese día. Las boletas y los pagos anteriores a esa fecha quedan dentro de este saldo; desde ese día, las cargas suman y los pagos restan.</p>}
          {formError && (
            <p className="form-error" role="alert">
              <Icon name="warning" size={18} /> {formError}
            </p>
          )}
          <div className="form-grid">
            {field(
              'station',
              'Estación',
              <select {...fieldProps('station')} value={values.station} onChange={(e) => set('station', e.target.value)}>
                <option value="">Elegí la estación…</option>
                {choices.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </select>,
            )}
            {field('date', opening ? 'Saldo al día' : 'Fecha del pago', <input {...fieldProps('date')} type="date" value={values.date} max={today} onChange={(e) => set('date', e.target.value)} />)}
            {opening &&
              field(
                'side',
                'El saldo es',
                <select {...fieldProps('side')} value={values.side} onChange={(e) => set('side', e.target.value === 'credit' ? 'credit' : 'debt')}>
                  <option value="debt">Lo que le debemos a la estación</option>
                  <option value="credit">A favor de la empresa</option>
                </select>,
              )}
            {field('amount', opening ? 'Saldo' : 'Importe pagado', <input {...fieldProps('amount')} type="text" inputMode="decimal" value={values.amount} autoComplete="off" onChange={(e) => set('amount', e.target.value)} />, amountNote)}
            {field(
              'currency',
              'Moneda',
              <select {...fieldProps('currency')} value={values.currency} onChange={(e) => set('currency', e.target.value === 'USD' ? 'USD' : 'UYU')}>
                <option value="UYU">Pesos ($)</option>
                <option value="USD">Dólares (US$)</option>
              </select>,
            )}
            {!opening &&
              field(
                'method',
                'Forma de pago',
                <select {...fieldProps('method')} value={values.method} onChange={(e) => set('method', (PAYMENT_METHODS.find((m) => m.value === e.target.value)?.value ?? '') as MovementFormValues['method'])}>
                  <option value="">Elegí cómo se pagó…</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>,
              )}
          </div>
          {field('notes', 'Nota', <textarea {...fieldProps('notes')} rows={2} value={values.notes} maxLength={FUEL_LIMITS.notes} onChange={(e) => set('notes', e.target.value)} />, 'Opcional: número de transferencia, de cheque, quién pagó…', true)}
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
            {movement && (
              <button type="button" className="btn btn-quiet footer-start" onClick={() => setAnnulling(true)} disabled={busy}>
                <Icon name="trash" size={18} /> {opening ? 'Quitar saldo inicial' : 'Anular pago'}
              </button>
            )}
            <button type="button" className="btn" onClick={requestClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className={`btn btn-primary${busy ? ' is-busy' : ''}`} disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </footer>
        )}
      </form>
      {annulling && (
        <ConfirmDialog
          title={opening ? '¿Quitar el saldo inicial?' : '¿Anular este pago?'}
          confirmLabel={opening ? 'Quitar saldo inicial' : 'Anular pago'}
          danger
          busy={annul.isPending}
          onConfirm={() => void doAnnul()}
          onCancel={() => setAnnulling(false)}
        >
          <p>{opening ? 'La cuenta de la estación vuelve a sumar todas las boletas y pagos desde el principio.' : 'Deja de descontar del saldo de la estación.'} No se borra: queda anotado quién lo hizo y cuándo.</p>
        </ConfirmDialog>
      )}
    </dialog>
  );
}
