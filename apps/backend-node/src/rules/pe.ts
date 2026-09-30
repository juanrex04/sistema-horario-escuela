/**
 * Reglas de educación física. Módulo puro: no importa Prisma ni Express para poder
 * testearlo de forma aislada (ver pe.test.ts).
 */

/** Secciones cuya P.E. no debe coincidir con el deporte de ninguna de las tres. */
export const SECCIONES_PE = ["Primaria", "Middle School", "Diploma"] as const;

export type SeccionPE = (typeof SECCIONES_PE)[number];

export type BloqueInput = {
  id: number;
  seccionId: number;
  diaSemanaId: number;
  numeroPeriodo: string;
  inicioMin: number;
  finMin: number;
};

export type DeporteInput = { seccionId: number; diaSemanaId: number; numeroPeriodo: string };

export type CursoInput = { id: number; nombre: string; seccionId: number };

export type MateriaInput = { id: number; esEducacionFisica: boolean };

export type CargaInput = {
  id: number;
  cursoId: number;
  materiaId: number;
  profesorId: number;
  bloquesSemanalesRequeridos: number;
};

export type ProfesorInput = { id: number; peParesMismoDia: boolean };

export type ParePEMismoDia = { cargaAId: number; cargaBId: number };

export type ReglaPEAntes = { seccionId: number; diaSemanaIds: number[]; limiteMin: number };

export type ResultadoReglasPE = {
  paresPEMismoDia: ParePEMismoDia[];
  deportesPEAntes: ReglaPEAntes[];
  advertencias: string[];
};

/**
 * Quita el sufijo de grupo de un nombre de curso: "2A" -> "2", "11B" -> "11",
 * "Transición A" -> "Transición". Los nombres sin sufijo ("10", "12") se devuelven
 * intactos, así que dos grupos sin letra nunca se emparejan entre sí.
 */
export function gradoBase(nombre: string): string {
  const stripped = nombre.trim();
  let i = stripped.length;
  while (i > 0 && /[A-ZÁÉÍÓÚÜÑ]/.test(stripped[i - 1])) i -= 1;
  if (i === stripped.length || i === 0) return stripped;
  return stripped.slice(0, i).replace(/\s+$/, "");
}

/**
 * Une intervalos [inicio, fin) y devuelve cuántos tramos quedan. Si un día tiene
 * más de un tramo, los deportes no son contiguos y un único `limiteMin` sobre
 * excluiría los huecos intermedios, así que hay que avisar.
 */
function unirIntervalos(intervalos: { inicioMin: number; finMin: number }[]): {
  tramos: { inicioMin: number; finMin: number }[];
} {
  const ordenados = [...intervalos].sort((a, b) => a.inicioMin - b.inicioMin);
  const tramos: { inicioMin: number; finMin: number }[] = [];
  for (const iv of ordenados) {
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && iv.inicioMin <= ultimo.finMin) {
      ultimo.finMin = Math.max(ultimo.finMin, iv.finMin);
    } else {
      tramos.push({ inicioMin: iv.inicioMin, finMin: iv.finMin });
    }
  }
  return { tramos };
}

export function calcularReglasPE(input: {
  secciones: { id: number; nombre: string }[];
  bloques: BloqueInput[];
  deportes: DeporteInput[];
  cursos: CursoInput[];
  materias: MateriaInput[];
  cargas: CargaInput[];
  profesores: ProfesorInput[];
}): ResultadoReglasPE {
  const advertencias: string[] = [];
  const seccionesPE = input.secciones.filter((s) => (SECCIONES_PE as readonly string[]).includes(s.nombre));
  const idsSeccionesPE = new Set(seccionesPE.map((s) => s.id));

  // ---- Regla A: la P.E. de las tres secciones no cae en la franja de deporte de
  // ninguna de ellas, sin importar el día ni la sección. Se resuelve con la hora de
  // inicio de deporte más temprana de cada día, en vez de por día de cada sección.
  const bloquePorClave = new Map(
    input.bloques.map((b) => [`${b.seccionId}_${b.diaSemanaId}_${b.numeroPeriodo}`, b])
  );

  const inicioPorDia = new Map<number, number>();
  for (const d of input.deportes) {
    if (!idsSeccionesPE.has(d.seccionId)) continue;
    const bloque = bloquePorClave.get(`${d.seccionId}_${d.diaSemanaId}_${d.numeroPeriodo}`);
    // reglas.ts ya garantiza que exista un bloque académico para cada deporte.
    if (!bloque) continue;
    const actual = inicioPorDia.get(d.diaSemanaId);
    if (actual === undefined || bloque.inicioMin < actual) inicioPorDia.set(d.diaSemanaId, bloque.inicioMin);
  }

  // Aviso si el deporte de un día no es contiguo: con más de un tramo, un único
  // limiteMin dejaría fuera de la P.E. también los huecos entre deportes.
  const finPorDia = new Map<number, number>();
  for (const d of input.deportes) {
    if (!idsSeccionesPE.has(d.seccionId)) continue;
    const bloque = bloquePorClave.get(`${d.seccionId}_${d.diaSemanaId}_${d.numeroPeriodo}`);
    if (!bloque) continue;
    const inicio = inicioPorDia.get(d.diaSemanaId)!;
    if (bloque.inicioMin < inicio) continue;
    const actual = finPorDia.get(d.diaSemanaId);
    if (actual === undefined || bloque.finMin > actual) finPorDia.set(d.diaSemanaId, bloque.finMin);
  }
  for (const [diaSemanaId, inicioMin] of inicioPorDia) {
    const intervals = input.deportes
      .filter((d) => idsSeccionesPE.has(d.seccionId) && d.diaSemanaId === diaSemanaId)
      .map((d) => bloquePorClave.get(`${d.seccionId}_${d.diaSemanaId}_${d.numeroPeriodo}`))
      .filter((b): b is BloqueInput => b !== undefined)
      .map((b) => ({ inicioMin: b.inicioMin, finMin: b.finMin }));
    if (unirIntervalos(intervals).tramos.length > 1) {
      advertencias.push(
        `El deporte del día ${diaSemanaId} no es contiguo (varios tramos separados): la P.E. se excluye desde las ${inicioMin} min y eso también descarta los huecos intermedios.`
      );
    }
  }

  const deportesPEAntes: ReglaPEAntes[] =
    inicioPorDia.size > 0
      ? seccionesPE.map((s) => ({
          seccionId: s.id,
          diaSemanaIds: [...inicioPorDia.keys()].sort((a, b) => a - b),
          limiteMin: Math.min(...inicioPorDia.values()),
        }))
      : [];

  // ---- Regla B: pares de grupos del mismo grado que ven P.E. el mismo día. Solo
  // para los docentes con el flag, y solo entre las cargas de ese mismo docente.
  const esPE = new Set(input.materias.filter((m) => m.esEducacionFisica).map((m) => m.id));
  const cursoPorId = new Map(input.cursos.map((c) => [c.id, c]));
  const conFlag = new Set(input.profesores.filter((p) => p.peParesMismoDia).map((p) => p.id));

  // Agrupar primero y emparejar después: un grupo del mismo grado solo forma par
  // si el docente tiene exactamente dos cargas de P.E. en él. Con tres o más, la
  // regla no aplica en lugar de emparejar dos al azar.
  const porGrupo = new Map<string, CargaInput[]>();
  for (const c of input.cargas) {
    if (!esPE.has(c.materiaId)) continue;
    if (!conFlag.has(c.profesorId)) continue;
    const curso = cursoPorId.get(c.cursoId);
    if (!curso) continue;
    // La sección va en la clave: sin ella, el grupo "1" de Preescolar Bajo se
    // emparejaría con el "1" de Preescolar Alto.
    const clave = `${c.profesorId}::${curso.seccionId}::${gradoBase(curso.nombre)}`;
    const arr = porGrupo.get(clave) ?? [];
    arr.push(c);
    porGrupo.set(clave, arr);
  }

  const paresPEMismoDia: ParePEMismoDia[] = [];
  for (const [, cargasDelGrupo] of porGrupo) {
    if (cargasDelGrupo.length !== 2) continue;
    const [a, b] = cargasDelGrupo;
    if (a.bloquesSemanalesRequeridos !== b.bloquesSemanalesRequeridos) continue;
    paresPEMismoDia.push(
      a.id < b.id ? { cargaAId: a.id, cargaBId: b.id } : { cargaAId: b.id, cargaBId: a.id }
    );
  }
  paresPEMismoDia.sort((x, y) => x.cargaAId - y.cargaAId);

  return { paresPEMismoDia, deportesPEAntes, advertencias };
}
