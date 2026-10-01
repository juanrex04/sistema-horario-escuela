import type { ReactNode } from "react";

type PageProps = {
  titulo: string;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
};

export default function Page({ titulo, descripcion, acciones, children }: PageProps) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-borde pb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-tinta">{titulo}</h1>
          {descripcion && <p className="mt-1 text-sm text-apagado">{descripcion}</p>}
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
      </header>
      {children}
    </div>
  );
}
