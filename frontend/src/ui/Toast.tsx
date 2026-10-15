import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { cx } from "./cx";

export type ToastTone = "info" | "success" | "error";

type ToastItem = { id: number; message: string; tone: ToastTone };
type ToastFn = (message: string, tone?: ToastTone) => void;

const TOAST_MS = 4000;

const ToastContext = createContext<ToastFn | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback<ToastFn>(
    (message, tone = "info") => {
      nextId.current += 1;
      const id = nextId.current;
      setItems((current) => [...current, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pp-toasts" aria-live="polite">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cx("pp-toast", `pp-toast--${item.tone}`)}
            onClick={() => dismiss(item.id)}
          >
            {item.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast must be used inside ToastProvider");
  return toast;
}
