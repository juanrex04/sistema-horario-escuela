interface Bloque {
  seccionId: number;
  diaSemanaId: number;
  numeroPeriodo: string;
  inicioMin: number;
  finMin: number;
  esAcademico: boolean;
}

interface Curso {
  id: number;
  nombre: string;
  seccionId: number;
}

interface Materia {
  id: number;
  nombre: string;
}

interface Carga {
  id: number;
  cursoId: number;
  materiaId: number;
  profesorId: number;
  bloquesSemanalesRequeridos: number;
}

interface Profesor {
  id: number;
  nombre: string;
  esTiempoCompleto: boolean;
  jornada: { diaSemanaId: number; horaFin: number }[];
}

interface Deporte {
  seccionId: number;
  diaSemanaId: number;
  numeroPeriodo: string;
}

interface Reunion {
  diaSemanaId: number;
  horaInicio: number;
  horaFin: number;
  seccionIds: number[];
}

interface Colaborativa {
  departamentoId: number;
  materiaIds: number[];
}

export interface PayloadParaDiagnostico {
  bloques: Bloque[];
  cursos: Curso[];
  materias: Materia[];
  cargas: Carga[];
  profesores: Profesor[];
  deportes: Deporte[];
  reunionesSeccion: Reunion[];
  colaborativas: Colaborativa[];
}

export interface DiagnosticoResultado {
  causas: string[];
  sugerencias: string[];
}

function nombreMateria(m: Materia[], id: number): string {
  return m.find((x) => x.id === id)?.nombre ?? `materia ${id}`;
}

function solapaConReunion(
  b: { diaSemanaId: number; inicioMin: number; finMin: number },
  r: { diaSemanaId: number; horaInicio: number; horaFin: number }
): boolean {
  return b.diaSemanaId === r.diaSemanaId && b.inicioMin < r.horaFin && r.horaInicio < b.finMin;
}

function bloqueLibreParaSeccion(
  b: Bloque,
  seccionId: number,
  deportes: Deporte[],
  reuniones: Reunion[]
): boolean {
  if (!b.esAcademico) return false;
  if (b.seccionId !== seccionId) return false;
  if (deportes.some((d) => d.seccionId === seccionId && d.diaSemanaId === b.diaSemanaId && d.numeroPeriodo === b.numeroPeriodo))
    return false;
  if (reuniones.some((r) => r.seccionIds.includes(seccionId) && solapaConReunion(b, r))) return false;
  return true;
}

function contarSlotsDistintos(porDia: Map<number, { inicioMin: number; finMin: number }[]>): number {
  let total = 0;
  for (const intervalos of porDia.values()) {
    intervalos.sort((a, b) => a.inicioMin - b.inicioMin);
    let slots = 0;
    let finActual = -1;
    for (const iv of intervalos) {
      if (iv.inicioMin < finActual) {
        if (iv.finMin > finActual) finActual = iv.finMin;
      } else {
        slots++;
        finActual = iv.finMin;
      }
    }
    total += slots;
  }
  return total;
}

export function diagnosticarInviabilidad(
  payload: PayloadParaDiagnostico,
  nombreDepto?: Map<number, string>
): DiagnosticoResultado {
  const { bloques, cursos, materias, cargas, profesores, deportes, reunionesSeccion, colaborativas } = payload;
  const causas: string[] = [];
  const sugerencias: string[] = [];

  const disponiblesCurso = (seccionId: number) =>
    bloques.filter((b) => bloqueLibreParaSeccion(b, seccionId, deportes, reunionesSeccion)).length;

  for (const curso of cursos) {
    const cargasCurso = cargas.filter((c) => c.cursoId === curso.id);
    if (cargasCurso.length === 0) continue;
    const requeridos = cargasCurso.reduce((acc, c) => acc + c.bloquesSemanalesRequeridos, 0);
    const disponibles = disponiblesCurso(curso.seccionId);
    if (requeridos > disponibles) {
      causas.push(
        `Curso '${curso.nombre}': necesita ${requeridos} bloques semanales pero su sección solo ofrece ${disponibles} libres (descontando deportes y reuniones de sección). Faltan ${requeridos - disponibles}.`
      );
    }
  }

  for (const prof of profesores) {
    const cargasProf = cargas.filter((c) => c.profesorId === prof.id);
    if (cargasProf.length === 0) continue;
    const requeridos = cargasProf.reduce((acc, c) => acc + c.bloquesSemanalesRequeridos, 0);
    const finPorDia = new Map(prof.jornada.map((j) => [j.diaSemanaId, j.horaFin]));
    const sinRestriccion = prof.esTiempoCompleto || prof.jornada.length === 0;
    const porDia = new Map<number, { inicioMin: number; finMin: number }[]>();
    for (const carga of cargasProf) {
      const curso = cursos.find((c) => c.id === carga.cursoId);
      if (!curso) continue;
      for (const b of bloques) {
        if (!bloqueLibreParaSeccion(b, curso.seccionId, deportes, reunionesSeccion)) continue;
        if (!sinRestriccion) {
          const fin = finPorDia.get(b.diaSemanaId);
          if (fin === undefined || b.finMin > fin) continue;
        }
        const dia = porDia.get(b.diaSemanaId) ?? [];
        dia.push({ inicioMin: b.inicioMin, finMin: b.finMin });
        porDia.set(b.diaSemanaId, dia);
      }
    }
    const disponibles = contarSlotsDistintos(porDia);
    if (requeridos > disponibles) {
      causas.push(
        `Docente '${prof.nombre}': acumula ${requeridos} bloques de clase pero solo podría estar disponible en ${disponibles} bloques distintos${sinRestriccion ? "" : " con su jornada parcial"}. Reduce su carga o amplía su jornada.`
      );
    }
  }

  const hayCurso = causas.some((c) => c.startsWith("Curso"));
  const hayDocente = causas.some((c) => c.startsWith("Docente"));

  if (hayCurso) {
    sugerencias.push(
      "Reduce los bloques semanales de alguna materia de esos cursos o libera franjas ocupadas por deportes y reuniones de sección."
    );
  }
  if (hayDocente) {
    sugerencias.push("Reduce la carga de esos docentes o amplía su jornada si son de tiempo parcial.");
  }
  if (colaborativas.length > 0) {
    const nombres = colaborativas
      .map((c) => nombreDepto?.get(c.departamentoId) ?? `departamento ${c.departamentoId}`)
      .join(", ");
    sugerencias.push(
      `Con las reuniones colaborativas activas (${nombres}), considera reducir los bloques consecutivos en Reglas o liberar más franjas para poder encajarlas.`
    );
  }
  if (sugerencias.length === 0) {
    sugerencias.push("Libera franjas ocupadas (deportes, reuniones de sección) o reduce los bloques semanales requeridos.");
  }

  return { causas, sugerencias };
}