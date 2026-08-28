import { useCallback, useEffect, useState } from 'react';

export type ToastKind = 'success' | 'error';
export type ToastState = { kind: ToastKind; message: string };

export function useToast(durationMs = 3000) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const showToast = useCallback((kind: ToastKind, message: string) => {
    setToast({ kind, message });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), durationMs);
    return () => window.clearTimeout(timer);
  }, [toast, durationMs]);
  return { toast, showToast };
}

export default function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;
  return <div className={`toast-bar ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>{toast.message}</div>;
}
