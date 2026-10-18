// A photo of a delivery note or a fuel receipt. The photos are private: each opening asks the storage for a link that
// expires, and the storage rules decide who may open it.
import { useEffect, useRef, useState } from 'react';
import { type PhotoBucket, photoUrl } from '../data/api';
import { Icon } from './Icon';
import { ErrorNote, Skeleton } from './ui';

export interface Photo {
  bucket: PhotoBucket;
  path: string;
  title: string;
}

type State = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'failed' };

export function PhotoDialog({ photo, onClose }: { photo: Photo | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (photo && !d.open) d.showModal();
    if (!photo && d.open) d.close();
  }, [photo]);

  useEffect(() => {
    if (!photo) return;
    let alive = true;
    setState({ status: 'loading' });
    photoUrl(photo.bucket, photo.path).then(
      (url) => alive && setState({ status: 'ready', url }),
      () => alive && setState({ status: 'failed' }),
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
        <button type="button" className="btn btn-icon" aria-label="Cerrar la foto" onClick={() => dialog.current?.close()}>
          <Icon name="close" size={18} />
        </button>
      </header>
      {state.status === 'loading' ? (
        <Skeleton lines={4} />
      ) : state.status === 'failed' ? (
        <ErrorNote>La foto todavía no llegó al servidor o esta cuenta no tiene permiso para verla.</ErrorNote>
      ) : (
        <>
          <img src={state.url} alt={photo?.title ?? 'Foto'} onError={() => setState({ status: 'failed' })} />
          <a className="link" href={state.url} target="_blank" rel="noopener noreferrer">
            Abrir en otra pestaña <Icon name="external" size={16} />
          </a>
        </>
      )}
    </dialog>
  );
}
