// An expense in a dialog (Gastos y finanzas): a new one, or a correction, with its invoice (a photo, made smaller like
// the receipts, or a PDF). A wrong one is annulled, never deleted. Closing with changes asks first; if someone else saved
// it meanwhile, nothing is overwritten.
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ConflictError, DataError, describeWriteError } from '../data/api';
import { useSaveExpense, useSetExpenseDeleted, useTripList } from '../data/hooks';
import { addDays, calendarDay, formatDay, startOfDay } from '../lib/dates';
import { FILE_MAX_BYTES, type FileType, looksLikePdf } from '../lib/documents';
import { savedAsSent } from '../lib/drivers';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_LIMITS,
  EXPENSE_METHODS,
  EXPENSE_TARGETS,
  type Expense,
  type ExpenseField,
  expenseFilePath,
  type ExpenseFormValues,
  expenseFormValues,
  type ExpensePreset,
  type ExpenseTarget,
  knownSuppliers,
  OTHER_CATEGORY,
  type TargetChoice,
  type TargetChoices,
  targetField,
  targetLabel,
  type TargetNames,
  tripTargetName,
  validateExpense,
  writtenCategories,
} from '../lib/expenses';
import { decimal, money } from '../lib/format';
import type { Currency } from '../lib/fuel';
import { parseNumber } from '../lib/numbers';
import { photoJpeg } from '../lib/photo';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import { type Photo, PhotoDialog } from './PhotoDialog';

/** A new expense noted from somewhere else: a service done (its cost) or a trip. What it goes to is fixed there. */
export interface ExpenseOrigin extends ExpensePreset {
  /** The service done whose cost it is. */
  serviceId?: string;
  /** What it goes to cannot be changed in the form: it is named so. */
  fixedName?: string;
}

interface Props {
  /** The expense to correct; null notes a new one. */
  expense: Expense | null;
  origin?: ExpenseOrigin;
  today: string;
  choices: TargetChoices;
  names: TargetNames;
  /** Every expense, for the suppliers and the kinds written before. */
  expenses: readonly Expense[];
  onClose: () => void;
  /** What happened, for the page to say it. */
  onDone: (text: string, tone?: 'ok' | 'warn') => void;
  /** Someone else changed the expense while it was open here: nothing was saved. */
  onConflict: () => void;
}

/** The invoice: the one the expense has stays, a new one is ready, the one it has goes, or the one picked could not be read. */
type FileState =
  | { status: 'keep' }
  | { status: 'preparing' }
  | { status: 'ready'; blob: Blob; type: FileType; preview: string | null; name: string; fileId: string }
  | { status: 'removed' }
  | { status: 'failed'; reason: string };

const dataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer la foto'));
    reader.readAsDataURL(blob);
  });

const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${decimal(bytes / 1024 / 1024, 1)} MB` : `${decimal(bytes / 1024, 0)} KB`);

const amountNote = (raw: string) => {
  const parsed = parseNumber(raw);
  return parsed.ok ? (parsed.value === null ? undefined : `Se guarda: ${decimal(parsed.value, 2)}`) : parsed.error;
};

/** The options of a kind: the ones in use, and apart the ones sold or that no longer work. */
function Options({ list, gone, goneLabel, extra }: { list: readonly TargetChoice[]; gone: readonly TargetChoice[]; goneLabel: string; extra: TargetChoice | null }) {
  const option = (c: TargetChoice) => (
    <option key={c.ref} value={c.ref}>
      {c.label}
    </option>
  );
  return (
    <>
      {extra && option(extra)}
      {gone.length === 0 ? (
        list.map(option)
      ) : (
        <>
          <optgroup label="En uso">{list.map(option)}</optgroup>
          <optgroup label={goneLabel}>{gone.map(option)}</optgroup>
        </>
      )}
    </>
  );
}

export function ExpenseFormDialog({ expense: opened, origin, today, choices, names, expenses, onClose, onDone, onConflict }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  // The expense as it was when the form opened: the save is checked against this version.
  const [base] = useState(opened);
  // A new expense keeps its id while the dialog is open: a save tried again does not make a second one.
  const [newId] = useState(() => crypto.randomUUID());
  const [initial] = useState(() => expenseFormValues(base, today, origin));
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<ExpenseField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [annulling, setAnnulling] = useState(false);
  const [file, setFile] = useState<FileState>({ status: 'keep' });
  const [viewing, setViewing] = useState<Photo | null>(null);
  const save = useSaveExpense();
  const annul = useSetExpenseDeleted();
  const busy = save.isPending || annul.isPending;
  const dirty = JSON.stringify(values) !== JSON.stringify(initial) || file.status === 'ready' || file.status === 'removed';
  const v = values;
  // A service's cost goes to its truck, and an expense noted from a trip to that trip.
  const serviceCost = Boolean(base?.serviceId ?? origin?.serviceId);
  const fixed = serviceCost || Boolean(origin?.fixedName);

  // The trips around the day of the expense, to choose one: the month before it and the day after.
  const day = calendarDay(v.spentOn) ?? today;
  const choosingTrip = v.target === 'trip' && !fixed;
  const trips = useTripList(choosingTrip ? startOfDay(addDays(day, -31)) : null, choosingTrip ? startOfDay(addDays(day, 2)) : null);
  const tripChoices = trips.trips
    .filter((t) => !t.deleted || t.key === v.tripKey)
    .sort((a, b) => (b.departureAt ?? '').localeCompare(a.departureAt ?? ''))
    .map((t) => ({ ref: t.key, label: `${t.departureAt ? formatDay(calendarDay(t.departureAt) ?? '') : 'Sin fecha'} · ${tripTargetName(t)}`, name: tripTargetName(t) }));

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
  const set = <K extends ExpenseField>(field: K, value: ExpenseFormValues[K]) => {
    setValues((x) => ({ ...x, [field]: value }));
    const gone: ExpenseField[] = field === 'categoryChoice' || field === 'category' ? ['categoryChoice', 'category'] : field === 'target' ? ['target', 'vehicleKey', 'trailerId', 'driverId', 'tripKey'] : [field];
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !gone.includes(k as ExpenseField))));
    setLeaving(false);
  };

  // Each file chosen gets a number: a big photo still being prepared does not replace one chosen after it.
  const picks = useRef(0);
  const settle = (state: FileState) => {
    picks.current++;
    setFile(state);
  };
  const pick = async (picked: File | undefined) => {
    if (!picked) return;
    const turn = ++picks.current;
    const show = (state: FileState) => {
      if (turn === picks.current) setFile(state);
    };
    show({ status: 'preparing' });
    try {
      if (picked.type === 'application/pdf' || /\.pdf$/i.test(picked.name)) {
        if (picked.size > FILE_MAX_BYTES) return show({ status: 'failed', reason: 'Ese PDF pesa más de 10 MB. Probá con uno más liviano o con una foto.' });
        if (!looksLikePdf(new Uint8Array(await picked.slice(0, 5).arrayBuffer()))) return show({ status: 'failed', reason: 'Ese archivo no es un PDF que se pueda abrir.' });
        return show({ status: 'ready', blob: picked, type: 'pdf', preview: null, name: picked.name, fileId: crypto.randomUUID() });
      }
      const blob = await photoJpeg(picked);
      // A data: address, which the panel's Content-Security-Policy allows for images (blob: is not).
      show({ status: 'ready', blob, type: 'photo', preview: await dataUrl(blob), name: picked.name, fileId: crypto.randomUUID() });
    } catch (e) {
      console.error(e);
      show({ status: 'failed', reason: 'No se pudo leer ese archivo. Probá con una foto (JPG o PNG) o un PDF.' });
    }
  };

  /** How the lists name what the expense goes to now; saved with it. */
  const chosenName = (): string => {
    if (fixed && origin?.fixedName) return origin.fixedName;
    switch (v.target) {
      case 'truck':
        return names.trucks.get(v.vehicleKey) ?? (base?.vehicleKey === v.vehicleKey ? base.targetName : '');
      case 'trailer':
        return names.trailers.get(v.trailerId) ?? (base?.trailerId === v.trailerId ? base.targetName : '');
      case 'driver':
        return names.drivers.get(v.driverId) ?? (base?.driverId === v.driverId ? base.targetName : '');
      case 'trip':
        return tripChoices.find((t) => t.ref === v.tripKey)?.name ?? (base?.tripKey === v.tripKey ? base.targetName : '');
      default:
        return '';
    }
  };

  const fail = (err: unknown) => {
    if (err instanceof ConflictError) return onConflict();
    console.error(err);
    // The one cost that counts of a service done: another one was noted meanwhile.
    setFormError(err instanceof DataError && err.code === '23505' && serviceCost ? 'Ese service ya tiene su costo anotado: corregí ese en vez de anotar otro.' : describeWriteError(err, 'gastos'));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    if (file.status === 'preparing') return setFormError('Esperá a que termine de prepararse el archivo.');
    const { row, errors: errs } = validateExpense(v, today, chosenName());
    setErrors(errs);
    if (!row) {
      setFormError('Revisá los campos marcados.');
      window.setTimeout(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (base && !dirty) return onClose();
    const path = file.status === 'ready' ? expenseFilePath(base?.id ?? newId, file.fileId, file.type) : null;
    const upload = file.status === 'ready' && path ? { path, blob: file.blob, type: file.type } : null;
    const filePath = upload ? upload.path : file.status === 'removed' ? null : (base?.file?.path ?? null);
    const sent = base ? { ...row, file_path: filePath } : { ...row, id: newId, service_id: origin?.serviceId ?? null, file_path: filePath };
    try {
      const saved = await save.mutateAsync({ expense: base, row: sent, upload });
      if (!base && !savedAsSent(saved, sent)) return onDone('Ese gasto ya se había guardado en el intento anterior, con lo que tenía entonces: revisalo y, si hace falta, corregilo.', 'warn');
      const what = `${row.category} por ${money(row.amount, row.currency as Currency)}`;
      onDone(base ? 'Gasto corregido.' : serviceCost ? `Costo del service anotado: ${what}.` : `Gasto anotado: ${what}.`);
    } catch (err) {
      fail(err);
    }
  };

  const doAnnul = async () => {
    if (!base) return;
    try {
      await annul.mutateAsync({ expense: base, deleted: true });
      onDone('Gasto anulado: ya no cuenta en los totales.');
    } catch (err) {
      setAnnulling(false);
      fail(err);
    }
  };

  const fieldProps = (name: ExpenseField) => ({ id: `${id}-${name}`, 'aria-invalid': errors[name] ? true : undefined, 'aria-describedby': `${id}-${name}-note` });
  const field = (name: ExpenseField, label: string, control: ReactNode, note?: ReactNode, full = false) => (
    <div className={`field${full ? ' field-full' : ''}`}>
      <label htmlFor={`${id}-${name}`}>{label}</label>
      {control}
      <p className={errors[name] ? 'field-error' : 'hint'} id={`${id}-${name}-note`}>
        {errors[name] ?? note}
      </p>
    </div>
  );

  // What the expense goes to when it is not among the choices any more (a card that changed), so it stays chosen.
  const keep = (target: ExpenseTarget, ref: string, list: TargetChoices[keyof TargetChoices]): TargetChoice | null =>
    base && base.target === target && ref && ref === (target === 'truck' ? base.vehicleKey : target === 'trailer' ? base.trailerId : base.driverId) && ![...list.current, ...list.gone].some((c) => c.ref === ref)
      ? { ref, label: targetLabel(base, names) }
      : null;
  const tripExtra = base?.tripKey && base.tripKey === v.tripKey && !tripChoices.some((t) => t.ref === v.tripKey) ? { ref: base.tripKey, label: base.targetName || 'El viaje del gasto' } : null;
  const written = writtenCategories(expenses);
  const suppliers = knownSuppliers(expenses);
  const current = base?.file ?? null;
  const fileInput = (label: string) => (
    <label className="btn">
      <Icon name="plus" size={18} /> {label}
      <input type="file" accept="image/*,application/pdf" className="visually-hidden" aria-label="Factura del gasto" onChange={(e) => void pick(e.target.files?.[0])} disabled={busy} />
    </label>
  );
  const fixedText = fixed ? (origin?.fixedName ?? (base ? targetLabel(base, names) : '')) : '';

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
          <h2 id={`${id}-title`}>{base ? 'Corregir gasto' : serviceCost ? 'Costo del service' : 'Nuevo gasto'}</h2>
          <button type="button" className="btn btn-icon" aria-label="Cerrar sin guardar" onClick={requestClose} disabled={busy}>
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="form-body">
          {formError && (
            <p className="form-error" role="alert">
              <Icon name="warning" size={18} /> {formError}
            </p>
          )}

          <div className="form-grid">
            {field('spentOn', 'Fecha', <input {...fieldProps('spentOn')} type="date" value={v.spentOn} min="2000-01-01" max={today} onChange={(e) => set('spentOn', e.target.value)} />)}
            {field(
              'categoryChoice',
              'Tipo de gasto',
              <select
                {...fieldProps('categoryChoice')}
                value={v.categoryChoice}
                onChange={(e) => {
                  set('categoryChoice', e.target.value);
                  if (e.target.value !== OTHER_CATEGORY) set('category', '');
                }}
              >
                <option value="">Elegí el tipo…</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value={OTHER_CATEGORY}>Otro (escribilo)</option>
              </select>,
              'El combustible, el telepeaje y los sueldos van en sus secciones.',
            )}
            {v.categoryChoice === OTHER_CATEGORY &&
              field(
                'category',
                'Otro tipo',
                <>
                  <input {...fieldProps('category')} type="text" list={`${id}-written`} value={v.category} maxLength={EXPENSE_LIMITS.category} autoComplete="off" onChange={(e) => set('category', e.target.value)} />
                  <datalist id={`${id}-written`}>
                    {written.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </>,
              )}
            {field('amount', 'Importe', <input {...fieldProps('amount')} type="text" inputMode="decimal" value={v.amount} autoComplete="off" onChange={(e) => set('amount', e.target.value)} />, amountNote(v.amount))}
            {field(
              'currency',
              'Moneda',
              <select {...fieldProps('currency')} value={v.currency} onChange={(e) => set('currency', e.target.value === 'USD' ? 'USD' : 'UYU')}>
                <option value="UYU">Pesos ($)</option>
                <option value="USD">Dólares (US$)</option>
              </select>,
            )}
            {field(
              'method',
              'Forma de pago',
              <select {...fieldProps('method')} value={v.method} onChange={(e) => set('method', EXPENSE_METHODS.find((m) => m.value === e.target.value)?.value ?? 'otro')}>
                {EXPENSE_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>,
            )}
          </div>

          <fieldset>
            <legend>¿A qué va?</legend>
            {fixed ? (
              <p className="form-intro">
                <strong>{fixedText || 'Sin indicar'}</strong>
                {serviceCost ? ' · es el costo de un service hecho: va a su camión.' : null}
              </p>
            ) : (
              <>
                <div className="chips form-choice" role="radiogroup" aria-label="¿A qué va?">
                  {EXPENSE_TARGETS.map((t) => (
                    <button key={t.value} type="button" role="radio" aria-checked={v.target === t.value} className={`chip${v.target === t.value ? ' is-on' : ''}`} onClick={() => v.target !== t.value && set('target', t.value)}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="form-grid">
                  {v.target === 'truck' &&
                    field(
                      targetField('truck'),
                      'Camión',
                      <select {...fieldProps('vehicleKey')} value={v.vehicleKey} onChange={(e) => set('vehicleKey', e.target.value)}>
                        <option value="">Elegí el camión…</option>
                        <Options list={choices.trucks.current} gone={choices.trucks.gone} goneLabel="Dados de baja" extra={keep('truck', v.vehicleKey, choices.trucks)} />
                      </select>,
                    )}
                  {v.target === 'trailer' &&
                    field(
                      targetField('trailer'),
                      'Acoplado',
                      <select {...fieldProps('trailerId')} value={v.trailerId} onChange={(e) => set('trailerId', e.target.value)}>
                        <option value="">{choices.trailers.current.length + choices.trailers.gone.length === 0 ? 'No hay acoplados con ficha' : 'Elegí el acoplado…'}</option>
                        <Options list={choices.trailers.current} gone={choices.trailers.gone} goneLabel="Dados de baja" extra={keep('trailer', v.trailerId, choices.trailers)} />
                      </select>,
                      'Los de Flota.',
                    )}
                  {v.target === 'driver' &&
                    field(
                      targetField('driver'),
                      'Chofer',
                      <select {...fieldProps('driverId')} value={v.driverId} onChange={(e) => set('driverId', e.target.value)}>
                        <option value="">{choices.drivers.current.length + choices.drivers.gone.length === 0 ? 'No hay choferes con ficha' : 'Elegí el chofer…'}</option>
                        <Options list={choices.drivers.current} gone={choices.drivers.gone} goneLabel="Ya no trabajan" extra={keep('driver', v.driverId, choices.drivers)} />
                      </select>,
                      'Los que tienen ficha en Choferes. Su sueldo y sus adelantos van en su ficha.',
                    )}
                  {v.target === 'trip' &&
                    field(
                      targetField('trip'),
                      'Viaje',
                      <select {...fieldProps('tripKey')} value={v.tripKey} onChange={(e) => set('tripKey', e.target.value)} disabled={trips.query.isLoading}>
                        <option value="">{trips.query.isLoading ? 'Cargando los viajes…' : tripChoices.length === 0 && !tripExtra ? 'No hay viajes en esas fechas' : 'Elegí el viaje…'}</option>
                        {tripExtra && <option value={tripExtra.ref}>{tripExtra.label}</option>}
                        {tripChoices.map((t) => (
                          <option key={t.ref} value={t.ref}>
                            {t.label}
                          </option>
                        ))}
                      </select>,
                      trips.query.error ? 'No se pudieron leer los viajes. Cerrá y volvé a intentar.' : 'Los que salieron en el mes anterior a la fecha del gasto.',
                      true,
                    )}
                </div>
              </>
            )}
          </fieldset>

          {field(
            'supplier',
            'Proveedor',
            <>
              <input {...fieldProps('supplier')} type="text" list={`${id}-suppliers`} value={v.supplier} maxLength={EXPENSE_LIMITS.supplier} autoComplete="off" onChange={(e) => set('supplier', e.target.value)} />
              <datalist id={`${id}-suppliers`}>
                {suppliers.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </>,
            'Opcional: el taller, la gomería, la aseguradora…',
            true,
          )}

          <fieldset>
            <legend>Factura</legend>
            <div className="photo-pick">
              {file.status === 'ready' && file.preview && <img src={file.preview} alt="Foto elegida de la factura" />}
              {file.status === 'ready' && !file.preview && (
                <span className="file-chip">
                  <Icon name="doc" size={28} />
                </span>
              )}
              <div>
                {file.status === 'ready' ? (
                  <>
                    {fileInput('Cambiar archivo')}
                    <button type="button" className="link-button" onClick={() => settle({ status: 'keep' })} disabled={busy}>
                      {current ? 'Dejar la que tenía' : 'Quitarla'}
                    </button>
                    <p className="hint">{file.type === 'pdf' ? `PDF listo: ${file.name} (${size(file.blob.size)}).` : `Foto lista: ${size(file.blob.size)}.`}</p>
                  </>
                ) : file.status === 'removed' ? (
                  <>
                    <button type="button" className="btn" onClick={() => settle({ status: 'keep' })} disabled={busy}>
                      <Icon name="undo" size={18} /> No quitarla
                    </button>
                    <p className="hint">Al guardar, el gasto queda sin factura. El archivo queda guardado aparte.</p>
                  </>
                ) : current && file.status !== 'preparing' && file.status !== 'failed' ? (
                  <>
                    <button type="button" className="btn" onClick={() => setViewing({ bucket: 'trf-expense-files', path: current.path, title: `Factura · ${base?.category ?? ''}` })}>
                      <Icon name={current.type === 'pdf' ? 'doc' : 'external'} size={18} /> {current.type === 'pdf' ? 'Ver el PDF' : 'Ver la foto'}
                    </button>
                    {fileInput('Reemplazar')}
                    <button type="button" className="link-button" onClick={() => settle({ status: 'removed' })} disabled={busy}>
                      Quitar la factura
                    </button>
                    <p className="hint">{current.type === 'pdf' ? 'Tiene un PDF.' : 'Tiene una foto.'}</p>
                  </>
                ) : (
                  <>
                    {fileInput('Elegir foto o PDF')}
                    <p className={file.status === 'failed' ? 'field-error' : 'hint'} role={file.status === 'failed' ? 'alert' : undefined}>
                      {file.status === 'preparing' ? 'Preparando el archivo…' : file.status === 'failed' ? file.reason : 'Opcional: una foto (se achica como las de las boletas) o un PDF de hasta 10 MB.'}
                    </p>
                  </>
                )}
              </div>
            </div>
          </fieldset>

          {field('notes', 'Notas', <textarea {...fieldProps('notes')} rows={2} value={v.notes} maxLength={EXPENSE_LIMITS.notes} onChange={(e) => set('notes', e.target.value)} />, 'Opcional: número de factura, qué se arregló…', true)}
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
            {base && (
              <button type="button" className="btn btn-quiet footer-start" onClick={() => setAnnulling(true)} disabled={busy}>
                <Icon name="trash" size={18} /> Anular gasto
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
      <PhotoDialog photo={viewing} onClose={() => setViewing(null)} />
      {annulling && base && (
        <ConfirmDialog title="¿Anular este gasto?" confirmLabel="Anular gasto" danger busy={annul.isPending} onConfirm={() => void doAnnul()} onCancel={() => setAnnulling(false)}>
          <p>
            {base.category} del {formatDay(base.spentOn)} por {money(base.amount, base.currency)}. Deja de contar en los totales. No se borra: queda en «Anulados», con quién lo hizo y cuándo, y se puede restaurar.
          </p>
        </ConfirmDialog>
      )}
    </dialog>
  );
}
