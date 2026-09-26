import { useEffect, useState, useCallback } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

let toastListener: ((t: { message: string; kind: ToastKind }) => void) | null = null;

export function showToast(message: string, kind: ToastKind = 'info') {
  toastListener?.({ message, kind });
}

export function ToastHost() {
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(null);

  useEffect(() => {
    toastListener = (t) => {
      setToast(t);
      window.setTimeout(() => setToast(null), 3200);
    };
    return () => {
      toastListener = null;
    };
  }, []);

  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.kind}`} role="status">
      {toast.message}
    </div>
  );
}

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

type ConfirmState = ConfirmOptions & { resolve: (v: boolean) => void };

let confirmListener: ((s: ConfirmState) => void) | null = null;

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    confirmListener?.({ ...opts, resolve });
  });
}

export function ConfirmHost() {
  const [state, setState] = useState<ConfirmState | null>(null);

  useEffect(() => {
    confirmListener = setState;
    return () => {
      confirmListener = null;
    };
  }, []);

  const close = useCallback(
    (ok: boolean) => {
      state?.resolve(ok);
      setState(null);
    },
    [state],
  );

  if (!state) return null;
  return (
    <div className="modal-backdrop" onClick={() => close(false)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3>{state.title}</h3>
        {state.message && <p className="modal-msg">{state.message}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={() => close(false)}>
            {state.cancelText ?? '取消'}
          </button>
          <button
            type="button"
            className={state.danger ? 'btn-primary danger' : 'btn-primary'}
            onClick={() => close(true)}
          >
            {state.confirmText ?? '确定'}
          </button>
        </div>
      </div>
    </div>
  );
}
