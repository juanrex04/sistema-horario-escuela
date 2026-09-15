export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

export type ColumnaGrilla = { label: string; indice: number; esEspecial: boolean };

export function columnasGrilla(diasPorNumero: Map<number, boolean>, labels: string[]): ColumnaGrilla[] {
  return labels.map((label) => {
    const indice = DIAS.indexOf(label);
    return { label, indice, esEspecial: diasPorNumero.get(indice + 1) ?? label === "Viernes" };
  });
}

export default function CabeceraGrilla({
  columnas,
  labelColumna,
}: {
  columnas: ColumnaGrilla[];
  labelColumna: string;
}) {
  const regular = columnas.filter((c) => !c.esEspecial);
  const especial = columnas.filter((c) => c.esEspecial);

  return (
    <>
      {(regular.length > 0 || especial.length > 0) && (
        <tr className="bg-slate-100">
          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">{labelColumna}</th>
          {regular.length > 0 && (
            <th
              colSpan={regular.length}
              className="px-4 py-2 text-left text-xs font-semibold tracking-wide text-slate-600"
            >
              Horario regular · Lunes a Jueves
            </th>
          )}
          {especial.length > 0 && (
            <th
              colSpan={especial.length}
              className="border-l-2 border-dashed border-amber-300 bg-amber-50 px-4 py-2 text-left text-xs font-semibold tracking-wide text-amber-700"
            >
              Horario especial · Viernes
            </th>
          )}
        </tr>
      )}
      <tr className="bg-slate-50">
        <th className="px-4 py-3 text-left font-medium text-slate-600">{labelColumna}</th>
        {columnas.map((c) => (
          <th
            key={c.indice}
            className={`px-4 py-3 text-left font-medium ${
              c.esEspecial
                ? "border-l-2 border-dashed border-amber-300 bg-amber-50 text-amber-800"
                : "text-slate-600"
            }`}
          >
            {c.label}
          </th>
        ))}
      </tr>
    </>
  );
}