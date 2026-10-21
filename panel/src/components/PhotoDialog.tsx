// A photo of a delivery note, a fuel receipt or a paper, or the PDF of a paper. The files are private: each opening asks
// the storage for a link that expires, and the storage rules decide who may open it.
import { useEffect, useRef, useState } from 'react';
import { type PhotoBucket, photoUrl } from '../data/api';
import { Icon } from './Icon';
import { ErrorNote, Skeleton } from './ui';

export interface Photo {
  bucket: PhotoBucket;
  path: string;
  title: string;
}

/** The link of one opening: another file opened after it never shows it, not even for a moment. */
type State = { photo: Photo | null } & ({ status: 'loading' } | { status: 'ready'; url: string } | { status: 'failed' });

export function PhotoDialog({ photo, onClose }: { photo: Photo | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [opened, setState] = useState<State>({ photo: null, status: 'loading' });
  const state: State = opened.photo === photo ? opened : { photo, status: 'loading' };
  const pdf = photo !== null && /\.pdf$/i.test(photo.path);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (photo && !d.open) d.showModal();
    if (!photo && d.open) d.close();
  }, [photo]);

  useEffect(() => {
    if (!photo) return;
    let alive = true;
    photoUrl(photo.bucket, photo.path).then(
      (url) => alive && setState({ photo, status: 'ready', url }),
      () => alive && setState({ photo, status: 'failed' }),
    );
    return () => {
      alive = false;
    };
  }, [photo]);

  return (
    <dialog
      ref={dialog}
      className="photo-dialog"
      aria-label={photo?.title ?? 'Foto'}
      onClose={onClose}
      // A click on the dark backdrop closes it, like the close button.
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
    >
      <header>
        <h2>{photo?.title}</h2>
        <button type="button" className="btn btn-icon" aria-label={pdf ? 'Cerrar' : 'Cerrar la foto'} onClick={() => dialog.current?.close()}>
          <Icon name="close" size={18} />
        </button>
      </header>
      {state.status === 'loading' ? (
        <Skeleton lines={4} />
      ) : state.status === 'failed' ? (
        <ErrorNote>{pdf ? 'El archivo todavía no llegó al servidor o esta cuenta no tiene permiso para verlo.' : 'La foto todavía no llegó al servidor o esta cuenta no tiene permiso para verla.'}</ErrorNote>
      ) : pdf ? (
        // The panel does not show other sites inside it (its Content-Security-Policy): a PDF opens in its own tab.
        <div className="pdf-open">
          <Icon name="doc" size={40} />
          <p>Es un PDF: se abre en otra pestaña. El enlace dura diez minutos.</p>
          <a className="btn btn-primary" href={state.url} target="_blank" rel="noopener noreferrer">
            Abrir el PDF <Icon name="external" size={16} />
          </a>
        </div>
      ) : (
        <>
          <img src={state.url} alt={photo?.title ?? 'Foto'} onError={() => setState({ photo, status: 'failed' })} />
          <a className="link" href={state.url} target="_blank" rel="noopener noreferrer">
            Abrir en otra pestaña <Icon name="external" size={16} />
          </a>
        </>
      )}
    </dialog>
  );
}
