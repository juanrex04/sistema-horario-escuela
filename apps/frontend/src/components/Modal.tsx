import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";

const FOCALIZABLES =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
  role?: "dialog" | "alertdialog";
  initialFocusRef?: RefObject<HTMLElement | null>;
};

export default function Modal({
  open,
  title,
  onClose,
  children,
  maxWidth = "max-w-md",
  role = "dialog",
  initialFocusRef,
}: Props) {
  const tituloId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previoRef = useRef<Element | null>(null);
  const cerrarRef = useRef(onClose);
  cerrarRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    previoRef.current = document.activeElement;

    const panel = panelRef.current;
    const inicial = initialFocusRef?.current ?? panel;
    inicial?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        cerrarRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = panel.querySelectorAll<HTMLElement>(FOCALIZABLES);
      if (items.length === 0) return;
      const primero = items[0];
      const ultimo = items[items.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      const previo = previoRef.current;
      if (previo instanceof HTMLElement) previo.focus();
    };
  }, [open, initialFocusRef]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/50 p-4">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className={`relative w-full ${maxWidth} max-h-[calc(100dvh-2rem)] overflow-y-auto border border-borde bg-superficie shadow-xl focus:outline-none`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-borde px-5 py-4">
          <h2 id={tituloId} className="text-base font-semibold tracking-tight text-tinta">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1 rounded p-1 text-apagado transition-colors hover:bg-papel-hondo hover:text-tinta"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
