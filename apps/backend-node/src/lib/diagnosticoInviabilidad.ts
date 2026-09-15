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

interface ParMismoBloque {
  materiaAId: number;
  materiaBId: number;
  cursoId: number | null;
}

interface SeccionInfo {
  id: number;
  nombre: string;
}

export interface PayloadParaDiagnostico {
  bloques: Bloque[];
  cursos: Curso[];
  cargas: Carga[];
  profesores: Profesor[];
  deportes: Deporte[];
  reunionesSeccion: Reunion[];
  colaborativas: Colaborativa[];
  materiasMismoBloque?: ParMismoBloque[];
  secciones: SeccionInfo[];
}

export interface DiagnosticoResultado {
  causas: string[];
  sugerencias: string[];
}

function nombreSeccion(secciones: SeccionInfo[], id: number): string {
  return secciones.find((s) => s.id === id)?.nombre ?? `sección ${id}`;
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

function contarSlotsEmpaquetados(porDia: Map<number, { inicioMin: number; finMin: number }[]>): number {
  let total = 0;
  for (const intervalos of porDia.values()) {
    const arr = [...intervalos].sort((a, b) => a.finMin - b.finMin || a.inicioMin - b.inicioMin);
    let n = 0;
    let finActual = -1;
    for (const iv of arr) {
      if (iv.inicioMin >= finActual) {
        n++;
        finActual = iv.finMin;
      }
    }
    total += n;
  }
  return total;
}

function ahorroParesCurso(
  cargasCurso: Carga[],
  pares: ParMismoBloque[] | undefined,
  cursoId: number
): number {
  if (!pares || pares.length === 0) return 0;
  const reqPorMateria = new Map<number, number>();
  for (const c of cargasCurso) {
    reqPorMateria.set(c.materiaId, (reqPorMateria.get(c.materiaId) ?? 0) + c.bloquesSemanalesRequeridos);
  }
  const vistos = new Set<string>();
  let ahorro = 0;
  for (const p of pares) {
    if (p.cursoId !== null && p.cursoId !== cursoId) continue;
    const a = p.materiaAId;
    const b = p.materiaBId;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (vistos.has(key)) continue;
    vistos.add(key);
    const ra = reqPorMateria.get(a);
    const rb = reqPorMateria.get(b);
    if (ra === undefined || rb === undefined) continue;
    ahorro += Math.min(ra, rb);
  }
  return ahorro;
}

export function diagnosticarInviabilidad(
  payload: PayloadParaDiagnostico,
  nombreDepto?: Map<number, string>
): DiagnosticoResultado {
  const { bloques, cursos, cargas, profesores, deportes, reunionesSeccion, colaborativas, materiasMismoBloque = [], secciones = [] } = payload;
  const causas: string[] = [];
  const sugerencias: string[] = [];

  const disponiblesCurso = (seccionId: number) =>
    bloques.filter((b) => bloqueLibreParaSeccion(b, seccionId, deportes, reunionesSeccion)).length;

  const deficitSeccion = new Map<number, { faltan: number; cursos: string[] }>();

  for (const curso of cursos) {
    const cargasCurso = cargas.filter((c) => c.cursoId === curso.id);
    if (cargasCurso.length === 0) continue;
    const bruto = cargasCurso.reduce((acc, c) => acc + c.bloquesSemanalesRequeridos, 0);
    const ahorro = ahorroParesCurso(cargasCurso, materiasMismoBloque, curso.id);
    const requeridos = bruto - ahorro;
    const disponibles = disponiblesCurso(curso.seccionId);
    if (requeridos <= disponibles) continue;
    const falta = requeridos - disponibles;

    causas.push(
      `Curso '${curso.nombre}': necesita ${requeridos} bloques semanales${
        ahorro > 0 ? ` (tras compartir ${ahorro} con materias de par) ` : " "
      }pero su sección '${nombreSeccion(
        secciones,
        curso.seccionId
      )}' solo ofrece ${disponibles} libres (descontando deportes y reuniones de sección). Faltan ${falta}.`
    );

    const ent = deficitSeccion.get(curso.seccionId) ?? { faltan: 0, cursos: [] };
    ent.faltan = Math.max(ent.faltan, falta);
    ent.cursos.push(curso.nombre);
    deficitSeccion.set(curso.seccionId, ent);
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
        let arr = porDia.get(b.diaSemanaId);
        if (!arr) {
          arr = [];
          porDia.set(b.diaSemanaId, arr);
        }
        arr.push({ inicioMin: b.inicioMin, finMin: b.finMin });
      }
    }
    const disponibles = contarSlotsEmpaquetados(porDia);
    if (requeridos <= disponibles) continue;
    const falta = requeridos - disponibles;

    causas.push(
      `Docente '${prof.nombre}': acumula ${requeridos} bloques de clase pero solo podría estar disponible en ${disponibles} bloques distintos${
        sinRestriccion ? "" : " con su jornada parcial"
      }. Reduce su carga o amplía su jornada.`
    );

    sugerencias.push(
      `Docente '${prof.nombre}': reasigna al menos ${falta} bloques a otro docente o amplía su jornada${
        sinRestriccion ? "" : " parcial"
      }.`
    );
  }

  for (const [seccionId, ent] of deficitSeccion) {
    sugerencias.push(
      `La sección '${nombreSeccion(secciones, seccionId)}' requiere hasta ${ent.faltan} ${
        ent.faltan === 1 ? "bloque adicional" : "bloques adicionales"
      } en sus cursos (${ent.cursos.join(", ")}): agrega períodos académicos a su grilla o reduce los bloques semanales de esas materias.`
    );
  }

  const hayCurso = causas.some((c) => c.startsWith("Curso"));
  const hayDocente = causas.some((c) => c.startsWith("Docente"));

  if (colaborativas.length > 0) {
    const nombres = colaborativas
      .map((c) => nombreDepto?.get(c.departamentoId) ?? `departamento ${c.departamentoId}`)
      .join(", ");
    sugerencias.push(
      `Con las reuniones colaborativas activas (${nombres}), considera reducir los bloques consecutivos en Reglas o liberar más franjas para poder encajarlas.`
    );
  }
  if (sugerencias.length === 0 && (hayCurso || hayDocente)) {
    sugerencias.push("Libera franjas ocupadas (deportes, reuniones de sección) o reduce los bloques semanales requeridos.");
  }

  return { causas, sugerencias };
}