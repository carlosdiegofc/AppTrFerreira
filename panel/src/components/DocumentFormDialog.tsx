// A paper of a truck or a driver in a dialog: a new one, or a change to any paper, with its file (a photo, made smaller
// like the receipts, or a PDF). Deleting is for good, like in the app, and asks first. Closing with changes asks first;
// if someone else saved the paper meanwhile, nothing is overwritten.
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ConflictError, describeWriteError, refused } from '../data/api';
import { useDeletePaper, usePaperDrivers, useSavePaper } from '../data/hooks';
import {
  FILE_MAX_BYTES,
  type FileType,
  looksLikePdf,
  newPaperRow,
  OTHER_PAPER_KIND,
  PAPER_LIMITS,
  type Paper,
  paperChanges,
  type PaperField,
  paperFilePath,
  paperFormChanged,
  type PaperFormValues,
  paperFormValues,
  paperKinds,
  paperOwner,
  samePaper,
  validatePaperForm,
} from '../lib/documents';
import { decimal } from '../lib/format';
import { photoJpeg } from '../lib/photo';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import { type Photo, PhotoDialog } from './PhotoDialog';

interface Props {
  /** The paper to change; null loads a new one. */
  paper: Paper | null;
  vehicles: readonly string[];
  onClose: () => void;
  /** What happened, for the page to say it. */
  onDone: (text: string, tone?: 'ok' | 'warn') => void;
  /** Someone else changed or deleted the paper while it was open here: nothing was saved. */
  onConflict: () => void;
}

/** The file: the one the paper has stays, a new one is ready, the one it has goes, or the one picked could not be read. */
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

export function DocumentFormDialog({ paper: opened, vehicles, onClose, onDone, onConflict }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const id = useId();
  // The paper as it was when the form opened: the save is checked against this version.
  const [paper] = useState(opened);
  // A new paper keeps its id while the dialog is open: a save tried again does not make a second one.
  const [newId] = useState(() => crypto.randomUUID());
  const tried = useRef(false);
  // The files already sent with a save: one whose answer was cut may be saved, so it is never deleted on a later try.
  const sentFiles = useRef(new Set<string>());
  const [initial] = useState(() => paperFormValues(paper));
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<PaperField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [file, setFile] = useState<FileState>({ status: 'keep' });
  const [viewing, setViewing] = useState<Photo | null>(null);
  const drivers = usePaperDrivers(paper === null);
  const save = useSavePaper();
  const remove = useDeletePaper();
  const busy = save.isPending || remove.isPending;
  const dirty = paperFormChanged(initial, values) || file.status === 'ready' || file.status === 'removed';

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    form.current?.querySelector<HTMLElement>('.form-body button[role="radio"], .form-body select')?.focus();
  }, []);

  const requestClose = () => {
    if (busy) return;
    if (dirty) setLeaving(true);
    else onClose();
  };

  const set = <K extends PaperField>(field: K, value: PaperFormValues[K]) => {
    setValues((v) => ({ ...v, [field]: value }));
    const gone: PaperField[] = field === 'kindChoice' || field === 'kind' ? ['kindChoice', 'kind'] : [field];
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !gone.includes(k as PaperField))));
    setLeaving(false);
  };

  // Each file chosen gets a number: a big photo still being prepared does not replace one chosen after it.
  const picks = useRef(0);
  /** A choice made with the buttons: a file still being prepared does not come after it. */
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
        if (picked.size > FILE_MAX_BYTES) {
          show({ status: 'failed', reason: 'Ese PDF pesa más de 10 MB. Probá con uno más liviano o con una foto.' });
          return;
        }
        if (!looksLikePdf(new Uint8Array(await picked.slice(0, 5).arrayBuffer()))) {
          show({ status: 'failed', reason: 'Ese archivo no es un PDF que se pueda abrir.' });
          return;
        }
        show({ status: 'ready', blob: picked, type: 'pdf', preview: null, name: picked.name, fileId: crypto.randomUUID() });
        return;
      }
      const blob = await photoJpeg(picked);
      // A data: address, which the panel's Content-Security-Policy allows for images (blob: is not).
      show({ status: 'ready', blob, type: 'photo', preview: await dataUrl(blob), name: picked.name, fileId: crypto.randomUUID() });
    } catch (e) {
      console.error(e);
      show({ status: 'failed', reason: 'No se pudo leer ese archivo. Probá con una foto (JPG o PNG) o un PDF.' });
    }
  };

  const fail = (err: unknown) => {
    if (err instanceof ConflictError) {
      onConflict();
      return;
    }
    console.error(err);
    setFormError(describeWriteError(err, 'documentos'));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    if (file.status === 'preparing') {
      setFormError('Esperá a que termine de prepararse el archivo.');
      return;
    }
    const check = validatePaperForm(values, drivers.data ?? [], paper);
    setErrors(check.errors);
    if (!check.ok) {
      setFormError('Revisá los campos marcados.');
      form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    if (paper && !dirty) {
      onClose();
      return;
    }
    const path = file.status === 'ready' ? paperFilePath(paper?.id ?? newId, file.fileId, file.type) : null;
    const upload = file.status === 'ready' && path ? { path, blob: file.blob, type: file.type, fresh: !sentFiles.current.has(path) } : null;
    if (path) sentFiles.current.add(path);
    const objectPath = upload ? upload.path : file.status === 'removed' ? null : (paper?.file?.path ?? null);
    try {
      if (!paper) {
        const row = newPaperRow(newId, check.payload, objectPath);
        const retried = tried.current;
        tried.current = true;
        const saved = await save.mutateAsync({ paper: null, row, upload, previous: null });
        if (retried && !samePaper(saved, row)) onDone('Ese documento ya se había guardado en el intento anterior, con lo que tenía entonces: revisalo y, si hace falta, corregilo.', 'warn');
        else onDone(upload ? 'Documento cargado con su archivo.' : 'Documento cargado.');
        return;
      }
      await save.mutateAsync({ paper, row: paperChanges(check.payload, objectPath), upload, previous: paper.file?.path ?? null });
      onDone(file.status === 'removed' ? 'Documento guardado, sin archivo.' : 'Documento guardado.');
    } catch (err) {
      // Refused: the file of that first try was deleted, so a try again uploads it as new.
      if (upload?.fresh && refused(err)) sentFiles.current.delete(upload.path);
      fail(err);
    }
  };

  const toDelete = async () => {
    if (!paper) return;
    try {
      await remove.mutateAsync(paper);
      onDone('Documento eliminado.');
    } catch (err) {
      setDeleting(false);
      fail(err);
    }
  };

  const fieldProps = (name: PaperField) => ({ id: `${id}-${name}`, 'aria-invalid': errors[name] ? true : undefined, 'aria-describedby': `${id}-${name}-note` });
  const field = (name: PaperField, label: string, control: ReactNode, note?: ReactNode, full = false) => (
    <div className={`field${full ? ' field-full' : ''}`}>
      <label htmlFor={`${id}-${name}`}>{label}</label>
      {control}
      <p className={errors[name] ? 'field-error' : 'hint'} id={`${id}-${name}-note`}>
        {errors[name] ?? note}
      </p>
    </div>
  );

  const kinds = paperKinds(values.scope);
  const choices = values.vehicle && !vehicles.includes(values.vehicle) ? [values.vehicle, ...vehicles] : vehicles;
  const current = paper?.file ?? null;
  const fileInput = (label: string) => (
    <label className="btn">
      <Icon name="plus" size={18} /> {label}
      <input type="file" accept="image/*,application/pdf" className="visually-hidden" aria-label="Archivo del documento" onChange={(e) => void pick(e.target.files?.[0])} disabled={busy} />
    </label>
  );
  const title = paper ? 'Editar documento' : 'Nuevo documento';

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
          {formError && (
            <p className="form-error" role="alert">
              <Icon name="warning" size={18} /> {formError}
            </p>
          )}

          <fieldset>
            <legend>¿De quién es?</legend>
            {paper ? (
              <p className="form-intro">
                <strong>{paperOwner(paper)}</strong> · {paper.scope === 'vehicle' ? 'de un camión' : 'de un chofer'}
              </p>
            ) : (
              <div className="chips form-choice" role="radiogroup" aria-label="¿De quién es?">
                {[
                  { scope: 'vehicle' as const, label: 'De un camión' },
                  { scope: 'driver' as const, label: 'De un chofer' },
                ].map((o) => (
                  <button
                    key={o.scope}
                    type="button"
                    role="radio"
                    aria-checked={values.scope === o.scope}
                    className={`chip${values.scope === o.scope ? ' is-on' : ''}`}
                    onClick={() => {
                      if (values.scope === o.scope) return;
                      set('scope', o.scope);
                      // The kinds of the list are not the same for trucks and drivers.
                      if (values.kindChoice !== OTHER_PAPER_KIND) set('kindChoice', '');
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            <div className="form-grid">
              {values.scope === 'vehicle'
                ? field(
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
                  )
                : !paper &&
                  field(
                    'driverId',
                    'Chofer',
                    <select {...fieldProps('driverId')} value={values.driverId} onChange={(e) => set('driverId', e.target.value)} disabled={drivers.isLoading}>
                      <option value="">{drivers.isLoading ? 'Cargando los choferes…' : 'Elegí el chofer…'}</option>
                      {(drivers.data ?? []).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>,
                    drivers.error ? 'No se pudo leer la lista de choferes. Cerrá y volvé a intentar.' : 'Los que ya usaron la app.',
                  )}
              {field(
                'kindChoice',
                'Tipo de documento',
                <select
                  {...fieldProps('kindChoice')}
                  value={values.kindChoice}
                  onChange={(e) => {
                    set('kindChoice', e.target.value);
                    if (e.target.value !== OTHER_PAPER_KIND) set('kind', '');
                  }}
                >
                  <option value="">Elegí el tipo…</option>
                  {kinds.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                  <option value={OTHER_PAPER_KIND}>Otro (escribilo)</option>
                </select>,
              )}
              {values.kindChoice === OTHER_PAPER_KIND && field('kind', 'Otro tipo', <input {...fieldProps('kind')} type="text" value={values.kind} maxLength={PAPER_LIMITS.kind} autoComplete="off" onChange={(e) => set('kind', e.target.value)} />)}
              {field('expiresOn', 'Vencimiento', <input {...fieldProps('expiresOn')} type="date" value={values.expiresOn} onChange={(e) => set('expiresOn', e.target.value)} />, 'Opcional: se avisa 30 días antes.')}
            </div>
          </fieldset>

          <fieldset>
            <legend>Archivo</legend>
            <div className="photo-pick">
              {file.status === 'ready' && file.preview && <img src={file.preview} alt="Foto elegida del documento" />}
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
                      {current ? 'Dejar el que tenía' : 'Quitarlo'}
                    </button>
                    <p className="hint">{file.type === 'pdf' ? `PDF listo: ${file.name} (${size(file.blob.size)}).` : `Foto lista: ${size(file.blob.size)}.`}</p>
                  </>
                ) : file.status === 'removed' ? (
                  <>
                    <button type="button" className="btn" onClick={() => settle({ status: 'keep' })} disabled={busy}>
                      <Icon name="undo" size={18} /> No quitarlo
                    </button>
                    <p className="hint">El archivo se borra al guardar.</p>
                  </>
                ) : current && file.status !== 'preparing' && file.status !== 'failed' ? (
                  <>
                    <button type="button" className="btn" onClick={() => setViewing({ bucket: 'trf-documents', path: current.path, title: `${paper ? paperOwner(paper) : ''} · ${paper?.kind ?? ''}` })}>
                      <Icon name={current.type === 'pdf' ? 'doc' : 'external'} size={18} /> {current.type === 'pdf' ? 'Ver el PDF' : 'Ver la foto'}
                    </button>
                    {fileInput('Reemplazar')}
                    <button type="button" className="link-button" onClick={() => settle({ status: 'removed' })} disabled={busy}>
                      Quitar el archivo
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

          {field('notes', 'Notas', <textarea {...fieldProps('notes')} rows={2} value={values.notes} maxLength={PAPER_LIMITS.notes} onChange={(e) => set('notes', e.target.value)} />, 'Opcional: número, categoría, aseguradora…', true)}
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
            {paper && (
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
      <PhotoDialog photo={viewing} onClose={() => setViewing(null)} />
      {deleting && paper && (
        <ConfirmDialog title="¿Eliminar este documento?" confirmLabel="Eliminar" danger busy={remove.isPending} onConfirm={() => void toDelete()} onCancel={() => setDeleting(false)}>
          <p>
            {paper.kind} · {paperOwner(paper)}. Se borra para siempre, {paper.file ? 'con su archivo, ' : ''}también en la app. No se puede deshacer.
          </p>
        </ConfirmDialog>
      )}
    </dialog>
  );
}
