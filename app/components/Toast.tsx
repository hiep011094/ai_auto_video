'use client';

import { useState, useCallback, createContext, useContext, type ReactNode } from 'react';
import type { ToastMessage, ToastType } from '../types';

// ---- Context ----

interface ToastContextValue {
  toasts: ToastMessage[];
  addToast: (type: ToastType, title: string, message?: string, duration?: number) => void;
  removeToast: (id: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  confirm: (title: string, message?: string) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

// ---- Provider ----

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmState, setConfirmState] = useState<{
    visible: boolean;
    title: string;
    message?: string;
    resolve?: (value: boolean) => void;
  }>({ visible: false, title: '' });

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, title: string, message?: string, duration = 4000) => {
      const id = Date.now().toString(36) + Math.random().toString(36).substring(2);
      const toast: ToastMessage = { id, type, title, message, duration };
      setToasts(prev => [...prev, toast]);

      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast]
  );

  const success = useCallback(
    (title: string, message?: string) => addToast('success', title, message),
    [addToast]
  );
  const error = useCallback(
    (title: string, message?: string) => addToast('error', title, message, 6000),
    [addToast]
  );
  const warning = useCallback(
    (title: string, message?: string) => addToast('warning', title, message),
    [addToast]
  );
  const info = useCallback(
    (title: string, message?: string) => addToast('info', title, message),
    [addToast]
  );

  const confirm = useCallback(
    (title: string, message?: string): Promise<boolean> => {
      return new Promise(resolve => {
        setConfirmState({ visible: true, title, message, resolve });
      });
    },
    []
  );

  const handleConfirm = (result: boolean) => {
    confirmState.resolve?.(result);
    setConfirmState({ visible: false, title: '' });
  };

  const ICONS: Record<ToastType, string> = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  };

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info, confirm }}>
      {children}

      {/* Toast Container */}
      <div className="toast-container" role="alert" aria-live="polite">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <span className="toast-icon">{ICONS[toast.type]}</span>
            <div className="toast-body">
              <div className="toast-title">{toast.title}</div>
              {toast.message && <div className="toast-message">{toast.message}</div>}
            </div>
            <button className="toast-close" onClick={() => removeToast(toast.id)} aria-label="Đóng">
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Confirm Modal */}
      {confirmState.visible && (
        <div className="confirm-overlay" onClick={() => handleConfirm(false)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon">⚠️</div>
            <h3 className="confirm-title">{confirmState.title}</h3>
            {confirmState.message && <p className="confirm-message">{confirmState.message}</p>}
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => handleConfirm(false)}>Hủy</button>
              <button className="btn btn-danger-solid" onClick={() => handleConfirm(true)}>Xác nhận</button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
