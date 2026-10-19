// A question before doing something that changes what everyone sees, like sending a trip to the trash.
import { type ReactNode, useEffect, useId, useRef } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  /** While the action runs, the buttons wait. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, children, confirmLabel, cancelLabel = 'Cancelar', danger = false, busy = false, onConfirm, onCancel }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-text`}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      // The browser can still close it (Escape twice in a row): the page then knows it is closed.
      onClose={onCancel}
    >
      <h2 id={`${id}-title`}>{title}</h2>
      <div id={`${id}-text`} className="confirm-text">
        {children}
      </div>
      <footer>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}${busy ? ' is-busy' : ''}`} onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </button>
      </footer>
    </dialog>
  );
}
