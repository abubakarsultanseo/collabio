"use client";

import { CheckCircle2, CircleAlert, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Tone = "success" | "error";
type Toast = { id: number; message: string; tone: Tone };
type Notify = (message: string, tone?: Tone) => void;
const ToastContext = createContext<Notify | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const sequence = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback<Notify>(
    (message, tone = "success") => {
      const id = ++sequence.current;
      setToasts((items) => [...items, { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), tone === "error" ? 9000 : 5000),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      activeTimers.forEach(clearTimeout);
      activeTimers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-24 z-[60] flex flex-col items-end gap-2 sm:left-auto sm:w-96 lg:bottom-5">
        {toasts.map(({ id, message, tone }) => {
          const Icon = tone === "success" ? CheckCircle2 : CircleAlert;
          return (
            <div
              key={id}
              className="os-card pointer-events-auto flex w-full items-start gap-3 p-3 text-sm"
            >
              <Icon
                size={18}
                className={
                  tone === "success"
                    ? "mt-0.5 shrink-0 text-[var(--green)]"
                    : "mt-0.5 shrink-0 text-[var(--red)]"
                }
                aria-hidden
              />
              <p role="status" className="min-w-0 flex-1 break-words">
                {message}
              </p>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismiss(id)}
                className="shrink-0 rounded p-1 text-[var(--muted)] hover:bg-[var(--canvas)]"
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error("useToast requires ToastProvider.");
  return notify;
}
