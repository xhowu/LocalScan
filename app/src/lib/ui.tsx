/**
 * 码上记（LocalScan）—— 隐私优先的本地物品 / 库存管理
 * Copyright (c) 2026 xhowu
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
import { useEffect, useState, useCallback } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

let toastListener: ((t: { message: string; kind: ToastKind }) => void) | null = null;

export function showToast(message: string, kind: ToastKind = 'info') {
  toastListener?.({ message, kind });
}

/** 触觉反馈：Android WebView 需 Manifest 声明 VIBRATE 权限（已有）。
 *  统一入口：长按菜单弹出、扫描结果出现等轻量确认场景 */
export function haptic(ms = 12) {
  if (navigator.vibrate) navigator.vibrate(ms);
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
    <div className="modal-backdrop confirm-backdrop" onClick={() => close(false)}>
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
