// The forms of Choferes, in dialogs: a driver's card, the salary from a month and each payment. A salary or a payment
// can be annulled (nothing is deleted). Closing with changes asks first; if someone else saved it meanwhile, nothing is
// overwritten.
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ConflictError, DataError, describeWriteError } from '../data/api';
import { useSaveDriver, useSavePayment, useSaveSalary, useSetPaymentDeleted, useSetSalaryDeleted } from '../data/hooks';
import {
  conceptLabel,
  type Driver,
  type DriverFormValues,
  driverFormValues,
  DRIVER_LIMITS,
  LICENSE_CATEGORIES,
  monthLabel,
  PAY_CONCEPTS,
  type Payment,
  type PaymentFormValues,
  paymentFormValues,
  type Salary,
  type SalaryFormValues,
  salaryFormValues,
  savedAsSent,
  validateDriver,
  validatePayment,
  validateSalary,
} from '../lib/drivers';
import { decimal } from '../lib/format';
import { type Currency, PAYMENT_METHODS } from '../lib/fuel';
import { parseNumber } from '../lib/numbers';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';

interface Common {
  today: string;
  onClose: () => void;
  onDone: (text: string) => void;
  onConflict: () => void;
}

/** What every form here shares: the dialog that opens itself, the values, their errors and closing with changes. */
function useForm<V extends object>(initial: V, busy: boolean, onClose: () => void) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof V, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    form.current?.querySelector<HTMLElement>('.form-body input, .form-body select')?.focus();
  }, []);

  const requestClose = () => {
    if (busy) return;
    if (dirty) setLeaving(true);
    else onClose();
  };
  const set = <K extends keyof V>(field: K, value: V[K]) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== field)) as Partial<Record<keyof V, string>>);
    setLeaving(false);
  };
  /** Shows what is wrong and moves to the first field marked; true when there is nothing wrong. */
  const check = (errs: Partial<Record<keyof V, string>>) => {
    setErrors(errs);
    if (Object.keys(errs).length === 0) return true;
    setFormError('Revisá los campos marcados.');
    window.setTimeout(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    return false;
  };
  const props = (name: keyof V & string) => ({ id: `${id}-${name}`, 'aria-invalid': errors[name] ? true : undefined, 'aria-describedby': `${id}-${name}-note` });
  const field = (name: keyof V & string, label: string, control: ReactNode, note?: ReactNode, full = false) => (
    <div className={`field${full ? ' field-full' : ''}`}>
      <label htmlFor={`${id}-${name}`}>{label}</label>
      {control}
      <p className={errors[name] ? 'field-error' : 'hint'} id={`${id}-${name}-note`}>
        {errors[name] ?? note}
      </p>
    </div>
  );
  return { dialog, form, id, values, set, check, formError, setFormError, leaving, setLeaving, dirty, requestClose, props, field };
}

function Shell({
  f,
  title,
  intro,
  busy,
  onClose,
  onSubmit,
  annul,
  children,
}: {
  f: Pick<ReturnType<typeof useForm<object>>, 'dialog' | 'form' | 'id' | 'requestClose' | 'formError' | 'leaving' | 'setLeaving'>;
  title: string;
  intro?: ReactNode;
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
  annul?: { label: string; onClick: () => void };
  children: ReactNode;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) onSubmit();
  };
  return (
    <dialog
      ref={f.dialog}
      className="form-dialog form-dialog-small"
      aria-labelledby={`${f.id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        f.requestClose();
      }}
      onClose={onClose}
    >
      <form ref={f.form} noValidate onSubmit={submit}>
        <header>
          <h2 id={`${f.id}-title`}>{title}</h2>
          <button type="button" className="btn btn-icon" aria-label="Cerrar sin guardar" onClick={f.requestClose} disabled={busy}>
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="form-body">
          {intro && <p className="hint form-intro">{intro}</p>}
          {f.formError && (
            <p className="form-error" role="alert">
              <Icon name="warning" size={18} /> {f.formError}
            </p>
          )}
          {children}
        </div>
        {f.leaving ? (
          <footer className="form-leave" role="alert">
            <span>Hay cambios sin guardar: si salís, se pierden.</span>
            <button type="button" className="btn" onClick={() => f.setLeaving(false)}>
              Seguir editando
            </button>
            <button type="button" className="btn btn-danger" onClick={onClose}>
              Salir sin guardar
            </button>
          </footer>
        ) : (
          <footer>
            {annul && (
              <button type="button" className="btn btn-quiet footer-start" onClick={annul.onClick} disabled={busy}>
                <Icon name="trash" size={18} /> {annul.label}
              </button>
            )}
            <button type="button" className="btn" onClick={f.requestClose} disabled={busy}>
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

const amountNote = (raw: string) => {
  const parsed = parseNumber(raw);
  return parsed.ok ? (parsed.value === null ? undefined : `Se guarda: ${decimal(parsed.value, 2)}`) : parsed.error;
};

const currencySelect = (props: object, value: Currency, onChange: (c: Currency) => void) => (
  <select {...props} value={value} onChange={(e) => onChange(e.target.value === 'USD' ? 'USD' : 'UYU')}>
    <option value="UYU">Pesos ($)</option>
    <option value="USD">Dólares (US$)</option>
  </select>
);

// ---- The card ----

export function DriverFormDialog({
  driver,
  preset,
  appDrivers,
  linkedElsewhere,
  today,
  onClose,
  onDone,
  onConflict,
  onCreated,
}: Common & {
  /** The card to change; null makes a new one. */
  driver: Driver | null;
  /** A new card for an app driver: the account and its name. */
  preset?: { userId: string; name: string };
  /** The app accounts that can be linked: the ones without a card, and the card's own. */
  appDrivers: readonly { id: string; name: string }[];
  linkedElsewhere: ReadonlySet<string>;
  onCreated?: (id: string) => void;
}) {
  const save = useSaveDriver();
  const [newId] = useState(() => crypto.randomUUID());
  const [initial] = useState(() => driverFormValues(driver, preset));
  const f = useForm<DriverFormValues>(initial, save.isPending, onClose);
  const v = f.values;

  const submit = async () => {
    f.setFormError(null);
    const { row, errors } = validateDriver(v, today, linkedElsewhere);
    if (!f.check(errors) || !row) return;
    if (driver && !f.dirty) return onClose();
    const sent = driver ? row : { ...row, id: newId };
    try {
      const saved = await save.mutateAsync({ driver, row: sent });
      if (!driver && !savedAsSent(saved, sent)) {
        onDone('Esa ficha ya se había guardado en el intento anterior, con lo que tenía entonces: revisala y, si hace falta, corregila.');
        onCreated?.(saved.id);
        return;
      }
      onDone(driver ? 'Ficha guardada.' : `Ficha de ${row.name} creada.`);
      if (!driver) onCreated?.(saved.id);
    } catch (err) {
      if (err instanceof ConflictError) return onConflict();
      console.error(err);
      f.setFormError(err instanceof DataError && err.code === '23505' ? 'Esa cuenta de la app ya tiene su ficha.' : describeWriteError(err, 'fichas'));
    }
  };

  const choices = [...appDrivers].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return (
    <Shell f={f} title={driver ? `Ficha de ${driver.name}` : 'Nueva ficha'} busy={save.isPending} onClose={onClose} onSubmit={() => void submit()}>
      <div className="form-grid">
        {f.field('name', 'Nombre y apellido', <input {...f.props('name')} type="text" value={v.name} maxLength={DRIVER_LIMITS.name} autoComplete="off" onChange={(e) => f.set('name', e.target.value)} />)}
        {f.field(
          'userId',
          'Cuenta de la app',
          <select {...f.props('userId')} value={v.userId} onChange={(e) => f.set('userId', e.target.value)}>
            <option value="">Sin cuenta de la app</option>
            {choices.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>,
          'Con la cuenta se ven sus viajes, sus papeles y cuándo usó la app.',
        )}
        {f.field('phone', 'Teléfono', <input {...f.props('phone')} type="tel" value={v.phone} maxLength={DRIVER_LIMITS.phone} autoComplete="off" onChange={(e) => f.set('phone', e.target.value)} />)}
        {f.field('documentId', 'Cédula', <input {...f.props('documentId')} type="text" value={v.documentId} maxLength={DRIVER_LIMITS.documentId} autoComplete="off" onChange={(e) => f.set('documentId', e.target.value)} />)}
        {f.field('hiredOn', 'Fecha de ingreso', <input {...f.props('hiredOn')} type="date" value={v.hiredOn} max={today} onChange={(e) => f.set('hiredOn', e.target.value)} />)}
        {f.field(
          'licenseCategory',
          'Categoría de la libreta',
          <>
            <input {...f.props('licenseCategory')} type="text" list={`${f.id}-categories`} value={v.licenseCategory} maxLength={DRIVER_LIMITS.licenseCategory} autoComplete="off" onChange={(e) => f.set('licenseCategory', e.target.value)} />
            <datalist id={`${f.id}-categories`}>
              {LICENSE_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </>,
          'El vencimiento y la foto van en Documentación.',
        )}
        {f.field(
          'payMethod',
          'Cómo se le paga',
          <select {...f.props('payMethod')} value={v.payMethod} onChange={(e) => f.set('payMethod', e.target.value)}>
            <option value="">Sin indicar</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>,
        )}
        {f.field('bank', 'Banco', <input {...f.props('bank')} type="text" value={v.bank} maxLength={DRIVER_LIMITS.bank} autoComplete="off" onChange={(e) => f.set('bank', e.target.value)} />)}
        {f.field('bankAccount', 'Número de cuenta', <input {...f.props('bankAccount')} type="text" value={v.bankAccount} maxLength={DRIVER_LIMITS.bankAccount} autoComplete="off" onChange={(e) => f.set('bankAccount', e.target.value)} />)}
      </div>
      {f.field('notes', 'Notas', <textarea {...f.props('notes')} rows={2} value={v.notes} maxLength={DRIVER_LIMITS.notes} onChange={(e) => f.set('notes', e.target.value)} />, undefined, true)}
      {driver && (
        <label className="check-row">
          <input type="checkbox" checked={!v.active} onChange={(e) => f.set('active', !e.target.checked)} />
          Ya no trabaja en la empresa (la ficha queda guardada, con sus pagos)
        </label>
      )}
    </Shell>
  );
}

// ---- The salary ----

export function SalaryFormDialog({
  driver,
  salary,
  salaries,
  current,
  today,
  onClose,
  onDone,
  onConflict,
}: Common & {
  driver: Driver;
  /** The salary to correct; null loads a new one from a month. */
  salary: Salary | null;
  /** The driver's salaries, to check that two do not start the same month. */
  salaries: readonly Salary[];
  /** The salary in force now, for the currency of a new one. */
  current: Salary | null;
}) {
  const save = useSaveSalary();
  const annul = useSetSalaryDeleted();
  const busy = save.isPending || annul.isPending;
  const [newId] = useState(() => crypto.randomUUID());
  const [initial] = useState(() => salaryFormValues(salary, today, current));
  const f = useForm<SalaryFormValues>(initial, busy, onClose);
  const [annulling, setAnnulling] = useState(false);
  const v = f.values;

  const fail = (err: unknown) => {
    if (err instanceof ConflictError) return onConflict();
    console.error(err);
    f.setFormError(err instanceof DataError && err.code === '23505' ? 'Ya hay un sueldo desde ese mes: corregí el que está.' : describeWriteError(err, 'sueldos'));
  };

  const submit = async () => {
    f.setFormError(null);
    const { row, errors } = validateSalary(v, salaries, salary?.id ?? null);
    if (!f.check(errors) || !row) return;
    if (salary && !f.dirty) return onClose();
    const sent = salary ? row : { ...row, id: newId, driver_id: driver.id };
    try {
      const saved = await save.mutateAsync({ salary, row: sent });
      if (!salary && !savedAsSent(saved, sent)) return onDone('Ese sueldo ya se había guardado en el intento anterior, con lo que tenía entonces: revisalo y, si hace falta, corregilo.');
      onDone(salary ? 'Sueldo corregido.' : `Sueldo guardado desde ${monthLabel(row.starts_on)}.`);
    } catch (err) {
      fail(err);
    }
  };

  const doAnnul = async () => {
    if (!salary) return;
    try {
      await annul.mutateAsync({ salary, deleted: true });
      onDone('Sueldo anulado: desde ese mes vale el anterior, si hay.');
    } catch (err) {
      setAnnulling(false);
      fail(err);
    }
  };

  return (
    <>
      <Shell
        f={f}
        title={salary ? 'Corregir sueldo' : `Sueldo de ${driver.name}`}
        intro="Lo que gana por mes, desde el mes que elijas. Un sueldo nuevo no cambia los meses anteriores: cada mes usa el que regía entonces."
        busy={busy}
        onClose={onClose}
        onSubmit={() => void submit()}
        annul={salary ? { label: 'Anular sueldo', onClick: () => setAnnulling(true) } : undefined}
      >
        <div className="form-grid">
          {f.field('amount', 'Sueldo por mes', <input {...f.props('amount')} type="text" inputMode="decimal" value={v.amount} autoComplete="off" onChange={(e) => f.set('amount', e.target.value)} />, amountNote(v.amount))}
          {f.field('currency', 'Moneda', currencySelect(f.props('currency'), v.currency, (c) => f.set('currency', c)))}
          {f.field('startsOn', 'Desde el mes', <input {...f.props('startsOn')} type="month" value={v.startsOn} min="2000-01" onChange={(e) => f.set('startsOn', e.target.value)} />)}
        </div>
        {f.field('notes', 'Nota', <textarea {...f.props('notes')} rows={2} value={v.notes} maxLength={DRIVER_LIMITS.moneyNotes} onChange={(e) => f.set('notes', e.target.value)} />, 'Opcional: un aumento, el convenio…', true)}
      </Shell>
      {annulling && salary && (
        <ConfirmDialog title="¿Anular este sueldo?" confirmLabel="Anular sueldo" danger busy={annul.isPending} onConfirm={() => void doAnnul()} onCancel={() => setAnnulling(false)}>
          <p>Desde {monthLabel(salary.startsOn)} vuelve a valer el sueldo anterior, si hay. No se borra: queda anotado quién lo hizo y cuándo.</p>
        </ConfirmDialog>
      )}
    </>
  );
}

// ---- A payment ----

export function PaymentFormDialog({
  driver,
  payment,
  salary,
  today,
  onClose,
  onDone,
  onConflict,
}: Common & {
  driver: Driver;
  /** The payment to correct; null registers a new one. */
  payment: Payment | null;
  /** The salary in force now, for the currency of a new payment. */
  salary: Salary | null;
}) {
  const save = useSavePayment();
  const annul = useSetPaymentDeleted();
  const busy = save.isPending || annul.isPending;
  const [newId] = useState(() => crypto.randomUUID());
  const [initial] = useState(() => paymentFormValues(payment, today, driver, salary));
  const f = useForm<PaymentFormValues>(initial, busy, onClose);
  const [annulling, setAnnulling] = useState(false);
  const v = f.values;

  const fail = (err: unknown) => {
    if (err instanceof ConflictError) return onConflict();
    console.error(err);
    f.setFormError(describeWriteError(err, 'pagos'));
  };

  const submit = async () => {
    f.setFormError(null);
    const { row, errors } = validatePayment(v, today);
    if (!f.check(errors) || !row) return;
    if (payment && !f.dirty) return onClose();
    const sent = payment ? row : { ...row, id: newId, driver_id: driver.id };
    try {
      const saved = await save.mutateAsync({ payment, row: sent });
      if (!payment && !savedAsSent(saved, sent)) return onDone('Ese pago ya se había registrado en el intento anterior, con lo que tenía entonces: revisalo y, si hace falta, corregilo.');
      onDone(payment ? 'Pago corregido.' : `${conceptLabel(row.concept as Payment['concept'])} registrado para ${monthLabel(row.period)}.`);
    } catch (err) {
      fail(err);
    }
  };

  const doAnnul = async () => {
    if (!payment) return;
    try {
      await annul.mutateAsync({ payment, deleted: true });
      onDone('Pago anulado: ya no cuenta en el mes.');
    } catch (err) {
      setAnnulling(false);
      fail(err);
    }
  };

  const concept = PAY_CONCEPTS.find((c) => c.value === v.concept);
  return (
    <>
      <Shell
        f={f}
        title={payment ? 'Corregir pago' : `Pago a ${driver.name}`}
        busy={busy}
        onClose={onClose}
        onSubmit={() => void submit()}
        annul={payment ? { label: 'Anular pago', onClick: () => setAnnulling(true) } : undefined}
      >
        <div className="form-grid">
          {f.field(
            'concept',
            'Qué es',
            <select {...f.props('concept')} value={v.concept} onChange={(e) => f.set('concept', PAY_CONCEPTS.find((c) => c.value === e.target.value)?.value ?? 'otro')}>
              {PAY_CONCEPTS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>,
            concept?.salary ? 'Se resta del sueldo de ese mes.' : 'Se muestra aparte: no se resta del sueldo.',
          )}
          {f.field('period', 'Corresponde al mes', <input {...f.props('period')} type="month" value={v.period} min="2000-01" onChange={(e) => f.set('period', e.target.value)} />)}
          {f.field('paidOn', 'Fecha del pago', <input {...f.props('paidOn')} type="date" value={v.paidOn} max={today} onChange={(e) => f.set('paidOn', e.target.value)} />)}
          {f.field(
            'method',
            'Forma de pago',
            <select {...f.props('method')} value={v.method} onChange={(e) => f.set('method', PAYMENT_METHODS.find((m) => m.value === e.target.value)?.value ?? 'otro')}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>,
          )}
          {f.field('amount', 'Importe', <input {...f.props('amount')} type="text" inputMode="decimal" value={v.amount} autoComplete="off" onChange={(e) => f.set('amount', e.target.value)} />, amountNote(v.amount))}
          {f.field('currency', 'Moneda', currencySelect(f.props('currency'), v.currency, (c) => f.set('currency', c)))}
        </div>
        {f.field('notes', 'Nota', <textarea {...f.props('notes')} rows={2} value={v.notes} maxLength={DRIVER_LIMITS.moneyNotes} onChange={(e) => f.set('notes', e.target.value)} />, 'Opcional: número de transferencia, de recibo…', true)}
      </Shell>
      {annulling && payment && (
        <ConfirmDialog title="¿Anular este pago?" confirmLabel="Anular pago" danger busy={annul.isPending} onConfirm={() => void doAnnul()} onCancel={() => setAnnulling(false)}>
          <p>Deja de contar en {monthLabel(payment.period)}. No se borra: queda anotado quién lo hizo y cuándo.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
