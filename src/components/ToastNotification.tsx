import { Check } from 'lucide-react';
import { ToastState } from '../types/screenshot';

interface ToastNotificationProps {
  toast: ToastState | null;
  onDismiss: () => void;
}

export function ToastNotification({ toast, onDismiss }: ToastNotificationProps) {
  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      className="fixed bottom-6 right-6 z-50 w-96 cursor-pointer rounded-xl border border-slate-700/80 bg-[#111622]/95 px-4 py-3.5 shadow-2xl backdrop-blur-md transition-all duration-150"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-500/20 text-indigo-400">
          <Check className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-100">{toast.title}</p>
          <p className="mt-0.5 text-xs font-medium text-indigo-300">{toast.subtitle}</p>
          {toast.meta && (
            <p className="mt-1 truncate font-mono text-[11px] tabular-nums text-slate-400">
              {toast.meta}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
