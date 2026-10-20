// A fuel receipt in a dialog: a new one typed in the panel (with a photo or by hand, in the name of whoever loads it and
// without a trip), or the correction of any receipt. A correction never changes what was declared: it goes in
// panel_data. Closing it with changes asks first; if someone else saved the receipt meanwhile, nothing is overwritten.
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { usePanelUser } from '../auth/AuthProvider';
import { ConflictError, describeWriteError, receiptExists } from '../data/api';
import { useCreateReceipt, useUpdateReceipt } from '../data/hooks';
import { formatDay } from '../lib/dates';
import { type CatalogStation, type Receipt } from '../lib/fuel';
import { arrivalNote, correctedPanelData, FUEL_LIMITS, newReceiptRow, type ReceiptField, receiptFormChanged, type ReceiptFormValues, receiptFormValues, sameReceipt, validateReceiptForm } from '../lib/fuelForm';
import { type CatalogTruck, truckLabel } from '../lib/fleet';
import { decimal } from '../lib/format';
import { parseNumber } from '../lib/numbers';
import { photoJpeg } from '../lib/photo';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import { type Photo, PhotoDialog } from './PhotoDialog';

interface Props {
  /** The receipt to correct; null types a new one. */
  receipt: Receipt | null;
  today: string;
  stations: readonly CatalogStation[];
  /** Names of stations written by hand in other receipts, to suggest them. */
  writtenStations: readonly string[];
  trucks: readonly CatalogTruck[];
  onClose: () => void;
  /** What happened, for the page to say it. */
  onDone: (text: string) => void;
  /** Someone else changed the receipt while it was open here: nothing was saved. */
  onConflict: () => void;
}

const OTHER = '__otra__';
const unique = (values: readonly string[]) => [...new Set(values.filter((v) => v.trim() !== ''))].sort((a, b) => a.localeCompare(b, 'es'));

type PhotoState = { status: 'none' } | { status: 'preparing' } | { status: 'ready'; blob: Blob; preview: string } | { status: 'failed' };

export function ReceiptFormDialog({ receipt: opened, today, stations, writtenStations, trucks, onClose, onDone, onConflict }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  const { user } = usePanelUser();
  // The receipt as it was when the form opened: the save is checked against this version.
  const [receipt] = useState(opened);
  // A new receipt keeps its id while the dialog is open: a save tried again does not make a second one. Its photo goes
  // to a path made with the id and stays there, so another photo after a try needs another id.
  const [newId, setNewId] = useState(() => crypto.randomUUID());
  // The last save tried with that id, and the photo it had (none is a photo too).
  const tried = useRef<{ photo: Blob | null } | null>(null);
  const [checking, setChecking] = useState(false);
  const [initial] = useState(() => receiptFormValues(receipt, stations, today));
  const [values, setValues] = useState(initial);
  // A listed station shows in the list; one written by hand, in the text box below it.
  const [pickOther, setPickOther] = useState(initial.stationId === '' && initial.station !== '');
  const [errors, setErrors] = useState<Partial<Record<ReceiptField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [binning, setBinning] = useState(false);
  const [photo, setPhoto] = useState<PhotoState>({ status: 'none' });
  const [viewing, setViewing] = useState<Photo | null>(null);
  const create = useCreateReceipt();
  const update = useUpdateReceipt();
  const busy = create.isPending || update.isPending || checking;
  const dirty = receiptFormChanged(initial, values) || photo.status === 'ready';

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

  const set = <K extends ReceiptField>(field: K, value: ReceiptFormValues[K]) => {
    setValues((v) => ({ ...v, [field]: value }));
    // An old message goes away as soon as its field is edited; the station's list and its text box are one field.
    const gone: ReceiptField[] = field === 'stationId' || field === 'station' ? ['stationId', 'station'] : [field];
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !gone.includes(k as ReceiptField))));
    setLeaving(false);
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhoto({ status: 'preparing' });
    try {
      const blob = await photoJpeg(file);
      // A data: address, which the panel's Content-Security-Policy allows for images (blob: is not).
      const preview = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer la foto'));
        reader.readAsDataURL(blob);
      });
      setPhoto({ status: 'ready', blob, preview });
    } catch (e) {
      console.error(e);
      setPhoto({ status: 'failed' });
    }
  };

  const fail = (err: unknown) => {
    if (err instanceof ConflictError) {
      onConflict();
      return;
    }
    console.error(err);
    setFormError(describeWriteError(err, 'boletas'));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    if (photo.status === 'preparing') {
      setFormError('Esperá a que termine de prepararse la foto.');
      return;
    }
    const check = validateReceiptForm(values, stations, today, receipt?.declared);
    setErrors(check.errors);
    if (!check.ok) {
      setFormError('Revisá los campos marcados.');
      form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    try {
      if (!receipt) {
        const blob = photo.status === 'ready' ? photo.blob : null;
        let rid = newId;
        const before = tried.current;
        if (before && before.photo !== blob) {
          // The try with the other photo, or without one, may have saved the receipt after all: then that one stands.
          setChecking(true);
          const saved = await receiptExists(rid).finally(() => setChecking(false));
          if (saved) {
            onDone(
              before.photo
                ? 'Esa boleta ya se había guardado en el intento anterior, con la foto que tenía entonces.'
                : 'Esa boleta ya se había guardado en el intento anterior, sin foto. Para que tenga la foto, mandala a la papelera y cargala de nuevo con la foto.',
            );
            return;
          }
          // Not saved: a photo of that try stays at that receipt's path, unused, and this one goes with a new id.
          rid = crypto.randomUUID();
          setNewId(rid);
        }
        tried.current = { photo: blob };
        const row = newReceiptRow(rid, user, check.payload, blob !== null);
        const saved = await create.mutateAsync({ row, photo: blob });
        onDone(sameReceipt(saved, row) ? 'Boleta cargada.' : 'Esa boleta ya se había guardado en el intento anterior, con lo que tenía entonces: revisala y, si hace falta, corregila.');
        return;
      }
      if (!receiptFormChanged(initial, values)) {
        onClose();
        return;
      }
      await update.mutateAsync({ receipt, changes: { panel_data: correctedPanelData(receipt, initial, values, check.payload, stations, trucks) } });
      onDone('Boleta corregida.');
    } catch (err) {
      fail(err);
    }
  };

  const toBin = async () => {
    if (!receipt) return;
    try {
      await update.mutateAsync({ receipt, changes: { archived: true } });
      onDone('La boleta está en la papelera: no cuenta en los totales ni en la cuenta de la estación. La podés restaurar desde «Papelera».');
    } catch (err) {
      setBinning(false);
      fail(err);
    }
  };

  // The station's list and its text box are one field: a missing station shows under whichever of them is on screen.
  const errorOf = (name: ReceiptField) => (name === 'stationId' ? (errors.stationId ?? (pickOther ? undefined : errors.station)) : errors[name]);
  const fieldProps = (name: ReceiptField) => ({ id: `${id}-${name}`, 'aria-invalid': errorOf(name) ? true : undefined, 'aria-describedby': `${id}-${name}-note` });
  const field = (name: ReceiptField, label: string, control: ReactNode, note?: ReactNode) => (
    <div className="field">
      <label htmlFor={`${id}-${name}`}>{label}</label>
      {control}
      <p className={errorOf(name) ? 'field-error' : 'hint'} id={`${id}-${name}-note`}>
        {errorOf(name) ?? note}
      </p>
    </div>
  );
  const numberInput = (name: 'liters' | 'total', unit: string, decimals: number) => {
    const parsed = parseNumber(values[name]);
    const preview = parsed.ok ? (parsed.value === null ? '' : `Se guarda: ${decimal(parsed.value, decimals)}${unit}`) : parsed.error;
    return [<input key="input" {...fieldProps(name)} type="text" inputMode="decimal" value={values[name]} autoComplete="off" onChange={(e) => set(name, e.target.value)} />, preview] as const;
  };

  const [liters, litersNote] = numberInput('liters', ' L', 2);
  const [total, totalNote] = numberInput('total', '', 2);
  const declared = receipt?.declared;
  const title = receipt ? 'Corregir boleta' : 'Nueva boleta';

  return (
    <dialog
      ref={dialog}
      className="form-dialog"
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

        <datalist id={`${id}-trucks`}>{unique(trucks.map(truckLabel)).map((v) => <option key={v} value={v} />)}</datalist>
        <datalist id={`${id}-written`}>{unique(writtenStations).map((v) => <option key={v} value={v} />)}</datalist>

        <div className="form-body">
          {receipt && declared && (
            <div className="gps-facts" aria-label="Lo que se declaró">
              <strong>{receipt.tripId ? 'Lo cargó el chofer en un viaje' : 'Se cargó sin viaje'} · {receipt.driverName ?? 'sin nombre'}</strong>
              <span>Fecha: {declared.date ? formatDay(declared.date) : '—'}</span>
              <span>Estación: {declared.station ?? '—'}</span>
              <span>Camión: {declared.vehicle ?? '—'}</span>
              <span>Litros: {declared.liters === null ? '—' : decimal(declared.liters, 2)}</span>
              <span>Importe: {declared.total === null ? '—' : decimal(declared.total, 2)}</span>
              <span className="facts-note">Lo declarado no se cambia: la corrección se guarda aparte y es lo que cuenta en los totales.</span>
              {receipt.objectPath && (
                <button type="button" className="link-button" onClick={() => setViewing({ bucket: 'trf-fuel-receipts', path: receipt.objectPath as string, title: `Boleta de ${receipt.station ?? 'combustible'}` })}>
                  Ver la foto de la boleta
                </button>
              )}
            </div>
          )}
          {formError && (
            <p className="form-error" role="alert">
              <Icon name="warning" size={18} /> {formError}
            </p>
          )}

          {!receipt && (
            <fieldset>
              <legend>Foto de la boleta</legend>
              <div className="photo-pick">
                {photo.status === 'ready' && <img src={photo.preview} alt="Foto elegida de la boleta" />}
                <div>
                  <label className="btn">
                    <Icon name="plus" size={18} /> {photo.status === 'ready' ? 'Cambiar foto' : 'Sacar o elegir foto'}
                    <input type="file" accept="image/*" className="visually-hidden" aria-label="Foto de la boleta" onChange={(e) => void pickPhoto(e.target.files?.[0])} disabled={busy} />
                  </label>
                  {photo.status === 'ready' && (
                    <button type="button" className="link-button" onClick={() => setPhoto({ status: 'none' })} disabled={busy}>
                      Quitar la foto
                    </button>
                  )}
                  <p className={photo.status === 'failed' ? 'field-error' : 'hint'} role={photo.status === 'failed' ? 'alert' : undefined}>
                    {photo.status === 'preparing'
                      ? 'Preparando la foto…'
                      : photo.status === 'failed'
                        ? 'No se pudo leer esa foto. Probá con otra (JPG o PNG).'
                        : photo.status === 'ready'
                          ? `Lista: ${decimal(photo.blob.size / 1024, 0)} KB.`
                          : 'Opcional: también se puede cargar a mano.'}
                  </p>
                </div>
              </div>
            </fieldset>
          )}

          <fieldset>
            <legend>Carga</legend>
            <div className="form-grid">
              {field('date', 'Fecha de la boleta', <input {...fieldProps('date')} type="date" value={values.date} max={today} onChange={(e) => set('date', e.target.value)} />, arrivalNote(receipt, values.date, today))}
              {field(
                'stationId',
                'Estación',
                <select
                  {...fieldProps('stationId')}
                  value={pickOther ? OTHER : values.stationId}
                  onChange={(e) => {
                    const other = e.target.value === OTHER;
                    setPickOther(other);
                    set('stationId', other ? '' : e.target.value);
                    if (!other) set('station', '');
                  }}
                >
                  <option value="">Elegí la estación…</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value={OTHER}>Otra (escribila)</option>
                </select>,
                stations.length === 0 ? 'La app todavía no tiene estaciones en su lista: elegí «Otra».' : undefined,
              )}
              {pickOther && field('station', 'Nombre de la estación', <input {...fieldProps('station')} type="text" value={values.station} maxLength={FUEL_LIMITS.station} list={`${id}-written`} autoComplete="off" onChange={(e) => set('station', e.target.value)} />, 'Se agrupa con las que tienen el mismo nombre, sin importar mayúsculas ni tildes.')}
              {field('vehicle', 'Camión', <input {...fieldProps('vehicle')} type="text" value={values.vehicle} maxLength={FUEL_LIMITS.vehicle} list={`${id}-trucks`} autoComplete="off" onChange={(e) => set('vehicle', e.target.value)} />, 'Opcional')}
            </div>
          </fieldset>

          <fieldset>
            <legend>Importe</legend>
            <div className="form-grid">
              {field('liters', 'Litros', liters, litersNote || 'Opcional')}
              {field('total', 'Importe', total, totalNote)}
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
          {!receipt && <p className="hint">Queda a tu nombre ({user.name}) y sin viaje, como las boletas que el chofer carga fuera de un viaje.</p>}
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
            {receipt && (
              <button type="button" className="btn btn-quiet footer-start" onClick={() => setBinning(true)} disabled={busy}>
                <Icon name="trash" size={18} /> Mandar a la papelera
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
      {binning && (
        <ConfirmDialog title="¿Mandar esta boleta a la papelera?" confirmLabel="Mandar a la papelera" danger busy={update.isPending} onConfirm={() => void toBin()} onCancel={() => setBinning(false)}>
          <p>Deja de contar en los totales y en la cuenta de la estación. La foto y lo que se declaró no se borran, y la podés restaurar cuando quieras desde «Papelera».</p>
        </ConfirmDialog>
      )}
    </dialog>
  );
}
