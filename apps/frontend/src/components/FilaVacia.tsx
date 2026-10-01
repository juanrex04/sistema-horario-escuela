import type { ReactNode } from "react";
import { Search } from "lucide-react";

type Props = {
  colSpan: number;
  mensaje: string;
  icono?: ReactNode;
  accion?: ReactNode;
};

export default function FilaVacia({ colSpan, mensaje, icono, accion }: Props) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center">
        <div className="mx-auto flex max-w-xs flex-col items-center gap-3 text-apagado">
          {icono ?? <Search className="h-5 w-5" aria-hidden="true" />}
          <p className="text-sm">{mensaje}</p>
          {accion}
        </div>
      </td>
    </tr>
  );
}
