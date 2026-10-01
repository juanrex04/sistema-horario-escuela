import { useRef } from "react";
import { AlertTriangle } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Eliminar",
  loading = false,
  error,
  onConfirm,
  onCancel,
}: Props) {
  const cancelarRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      maxWidth="max-w-sm"
      role="alertdialog"
      initialFocusRef={cancelarRef}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center bg-tiza-suave">
            <AlertTriangle className="h-5 w-5 text-tiza" aria-hidden="true" />
          </div>
          <p className="pt-1.5 text-sm text-tinta-suave">{message}</p>
        </div>
        {error && (
          <div role="alert" className="border border-tiza/30 bg-tiza-suave px-3 py-2 text-sm text-tiza">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button ref={cancelarRef} onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="peligro" onClick={onConfirm} disabled={loading}>
            {loading ? "Eliminando..." : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
