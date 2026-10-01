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
        <tr className="bg-papel-hondo">
          <th scope="col" className="grilla-angosta px-4 py-2 text-left text-xs font-medium text-apagado">
            {labelColumna}
          </th>
          {regular.length > 0 && (
            <th
              scope="col"
              colSpan={regular.length}
              className="grilla-angosta px-4 py-2 text-left text-xs font-semibold tracking-tight text-tinta-suave"
            >
              Horario regular
            </th>
          )}
          {especial.length > 0 && (
            <th
              scope="col"
              colSpan={especial.length}
              className="grilla-angosta border-l-2 border-dashed border-ambar bg-ambar-suave px-4 py-2 text-left text-xs font-semibold tracking-tight text-ambar"
            >
              Horario especial
            </th>
          )}
        </tr>
      )}
      <tr className="bg-papel">
        <th scope="col" className="grilla-angosta px-4 py-3 text-left font-medium text-tinta-suave">
          {labelColumna}
        </th>
        {columnas.map((c) => (
          <th
            key={c.indice}
            scope="col"
            className={`grilla-angosta px-4 py-3 text-left font-medium ${
              c.esEspecial
                ? "border-l-2 border-dashed border-ambar bg-ambar-suave text-ambar"
                : "text-tinta-suave"
            }`}
          >
            {c.label}
          </th>
        ))}
      </tr>
    </>
  );
}
