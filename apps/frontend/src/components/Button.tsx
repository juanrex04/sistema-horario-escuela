import type { ComponentPropsWithRef, ReactNode } from "react";

type Variante = "primario" | "secundario" | "fantasma" | "peligro";
type Tamano = "sm" | "md";

const VARIANTES: Record<Variante, string> = {
  primario: "bg-pizarra text-chalk hover:bg-pizarra-hondo",
  secundario: "border border-borde-fuerte bg-superficie text-tinta-suave hover:bg-papel",
  fantasma: "text-tinta-suave hover:bg-papel-hondo",
  peligro: "bg-tiza text-chalk hover:bg-tiza-hondo",
};

const TAMANOS: Record<Tamano, string> = {
  sm: "gap-1.5 px-2.5 py-1.5 text-xs",
  md: "gap-2 px-3.5 py-2 text-sm",
};

type BaseProps = ComponentPropsWithRef<"button"> & {
  variant?: Variante;
  tamano?: Tamano;
};

/**
 * Con texto, `aria-label` es opcional. Sin texto (solo ícono), es obligatorio:
 * un botón sin nombre accesible no compila.
 */
type Props = BaseProps & ({ children: ReactNode } | { children?: never; "aria-label": string });

export default function Button({
  variant = "secundario",
  tamano = "md",
  className = "",
  children,
  ...props
}: Props) {
  return (
    <button
      {...props}
      className={`inline-flex shrink-0 items-center justify-center font-medium transition-colors disabled:opacity-50 ${VARIANTES[variant]} ${TAMANOS[tamano]} ${className}`}
    >
      {children}
    </button>
  );
}
