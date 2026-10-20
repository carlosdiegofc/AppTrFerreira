// A truck service in a dialog: a new one (done or to do), or a change to any service. One that repeats every N km gets
// its next one when it is marked done. Deleting is for good, like in the app, and asks first. Closing with changes asks
// first; if someone else saved the service meanwhile, nothing is overwritten.
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { usePanelUser } from '../auth/AuthProvider';
import { ConflictError, describeWriteError } from '../data/api';
import { useDeleteService, useSaveService } from '../data/hooks';
import { dayInZone, formatDay } from '../lib/dates';
import { number } from '../lib/format';
import { type MaintenanceRow, nextService, OTHER_KIND, SERVICE_KINDS, SERVICE_LIMITS, type Service, type ServiceField, serviceFormChanged, type ServiceFormValues, serviceFormValues, sameService, type TruckKm, validateServiceForm } from '../lib/maintenance';
import { parseNumber } from '../lib/numbers';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';

interface Props {
  /** The service to change; null loads a new one. */
  service: Service | null;
  /** For a new one: the truck chosen in the page, if any. */
  vehicle?: string;
  vehicles: readonly string[];
  /** Every service, to not schedule twice the next one of a service that repeats. */
  services: readonly Service[];
  kms: ReadonlyMap<string, TruckKm>;
  today: string;
  onClose: () => void;
  /** What happened, for the page to say it. */
  onDone: (text: string, tone?: 'ok' | 'warn') => void;
  /** Someone else changed or deleted the service while it was open here: nothing was saved. */
  onConflict: () => void;
}

export function ServiceFormDialog({ service: opened, vehicle, vehicles, services, kms, today, onClose, onDone, onConflict }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  const { user } = usePanelUser();
  // The service as it was when the form opened: the save is checked against this version.
  const [service] = useState(opened);
  // A new service and the next one of a service that repeats keep their ids while the dialog is open: a save tried
  // again does not make a second one.
  const [newId] = useState(() => crypto.randomUUID());
  const [nextId] = useState(() => crypto.randomUUID());
  const tried = useRef(false);
  const [initial] = useState(() => serviceFormValues(service, vehicle));
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<ServiceField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const save = useSaveService();
  const remove = useDeleteService();
  const busy = save.isPending || remove.isPending;
  const dirty = serviceFormChanged(initial, values);

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

  const set = <K extends ServiceField>(field: K, value: ServiceFormValues[K]) => {
    setValues((v) => ({ ...v, [field]: value }));
    // The list of kinds and its text box are one field.
    const gone: ServiceField[] = field === 'kindChoice' || field === 'kind' ? ['kindChoice', 'kind'] : [field];
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !gone.includes(k as ServiceField))));
    setLeaving(false);
  };

  const fail = (err: unknown) => {
    if (err instanceof ConflictError) {
      onConflict();
      return;
    }
    console.error(err);
    setFormError(describeWriteError(err, 'services'));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    const check = validateServiceForm(values, today);
    setErrors(check.errors);
    if (!check.ok) {
      setFormError('Revisá los campos marcados.');
      form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    if (service && !dirty) {
      onClose();
      return;
    }
    const p = check.payload;
    // Done now, and every N km: the next one is due N km after the odometer of that day, unless it is already there.
    const justDone = p.done_on !== null && (service === null || service.doneOn === null);
    const next =
      justDone && p.interval_km !== null
        ? (saved: MaintenanceRow) => {
            const due = (saved.odometer_km ?? 0) + (saved.interval_km ?? 0);
            const there = services.some((s) => s.id !== saved.id && s.vehicle === p.vehicle && s.kind === saved.kind && s.doneOn === null && s.dueKm === due);
            return there ? null : nextService(saved, nextId, user.name);
          }
        : null;
    try {
      const row = service ? p : { ...p, id: newId, created_by_name: user.name };
      const retried = !service && tried.current;
      tried.current = true;
      const result = await save.mutateAsync({ service, row, next });
      const nextAt = result.next?.due_km != null ? ` El próximo quedó agendado a los ${number(result.next.due_km)} km.` : '';
      if (result.nextFailed) {
        onDone(
          result.nextFailed === 'unknown'
            ? 'El service quedó como hecho, pero no se pudo confirmar si se agendó el próximo: revisá la lista antes de cargarlo de nuevo.'
            : 'El service quedó como hecho, pero no se pudo agendar el próximo: cargalo con «Nuevo service».',
          'warn',
        );
        return;
      }
      if (retried && !sameService(result.saved, { ...p, id: newId })) {
        onDone('Ese service ya se había guardado en el intento anterior, con lo que tenía entonces: revisalo y, si hace falta, corregilo.', 'warn');
        return;
      }
      onDone((service ? (justDone ? 'Service marcado como hecho.' : 'Service guardado.') : p.done_on ? 'Service cargado como hecho.' : 'Service cargado.') + nextAt);
    } catch (err) {
      fail(err);
    }
  };

  const toDelete = async () => {
    if (!service) return;
    try {
      await remove.mutateAsync(service);
      onDone('Service eliminado.');
    } catch (err) {
      setDeleting(false);
      fail(err);
    }
  };

  const fieldProps = (name: ServiceField) => ({ id: `${id}-${name}`, 'aria-invalid': errors[name] ? true : undefined, 'aria-describedby': `${id}-${name}-note` });
  const field = (name: ServiceField, label: string, control: ReactNode, note?: ReactNode, full = false) => (
    <div className={`field${full ? ' field-full' : ''}`}>
      <label htmlFor={`${id}-${name}`}>{label}</label>
      {control}
      <p className={errors[name] ? 'field-error' : 'hint'} id={`${id}-${name}-note`}>
        {errors[name] ?? note}
      </p>
    </div>
  );
  const kmInput = (name: 'dueKm' | 'intervalKm' | 'odometerKm') => <input {...fieldProps(name)} type="text" inputMode="numeric" value={values[name]} autoComplete="off" onChange={(e) => set(name, e.target.value)} />;
  const km = kms.get(values.vehicle);
  const estimateNote = km ? `Hoy tiene unos ${number(km.estimate)} km (estimado con el GPS).` : values.vehicle ? 'Este camión todavía no tiene kilometraje anotado.' : null;
  /** What is saved, or what the field is for; and the truck's kilometres, to compare. */
  const kmNote = (name: 'dueKm' | 'odometerKm', otherwise: string) => {
    const parsed = parseNumber(values[name]);
    return [parsed.ok && parsed.value !== null && Number.isInteger(parsed.value) ? `Se guarda: ${number(parsed.value)} km.` : otherwise, estimateNote].filter(Boolean).join(' ');
  };
  const choices = values.vehicle && !vehicles.includes(values.vehicle) ? [values.vehicle, ...vehicles] : vehicles;
  const interval = parseNumber(values.intervalKm);
  const odometer = parseNumber(values.odometerKm);
  const doneNow = values.done && (service === null || service.doneOn === null);
  const intervalNote = !values.done
    ? 'Opcional: al marcarlo como hecho se agenda el próximo.'
    : !doneNow
      ? 'Opcional.'
      : interval.ok && interval.value && odometer.ok && odometer.value !== null
        ? `Al guardar se agenda el próximo a los ${number(odometer.value + interval.value)} km.`
        : 'Opcional: el próximo se agenda esos km después del kilometraje de ese día.';
  const title = service ? 'Editar service' : 'Nuevo service';

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
          {service && (
            <p className="hint form-intro">
              {[service.createdByName ? `Lo cargó ${service.createdByName}` : null, Number.isFinite(Date.parse(service.updatedAt)) ? `última modificación el ${formatDay(dayInZone(Date.parse(service.updatedAt)))}` : null].filter(Boolean).join(' · ')}
            </p>
          )}
          {formError && (
            <p className="form-error" role="alert">
              <Icon name="warning" size={18} /> {formError}
            </p>
          )}

          <fieldset>
            <legend>Service</legend>
            <div className="form-grid">
              {field(
                'vehicle',
                'Camión',
                <select {...fieldProps('vehicle')} value={values.vehicle} onChange={(e) => set('vehicle', e.target.value)}>
                  <option value="">Elegí el camión…</option>
                  {choices.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>,
              )}
              {field(
                'kindChoice',
                'Tipo de service',
                <select
                  {...fieldProps('kindChoice')}
                  value={values.kindChoice}
                  onChange={(e) => {
                    set('kindChoice', e.target.value);
                    if (e.target.value !== OTHER_KIND) set('kind', '');
                  }}
                >
                  <option value="">Elegí el tipo…</option>
                  {SERVICE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                  <option value={OTHER_KIND}>Otro (escribilo)</option>
                </select>,
              )}
              {values.kindChoice === OTHER_KIND && field('kind', 'Otro tipo', <input {...fieldProps('kind')} type="text" value={values.kind} maxLength={SERVICE_LIMITS.kind} autoComplete="off" onChange={(e) => set('kind', e.target.value)} />, 'Por ejemplo: Embrague, Batería, Correa.')}
            </div>
          </fieldset>

          <fieldset>
            <legend>¿Ya se hizo?</legend>
            <div className="chips form-choice" role="radiogroup" aria-label="¿Ya se hizo?">
              {[
                { done: false, label: 'Todavía no' },
                { done: true, label: 'Sí, ya se hizo' },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={values.done === o.done}
                  className={`chip${values.done === o.done ? ' is-on' : ''}`}
                  onClick={() => {
                    set('done', o.done);
                    if (o.done && values.doneOn === '') set('doneOn', today);
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="form-grid">
              {values.done ? (
                <>
                  {field('doneOn', 'Fecha en que se hizo', <input {...fieldProps('doneOn')} type="date" value={values.doneOn} max={today} onChange={(e) => set('doneOn', e.target.value)} />)}
                  {field('odometerKm', 'Kilometraje ese día', kmInput('odometerKm'), kmNote('odometerKm', 'Opcional: el del tablero del camión.'))}
                </>
              ) : (
                <>
                  {field('dueOn', 'Fecha prevista', <input {...fieldProps('dueOn')} type="date" value={values.dueOn} onChange={(e) => set('dueOn', e.target.value)} />, 'Opcional: se avisa 15 días antes.')}
                  {field('dueKm', 'A los km', kmInput('dueKm'), kmNote('dueKm', 'Opcional: se avisa 1.000 km antes.'))}
                </>
              )}
              {field('intervalKm', 'Se repite cada (km)', kmInput('intervalKm'), intervalNote)}
            </div>
          </fieldset>

          {field('notes', 'Notas', <textarea {...fieldProps('notes')} rows={2} value={values.notes} maxLength={SERVICE_LIMITS.notes} onChange={(e) => set('notes', e.target.value)} />, 'Opcional: taller, repuestos, costo…', true)}
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
            {service && (
              <button type="button" className="btn btn-quiet footer-start" onClick={() => setDeleting(true)} disabled={busy}>
                <Icon name="trash" size={18} /> Eliminar
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
      {deleting && service && (
        <ConfirmDialog title="¿Eliminar este service?" confirmLabel="Eliminar" danger busy={remove.isPending} onConfirm={() => void toDelete()} onCancel={() => setDeleting(false)}>
          <p>
            {service.kind} · {service.vehicle}. Se borra para siempre, también en la app. No se puede deshacer.
          </p>
        </ConfirmDialog>
      )}
    </dialog>
  );
}
