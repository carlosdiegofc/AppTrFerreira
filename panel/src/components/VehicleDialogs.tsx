// The forms of Flota, in dialogs: the card of a truck or a trailer with its photo, which trailer a truck takes from a
// day, the day it stops taking it, and annulling a hitch loaded by mistake. Nothing is deleted: a vehicle sold keeps its
// card with the day it left, and an annulled hitch stays saved. Closing with changes asks first; if someone else saved
// meanwhile, nothing is overwritten.
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ConflictError, DataError, describeWriteError } from '../data/api';
import { useHitchTrailer, usePhotoUrl, useSaveHitch, useSaveVehicle } from '../data/hooks';
import { formatDay } from '../lib/dates';
import { savedAsSent } from '../lib/drivers';
import type { CatalogTruck } from '../lib/fleet';
import { decimal } from '../lib/format';
import { photoJpeg } from '../lib/photo';
import {
  dayBefore,
  type Hitch,
  hitchDays,
  TRAILER_BODIES,
  trailerLabel,
  trailerTrucks,
  truckIdentity,
  validateHitch,
  validateUnhitch,
  validateVehicle,
  type Vehicle,
  VEHICLE_LIMITS,
  type VehicleFormValues,
  vehicleFormValues,
  type VehicleKind,
  type VehicleRow,
} from '../lib/vehicles';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import { type Photo, PhotoDialog } from './PhotoDialog';

interface Common {
  today: string;
  onClose: () => void;
  onDone: (text: string, tone?: 'ok' | 'warn') => void;
  onConflict: () => void;
}

/** What every form here shares: the dialog that opens itself, the values, their errors and closing with changes. */
function useForm<V extends object>(initial: V, busy: boolean, onClose: () => void, changedApart = false) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof V, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const dirty = changedApart || JSON.stringify(values) !== JSON.stringify(initial);

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
  return { dialog, form, id, values, errors, set, check, formError, setFormError, leaving, setLeaving, dirty, requestClose, props, field };
}

function Shell({
  f,
  title,
  intro,
  busy,
  onClose,
  onSubmit,
  children,
}: {
  f: Pick<ReturnType<typeof useForm<object>>, 'dialog' | 'form' | 'id' | 'requestClose' | 'formError' | 'leaving' | 'setLeaving'>;
  title: string;
  intro?: ReactNode;
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
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

const dataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer la foto'));
    reader.readAsDataURL(blob);
  });

const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${decimal(bytes / 1024 / 1024, 1)} MB` : `${decimal(bytes / 1024, 0)} KB`);

/** The photo: the one the card has stays, a new one is ready, the one it has goes, or the one picked could not be read. */
type PhotoState = { status: 'keep' } | { status: 'preparing' } | { status: 'ready'; jpeg: Blob; preview: string; fileId: string } | { status: 'removed' } | { status: 'failed'; reason: string };

const LEFT_REASONS = ['Vendido', 'Reemplazado', 'Fuera de servicio'] as const;

/** The photo a card has, small: a private link the storage gives to the panel accounts. */
export function VehicleThumb({ path, title, onOpen }: { path: string | null; title: string; onOpen?: (photo: Photo) => void }) {
  const url = usePhotoUrl('trf-fleet-photos', path);
  if (!path) {
    return (
      <span className="vehicle-thumb is-empty" aria-hidden="true">
        <Icon name="truck" size={26} />
      </span>
    );
  }
  const img = url.data ? <img src={url.data} alt={`Foto de ${title}`} /> : <Icon name="truck" size={26} />;
  return onOpen ? (
    <button type="button" className="vehicle-thumb" onClick={() => onOpen({ bucket: 'trf-fleet-photos', path, title })} aria-label={`Ver la foto de ${title}`}>
      {img}
    </button>
  ) : (
    <span className="vehicle-thumb">{img}</span>
  );
}

// ---- The card ----

export function VehicleFormDialog({
  vehicle,
  kind,
  truck,
  label,
  taken,
  today,
  onClose,
  onDone,
  onConflict,
  onCreated,
}: Common & {
  /** The card to change; null makes a new one. */
  vehicle: Vehicle | null;
  kind: VehicleKind;
  /** A truck's catalog truck: a new truck card goes with it. */
  truck: CatalogTruck | null;
  /** How the truck is named (the catalog's name), or the trailer's plate. */
  label: string;
  /** The keys of every other truck and trailer: a trailer's plate is its own. */
  taken: ReadonlySet<string>;
  onCreated?: (saved: VehicleRow) => void;
}) {
  const save = useSaveVehicle();
  const [newId] = useState(() => crypto.randomUUID());
  // The card as it was when the form opened: a read meanwhile must not hand a newer version to the stale values.
  const [base] = useState(vehicle);
  const [initial] = useState(() => vehicleFormValues(base, kind === 'truck' ? truck : null));
  const [photo, setPhoto] = useState<PhotoState>({ status: 'keep' });
  const [viewing, setViewing] = useState<Photo | null>(null);
  const photoChanged = photo.status === 'ready' || photo.status === 'removed';
  const f = useForm<VehicleFormValues>(initial, save.isPending, onClose, photoChanged);
  const v = f.values;
  const id = base?.id ?? newId;
  const current = base?.photoPath ?? null;
  const thumb = usePhotoUrl('trf-fleet-photos', photo.status === 'keep' ? current : null);

  // Each photo chosen gets a number: a big photo still being prepared does not replace one chosen after it.
  const picks = useRef(0);
  const settle = (state: PhotoState) => {
    picks.current++;
    setPhoto(state);
  };
  const pick = async (picked: File | undefined) => {
    if (!picked) return;
    const turn = ++picks.current;
    const show = (state: PhotoState) => {
      if (turn === picks.current) setPhoto(state);
    };
    show({ status: 'preparing' });
    try {
      const jpeg = await photoJpeg(picked);
      // A data: address, which the panel's Content-Security-Policy allows for images (blob: is not).
      show({ status: 'ready', jpeg, preview: await dataUrl(jpeg), fileId: crypto.randomUUID() });
    } catch (e) {
      console.error(e);
      show({ status: 'failed', reason: 'No se pudo leer esa foto. Probá con una foto JPG o PNG.' });
    }
  };

  const submit = async () => {
    f.setFormError(null);
    if (photo.status === 'preparing') {
      f.setFormError('Esperá a que termine de prepararse la foto.');
      return;
    }
    const { row, errors } = validateVehicle(v, kind, today, kind === 'truck' ? truckIdentity(base, truck) : null, taken);
    if (!f.check(errors) || !row) return;
    if (base && !f.dirty) return onClose();
    const upload = photo.status === 'ready' ? { path: `${id}/${photo.fileId}.jpg`, jpeg: photo.jpeg } : null;
    const sent = { ...row, ...(base ? {} : { id }), ...(photo.status === 'removed' ? { photo_path: null } : {}) };
    try {
      const saved = await save.mutateAsync({ vehicle: base, row: sent, photo: upload });
      if (!base && !savedAsSent(saved, upload ? { ...sent, photo_path: upload.path } : sent)) {
        onDone('Esa ficha ya se había guardado en el intento anterior, con lo que tenía entonces: revisala y, si hace falta, corregila.', 'warn');
        onCreated?.(saved);
        return;
      }
      onDone(base ? 'Ficha guardada.' : kind === 'truck' ? `Ficha de ${label} creada.` : `Acoplado ${row.plate} cargado.`);
      if (!base) onCreated?.(saved);
    } catch (err) {
      if (err instanceof ConflictError) return onConflict();
      // Someone else made the card of this truck meanwhile, or a card with this plate.
      if (err instanceof DataError && err.code === '23505') {
        if (kind === 'truck') return onConflict();
        f.check({ plate: 'Ya hay un camión o un acoplado con esa matrícula.' });
        return;
      }
      console.error(err);
      f.setFormError(describeWriteError(err, 'fichas'));
    }
  };

  const busy = save.isPending;
  const photoInput = (text: string) => (
    <label className="btn">
      <Icon name="plus" size={18} /> {text}
      <input type="file" accept="image/*" className="visually-hidden" aria-label="Foto" onChange={(e) => void pick(e.target.files?.[0])} disabled={busy} />
    </label>
  );
  const title = base ? (kind === 'truck' ? `Ficha de ${label}` : `Acoplado ${base.plate}`) : kind === 'truck' ? `Ficha de ${label}` : 'Nuevo acoplado';

  return (
    <>
      <Shell
        f={f}
        title={title}
        intro={kind === 'truck' ? 'El nombre y la matrícula salen de la lista de camiones que usa la app. La ficha le agrega los datos y la foto.' : 'Cada acoplado va con su matrícula. Sus papeles se cargan en Documentación.'}
        busy={busy}
        onClose={onClose}
        onSubmit={() => void submit()}
      >
        <div className="form-grid">
          {kind === 'trailer' &&
            f.field(
              'plate',
              'Matrícula',
              <input {...f.props('plate')} type="text" value={v.plate} maxLength={VEHICLE_LIMITS.plate + 4} autoComplete="off" onChange={(e) => f.set('plate', e.target.value)} />,
              base && v.plate.trim().toUpperCase().replace(/[\s-]+/g, '') !== base.plate ? 'Sus papeles de Documentación siguen con la matrícula anterior: cambialos ahí también.' : 'Como figura en la libreta.',
            )}
          {kind === 'trailer' &&
            f.field(
              'body',
              'Tipo',
              <>
                <input {...f.props('body')} type="text" list={`${f.id}-bodies`} value={v.body} maxLength={VEHICLE_LIMITS.body} autoComplete="off" onChange={(e) => f.set('body', e.target.value)} />
                <datalist id={`${f.id}-bodies`}>
                  {TRAILER_BODIES.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </>,
              'Semirremolque, cisterna, volcadora…',
            )}
          {f.field('brand', 'Marca', <input {...f.props('brand')} type="text" value={v.brand} maxLength={VEHICLE_LIMITS.brand} autoComplete="off" onChange={(e) => f.set('brand', e.target.value)} />)}
          {f.field('model', 'Modelo', <input {...f.props('model')} type="text" value={v.model} maxLength={VEHICLE_LIMITS.model} autoComplete="off" onChange={(e) => f.set('model', e.target.value)} />)}
          {f.field('year', 'Año', <input {...f.props('year')} type="text" inputMode="numeric" value={v.year} maxLength={4} autoComplete="off" onChange={(e) => f.set('year', e.target.value)} />)}
          {f.field('chassis', 'Número de chasis', <input {...f.props('chassis')} type="text" value={v.chassis} maxLength={VEHICLE_LIMITS.chassis} autoComplete="off" onChange={(e) => f.set('chassis', e.target.value)} />)}
          {kind === 'truck' && f.field('engine', 'Número de motor', <input {...f.props('engine')} type="text" value={v.engine} maxLength={VEHICLE_LIMITS.engine} autoComplete="off" onChange={(e) => f.set('engine', e.target.value)} />)}
          {f.field(
            'capacity',
            'Capacidad de carga',
            <input {...f.props('capacity')} type="text" inputMode="decimal" value={v.capacity} autoComplete="off" onChange={(e) => f.set('capacity', e.target.value)} />,
            'Lo que lleva: kilos, o metros cúbicos si es cisterna.',
          )}
          {f.field(
            'capacityUnit',
            'En',
            <select {...f.props('capacityUnit')} value={v.capacityUnit} onChange={(e) => f.set('capacityUnit', e.target.value === 'm3' ? 'm3' : 'kg')}>
              <option value="kg">Kilos (kg)</option>
              <option value="m3">Metros cúbicos (m³)</option>
            </select>,
          )}
        </div>

        <fieldset>
          <legend>Foto</legend>
          <div className="photo-pick">
            {photo.status === 'ready' && <img src={photo.preview} alt="Foto elegida" />}
            {photo.status === 'keep' && current && thumb.data && <img src={thumb.data} alt="Foto de la ficha" />}
            <div>
              {photo.status === 'ready' ? (
                <>
                  {photoInput('Cambiar foto')}
                  <button type="button" className="link-button" onClick={() => settle({ status: 'keep' })} disabled={busy}>
                    {current ? 'Dejar la que tenía' : 'Quitarla'}
                  </button>
                  <p className="hint">Foto lista: {size(photo.jpeg.size)}.</p>
                </>
              ) : photo.status === 'removed' ? (
                <>
                  <button type="button" className="btn" onClick={() => settle({ status: 'keep' })} disabled={busy}>
                    <Icon name="undo" size={18} /> No quitarla
                  </button>
                  <p className="hint">Al guardar, la ficha queda sin foto.</p>
                </>
              ) : current && photo.status === 'keep' ? (
                <>
                  <button type="button" className="btn" onClick={() => setViewing({ bucket: 'trf-fleet-photos', path: current, title: label })}>
                    <Icon name="external" size={18} /> Ver la foto
                  </button>
                  {photoInput('Reemplazar')}
                  <button type="button" className="link-button" onClick={() => settle({ status: 'removed' })} disabled={busy}>
                    Quitar la foto
                  </button>
                </>
              ) : (
                <>
                  {photoInput('Elegir foto')}
                  <p className={photo.status === 'failed' ? 'field-error' : 'hint'} role={photo.status === 'failed' ? 'alert' : undefined}>
                    {photo.status === 'preparing' ? 'Preparando la foto…' : photo.status === 'failed' ? photo.reason : 'Opcional: se achica como las de las boletas.'}
                  </p>
                </>
              )}
            </div>
          </div>
        </fieldset>

        {f.field('notes', 'Notas', <textarea {...f.props('notes')} rows={2} value={v.notes} maxLength={VEHICLE_LIMITS.notes} onChange={(e) => f.set('notes', e.target.value)} />, undefined, true)}
        {base && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={v.gone}
              onChange={(e) => {
                f.set('gone', e.target.checked);
                if (e.target.checked && !v.leftOn) f.set('leftOn', today);
              }}
            />
            Se vendió o dejó de usarse (la ficha queda guardada, con su historial)
          </label>
        )}
        {base && v.gone && (
          <div className="form-grid">
            {f.field('leftOn', 'Desde el', <input {...f.props('leftOn')} type="date" value={v.leftOn} max={today} onChange={(e) => f.set('leftOn', e.target.value)} />)}
            {f.field(
              'leftReason',
              'Motivo',
              <>
                <input {...f.props('leftReason')} type="text" list={`${f.id}-reasons`} value={v.leftReason} maxLength={VEHICLE_LIMITS.leftReason} autoComplete="off" onChange={(e) => f.set('leftReason', e.target.value)} />
                <datalist id={`${f.id}-reasons`}>
                  {LEFT_REASONS.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </>,
              'Opcional.',
            )}
          </div>
        )}
      </Shell>
      <PhotoDialog photo={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

// ---- Which trailer a truck takes ----

export function HitchDialog({
  truck,
  current: openCurrent,
  trailers: openTrailers,
  hitches: openHitches,
  truckName,
  today,
  onClose,
  onDone,
  onConflict,
}: Common & {
  truck: { key: string; label: string };
  /** The hitch of the trailer it takes now. */
  current: Hitch | null;
  /** The trailers in use (not sold), to choose from. */
  trailers: readonly Vehicle[];
  hitches: readonly Hitch[];
  /** How a truck is named by its key: where a trailer is now. */
  truckName: (key: string) => string;
}) {
  const hitch = useHitchTrailer();
  const [newId] = useState(() => crypto.randomUUID());
  // What the office saw when the form opened: a save tried again after its answer was cut sends the same, and finds its
  // hitch by its id, even when the page has read it meanwhile.
  const [{ current, trailers, hitches }] = useState(() => ({ current: openCurrent, trailers: openTrailers, hitches: openHitches }));
  const [initial] = useState({ trailerId: '', fromOn: today, notes: '' });
  const f = useForm(initial, hitch.isPending, onClose);
  const v = f.values;
  const now = (id: string) => trailerTrucks(id, hitches).current;
  const choices = trailers.filter((t) => t.id !== current?.trailerId).sort((a, b) => trailerLabel(a).localeCompare(trailerLabel(b), 'es'));
  const chosen = choices.find((t) => t.id === v.trailerId) ?? null;
  const chosenNow = chosen ? now(chosen.id) : null;
  const currentTrailer = current ? (trailers.find((t) => t.id === current.trailerId) ?? null) : null;

  const submit = async () => {
    f.setFormError(null);
    const { errors, ok } = validateHitch(v, today, current, chosenNow);
    if (!f.check(errors) || !ok || !chosen) return;
    try {
      await hitch.mutateAsync({ id: newId, truckKey: truck.key, trailerId: chosen.id, fromOn: v.fromOn, truckNow: current?.id ?? null, trailerNow: chosenNow?.id ?? null, notes: v.notes.trim() });
      onDone(`${trailerLabel(chosen)} enganchado al ${truck.label} desde el ${formatDay(v.fromOn)}.`);
    } catch (err) {
      if (err instanceof ConflictError) return onConflict();
      console.error(err);
      const code = err instanceof DataError ? err.code : undefined;
      f.setFormError(
        code === '23P01'
          ? 'Esos días se pisan con otro enganche del mismo camión o del mismo acoplado: revisá el historial.'
          : code === '23514'
            ? 'La fecha tiene que ser posterior a la del enganche que tiene ahora.'
            : describeWriteError(err, 'enganches'),
      );
    }
  };

  return (
    <Shell
      f={f}
      title={current ? `Cambiar el acoplado del ${truck.label}` : `Enganchar un acoplado al ${truck.label}`}
      intro={
        current
          ? `Ahora lleva ${currentTrailer ? trailerLabel(currentTrailer) : 'un acoplado'} (${hitchDays(current).toLowerCase()}): queda en su historial hasta el día anterior al que elijas.`
          : 'El acoplado que lleva desde un día. Si cambia, se anota el nuevo y el anterior queda en el historial.'
      }
      busy={hitch.isPending}
      onClose={onClose}
      onSubmit={() => void submit()}
    >
      {choices.length === 0 ? (
        <p className="note">No hay otro acoplado cargado. Cargalo primero en Flota, en «Acoplados».</p>
      ) : (
        <div className="form-grid">
          {f.field(
            'trailerId',
            'Acoplado',
            <select {...f.props('trailerId')} value={v.trailerId} onChange={(e) => f.set('trailerId', e.target.value)}>
              <option value="">Elegí uno</option>
              {choices.map((t) => {
                const at = now(t.id);
                return (
                  <option key={t.id} value={t.id}>
                    {trailerLabel(t)}
                    {at ? ` · en el ${truckName(at.truckKey)}` : ''}
                  </option>
                );
              })}
            </select>,
            chosenNow ? `Va en el ${truckName(chosenNow.truckKey)} ${hitchDays(chosenNow).toLowerCase()}: deja de ir en ese camión desde el día anterior.` : undefined,
          )}
          {f.field(
            'fromOn',
            'Desde el',
            <input {...f.props('fromOn')} type="date" value={v.fromOn} max={today} onChange={(e) => f.set('fromOn', e.target.value)} />,
            current && v.fromOn ? `El que lleva ahora queda hasta el ${formatDay(dayBefore(v.fromOn))}.` : undefined,
          )}
        </div>
      )}
      {choices.length > 0 && f.field('notes', 'Nota', <textarea {...f.props('notes')} rows={2} value={v.notes} maxLength={VEHICLE_LIMITS.hitchNotes} onChange={(e) => f.set('notes', e.target.value)} />, 'Opcional.', true)}
    </Shell>
  );
}

/** The day a truck stops taking its trailer, without another one. */
export function UnhitchDialog({ hitch: open, trailer, truckLabel: truck, today, onClose, onDone, onConflict }: Common & { hitch: Hitch; trailer: Vehicle | null; truckLabel: string }) {
  const save = useSaveHitch();
  const [base] = useState(open);
  const [initial] = useState({ toOn: today });
  const f = useForm(initial, save.isPending, onClose);
  const name = trailer ? trailerLabel(trailer) : 'El acoplado';

  const submit = async () => {
    f.setFormError(null);
    const error = validateUnhitch(f.values.toOn, base, today);
    if (!f.check(error ? { toOn: error } : {})) return;
    try {
      await save.mutateAsync({ hitch: base, row: { to_on: f.values.toOn } });
      onDone(`${name} desenganchado: el ${truck} lo llevó hasta el ${formatDay(f.values.toOn)}.`);
    } catch (err) {
      if (err instanceof ConflictError) return onConflict();
      console.error(err);
      f.setFormError(describeWriteError(err, 'enganches'));
    }
  };

  return (
    <Shell f={f} title={`Desenganchar ${name}`} intro={`El ${truck} lo lleva ${hitchDays(base).toLowerCase()}. Queda en el historial de los dos.`} busy={save.isPending} onClose={onClose} onSubmit={() => void submit()}>
      {f.field('toOn', 'Lo llevó hasta el', <input {...f.props('toOn')} type="date" value={f.values.toOn} min={base.fromOn} max={today} onChange={(e) => f.set('toOn', e.target.value)} />)}
    </Shell>
  );
}

/** A hitch loaded by mistake: it stays saved, but it no longer counts. */
export function AnnulHitchDialog({ hitch, what, onClose, onDone, onConflict }: Omit<Common, 'today'> & { hitch: Hitch; what: string }) {
  const save = useSaveHitch();
  const [error, setError] = useState<string | null>(null);
  const annul = async () => {
    setError(null);
    try {
      await save.mutateAsync({ hitch, row: { deleted_at: new Date().toISOString() } });
      onDone('Enganche anulado: queda guardado, pero ya no cuenta.');
    } catch (err) {
      if (err instanceof ConflictError) return onConflict();
      console.error(err);
      setError(describeWriteError(err, 'enganches'));
    }
  };
  return (
    <ConfirmDialog title="¿Anular este enganche?" confirmLabel="Anular" danger busy={save.isPending} onConfirm={() => void annul()} onCancel={onClose}>
      <p>
        {what}, {hitchDays(hitch).toLowerCase()}. Es para uno cargado por error: queda guardado, pero deja de contar en el historial.
      </p>
      {error && (
        <p className="form-error" role="alert">
          <Icon name="warning" size={18} /> {error}
        </p>
      )}
    </ConfirmDialog>
  );
}
