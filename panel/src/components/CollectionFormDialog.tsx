// A collection from a client or its opening balance, in a dialog: a new one, or the correction of one already saved,
// which can also be annulled (nothing is deleted). Closing it with changes asks first; if someone else saved it
// meanwhile, nothing is overwritten.
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ConflictError, DataError, describeWriteError } from '../data/api';
import { useSaveClientMovement, useSetClientMovementDeleted } from '../data/hooks';
import { type Client, clientKey, type ClientMovement, NO_CLIENT } from '../lib/clients';
import { CLIENT_LIMITS, type CollectionField, collectionFormChanged, type CollectionFormValues, collectionFormValues, type CollectionKind, clientMovementRow, sameClientMovement, validateCollectionForm } from '../lib/clientForm';
import { decimal } from '../lib/format';
import { type Currency, PAYMENT_METHODS } from '../lib/fuel';
import { parseNumber } from '../lib/numbers';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';

interface Props {
  kind: CollectionKind;
  /** The collection or opening balance to correct; null registers a new one. */
  movement: ClientMovement | null;
  /** The client's name it starts with (a client's page opens it with its own; '' to choose it). */
  client: string;
  currency?: Currency;
  clients: readonly Client[];
  today: string;
  onClose: () => void;
  onDone: (text: string) => void;
  onConflict: () => void;
}

const CURRENCY_NAME: Record<Currency, string> = { UYU: 'pesos', USD: 'dólares' };

export function CollectionFormDialog({ kind, movement: opened, client, currency, clients, today, onClose, onDone, onConflict }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  const [movement] = useState(opened);
  // A new one keeps its id while the dialog is open: a save tried again after a cut does not count it twice.
  const [newId] = useState(() => crypto.randomUUID());
  const [initial] = useState(() => collectionFormValues(movement, client, today, currency));
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<CollectionField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [annulling, setAnnulling] = useState(false);
  const save = useSaveClientMovement();
  const annul = useSetClientMovementDeleted();
  const busy = save.isPending || annul.isPending;
  const dirty = collectionFormChanged(initial, values);
  const choices = clients.filter((c) => c.key !== NO_CLIENT);
  const opening = kind === 'opening';
  const typedKey = clientKey(values.client);
  const known = choices.find((c) => c.key === typedKey) ?? null;

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

  const set = <K extends CollectionField>(field: K, value: CollectionFormValues[K]) => {
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
        ? `Ese cliente ya tiene un saldo inicial en ${CURRENCY_NAME[values.currency]}: corregí el que está.`
        : describeWriteError(err, opening ? 'saldos' : 'cobros'),
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    const check = validateCollectionForm(kind, values, today);
    const errs = { ...check.errors };
    // One opening balance per client and currency: the one there is gets corrected.
    const other = check.ok ? choices.find((c) => c.key === check.payload.clientKey)?.openings.find((o) => o.currency === check.payload.currency && o.id !== movement?.id) : undefined;
    if (opening && other) errs.currency = `Este cliente ya tiene un saldo inicial en ${CURRENCY_NAME[values.currency]}: corregí el que está.`;
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
    const row = movement ? clientMovementRow(kind, check.payload) : { ...clientMovementRow(kind, check.payload), id: newId };
    try {
      const saved = await save.mutateAsync({ movement, row });
      if (!movement && !sameClientMovement(saved, row)) {
        onDone(`${opening ? 'Ese saldo inicial ya se había guardado' : 'Ese cobro ya se había registrado'} en el intento anterior, con lo que tenía entonces: revisalo y, si hace falta, corregilo.`);
        return;
      }
      onDone(opening ? (movement ? 'Saldo inicial corregido.' : 'Saldo inicial guardado.') : movement ? 'Cobro corregido.' : 'Cobro registrado.');
    } catch (err) {
      fail(err);
    }
  };

  const doAnnul = async () => {
    if (!movement) return;
    try {
      await annul.mutateAsync({ movement, deleted: true });
      onDone(opening ? 'Saldo inicial quitado: la cuenta vuelve a empezar con el primer viaje.' : 'Cobro anulado: ya no descuenta del saldo.');
    } catch (err) {
      setAnnulling(false);
      fail(err);
    }
  };

  const fieldProps = (name: CollectionField) => ({ id: `${id}-${name}`, 'aria-invalid': errors[name] ? true : undefined, 'aria-describedby': `${id}-${name}-note` });
  const field = (name: CollectionField, label: string, control: ReactNode, note?: ReactNode, full = false) => (
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
  const clientNote = typedKey === null ? 'Elegí uno de la lista o escribilo como va en los viajes.' : known ? undefined : 'Cliente nuevo: su cuenta junta los viajes que tengan este nombre, escrito de cualquier manera.';
  const title = opening ? (movement ? 'Corregir saldo inicial' : 'Saldo inicial') : movement ? 'Corregir cobro' : 'Registrar cobro';

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
          {opening && <p className="hint form-intro">Lo que el cliente le debía a la empresa ese día. Los viajes y los cobros anteriores a esa fecha quedan dentro de este saldo; desde ese día, los viajes suman y los cobros restan.</p>}
          {formError && (
            <p className="form-error" role="alert">
              <Icon name="warning" size={18} /> {formError}
            </p>
          )}
          <div className="form-grid">
            {field(
              'client',
              'Cliente',
              <>
                <input {...fieldProps('client')} type="text" list={`${id}-clients`} value={values.client} maxLength={CLIENT_LIMITS.client} autoComplete="off" onChange={(e) => set('client', e.target.value)} />
                <datalist id={`${id}-clients`}>
                  {choices.map((c) => (
                    <option key={c.key} value={c.name} />
                  ))}
                </datalist>
              </>,
              clientNote,
            )}
            {field('date', opening ? 'Saldo al día' : 'Fecha del cobro', <input {...fieldProps('date')} type="date" value={values.date} max={today} onChange={(e) => set('date', e.target.value)} />)}
            {opening &&
              field(
                'side',
                'El saldo es',
                <select {...fieldProps('side')} value={values.side} onChange={(e) => set('side', e.target.value === 'credit' ? 'credit' : 'debt')}>
                  <option value="debt">Lo que nos debe el cliente</option>
                  <option value="credit">A favor del cliente</option>
                </select>,
              )}
            {field('amount', opening ? 'Saldo' : 'Importe cobrado', <input {...fieldProps('amount')} type="text" inputMode="decimal" value={values.amount} autoComplete="off" onChange={(e) => set('amount', e.target.value)} />, amountNote)}
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
                'Forma de cobro',
                <select {...fieldProps('method')} value={values.method} onChange={(e) => set('method', (PAYMENT_METHODS.find((m) => m.value === e.target.value)?.value ?? '') as CollectionFormValues['method'])}>
                  <option value="">Elegí cómo se cobró…</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>,
              )}
          </div>
          {field('notes', 'Nota', <textarea {...fieldProps('notes')} rows={2} value={values.notes} maxLength={CLIENT_LIMITS.notes} onChange={(e) => set('notes', e.target.value)} />, 'Opcional: número de transferencia o de cheque, qué factura paga…', true)}
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
                <Icon name="trash" size={18} /> {opening ? 'Quitar saldo inicial' : 'Anular cobro'}
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
          title={opening ? '¿Quitar el saldo inicial?' : '¿Anular este cobro?'}
          confirmLabel={opening ? 'Quitar saldo inicial' : 'Anular cobro'}
          danger
          busy={annul.isPending}
          onConfirm={() => void doAnnul()}
          onCancel={() => setAnnulling(false)}
        >
          <p>
            {opening ? 'La cuenta del cliente vuelve a sumar todos sus viajes y cobros desde el principio.' : 'Deja de descontar del saldo del cliente.'} No se borra: queda anotado quién lo hizo y cuándo, y
            se puede restaurar desde «Anulados».
          </p>
        </ConfirmDialog>
      )}
    </dialog>
  );
}
