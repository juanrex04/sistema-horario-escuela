import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../config.js";
import { diagnosticarInviabilidad } from "../lib/diagnosticoInviabilidad.js";

const router = Router();

router.use(requireAuth);

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

async function buildPayload() {
  const [secciones, dias, bloques, profesores, cursos, materias, cargas, reuniones, deportes, departamentos, materiasMismoBloque, config] =
    await Promise.all([
      prisma.seccion.findMany({ orderBy: { id: "asc" } }),
      prisma.diaSemana.findMany({ orderBy: { numeroDia: "asc" } }),
      prisma.bloqueHorario.findMany({ orderBy: { id: "asc" } }),
      prisma.profesor.findMany({ orderBy: { id: "asc" } }),
      prisma.curso.findMany({ orderBy: { id: "asc" } }),
      prisma.materia.findMany({ orderBy: { id: "asc" } }),
      prisma.cargaAcademica.findMany({
        include: { curso: true, materia: true, profesor: true },
        orderBy: { id: "asc" },
      }),
      prisma.reunionSeccion.findMany({ include: { secciones: true } }),
      prisma.deporteSeccion.findMany(),
      prisma.departamento.findMany({
        where: { reunionActiva: true },
        include: { materias: true },
      }),
      prisma.materiaMismoBloque.findMany(),
      prisma.configuracion.findUnique({ where: { clave: "bloquesColaborativa" } }),
    ]);

  const colaborativas = departamentos
    .filter((d) => d.materias.length > 0)
    .map((d) => ({ departamentoId: d.id, materiaIds: d.materias.map((m) => m.id) }));

  return {
    secciones: secciones.map(({ id, nombre }) => ({ id, nombre })),
    dias: dias.map(({ id, numeroDia, esHorarioEspecial }) => ({ id, numeroDia, esHorarioEspecial })),
    bloques: bloques.map((b) => ({
      id: b.id,
      seccionId: b.seccionId,
      diaSemanaId: b.diaSemanaId,
      numeroPeriodo: b.numeroPeriodo,
      inicioMin: toMinutes(b.horaInicio),
      finMin: toMinutes(b.horaFin),
      esAcademico: b.esAcademico,
    })),
    profesores: profesores.map(({ id, nombre, seccionBaseId, departamentoId, prefiereGruposConsecutivos, esTiempoCompleto, jornadaParcial }) => ({
      id,
      nombre,
      seccionBaseId,
      departamentoId,
      prefiereGruposConsecutivos,
      esTiempoCompleto,
      jornada: (jornadaParcial as { diaSemanaId: number; horaFin: string }[] | null ?? []).map((j) => ({
        diaSemanaId: j.diaSemanaId,
        horaFin: toMinutes(j.horaFin),
      })),
    })),
    cursos: cursos.map(({ id, nombre, seccionId }) => ({ id, nombre, seccionId })),
    materias: materias.map(({ id, nombre }) => ({ id, nombre })),
    cargas: cargas.map(({ id, cursoId, materiaId, profesorId, bloquesSemanalesRequeridos }) => ({
      id,
      cursoId,
      materiaId,
      profesorId,
      bloquesSemanalesRequeridos,
    })),
    reunionesSeccion: reuniones.map((r) => ({
      diaSemanaId: r.diaSemanaId,
      horaInicio: toMinutes(r.horaInicio),
      horaFin: toMinutes(r.horaFin),
      seccionIds: r.secciones.map((s) => s.id),
    })),
    deportes: deportes.map((d) => ({
      seccionId: d.seccionId,
      diaSemanaId: d.diaSemanaId,
      numeroPeriodo: d.numeroPeriodo,
    })),
    materiasMismoBloque: materiasMismoBloque.map(({ materiaAId, materiaBId }) => ({ materiaAId, materiaBId })),
    colaborativas,
    bloquesColaborativa: Number(config?.valor) || 2,
  };
}

function validarParesMismoBloque(
  pares: { materiaAId: number; materiaBId: number }[],
  materias: { id: number; nombre: string }[],
  cursos: { id: number; nombre: string }[],
  cargas: { id: number; cursoId: number; materiaId: number; bloquesSemanalesRequeridos: number }[]
) {
  const nombreMateria = (id: number) => materias.find((m) => m.id === id)?.nombre ?? `materia ${id}`;
  const nombreCurso = (id: number) => cursos.find((c) => c.id === id)?.nombre ?? `curso ${id}`;

  for (const par of pares) {
    const cargasA = cargas.filter((c) => c.materiaId === par.materiaAId);
    const cargasB = cargas.filter((c) => c.materiaId === par.materiaBId);
    const porCurso = new Map<number, [number, number]>();
    for (const ca of cargasA) {
      const cb = cargasB.find((c) => c.cursoId === ca.cursoId);
      if (cb && ca.bloquesSemanalesRequeridos !== cb.bloquesSemanalesRequeridos) {
        porCurso.set(ca.cursoId, [ca.bloquesSemanalesRequeridos, cb.bloquesSemanalesRequeridos]);
      }
    }
    for (const [cursoId, [ba, bb]] of porCurso) {
      const error = `Las materias '${nombreMateria(par.materiaAId)}' y '${nombreMateria(par.materiaBId)}' requieren bloques semanales distintos en el curso '${nombreCurso(cursoId)}' (${ba} vs ${bb}). Deben coincidir para compartir el mismo bloque.`;
      return error;
    }
  }
  return null;
}

const DIAS_NOMBRE = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function solapaReunion(
  bloque: { diaSemanaId: number; inicioMin: number; finMin: number },
  r: { diaSemanaId: number; horaInicio: number; horaFin: number }
): boolean {
  return bloque.diaSemanaId === r.diaSemanaId && bloque.inicioMin < r.horaFin && r.horaInicio < bloque.finMin;
}

function validarDisponibilidadProfesor(
  profesores: { id: number; nombre: string; esTiempoCompleto: boolean; jornada: { diaSemanaId: number; horaFin: number }[] }[],
  dias: { id: number; numeroDia: number }[],
  cursos: { id: number; seccionId: number; nombre: string }[],
  materias: { id: number; nombre: string }[],
  cargas: { id: number; cursoId: number; materiaId: number; profesorId: number; bloquesSemanalesRequeridos: number }[],
  bloques: { id: number; seccionId: number; diaSemanaId: number; numeroPeriodo: string; inicioMin: number; finMin: number; esAcademico: boolean }[],
  deportes: { seccionId: number; diaSemanaId: number; numeroPeriodo: string }[],
  reuniones: { diaSemanaId: number; horaInicio: number; horaFin: number; seccionIds: number[] }[]
): string | null {
  const nombreMateria = (id: number) => materias.find((m) => m.id === id)?.nombre ?? `materia ${id}`;
  const nombreCurso = (id: number) => cursos.find((c) => c.id === id)?.nombre ?? `curso ${id}`;
  const nombreDia = (id: number) => {
    const nd = dias.find((d) => d.id === id)?.numeroDia;
    return nd ? DIAS_NOMBRE[nd - 1] ?? `día ${nd}` : `día ${id}`;
  };

  for (const prof of profesores) {
    if (prof.esTiempoCompleto || prof.jornada.length === 0) continue;
    const finPorDia = new Map(prof.jornada.map((j) => [j.diaSemanaId, j.horaFin]));
    const jornadaDesc = prof.jornada
      .map((j) => `${nombreDia(j.diaSemanaId)} hasta ${minutesToHhmm(j.horaFin)}`)
      .join(", ");

    for (const carga of cargas) {
      if (carga.profesorId !== prof.id) continue;
      const curso = cursos.find((c) => c.id === carga.cursoId);
      if (!curso) continue;
      const disponibles = bloques.filter((b) => {
        if (!b.esAcademico) return false;
        if (b.seccionId !== curso.seccionId) return false;
        const fin = finPorDia.get(b.diaSemanaId);
        if (fin === undefined || b.finMin > fin) return false;
        if (deportes.some((d) => d.seccionId === b.seccionId && d.diaSemanaId === b.diaSemanaId && d.numeroPeriodo === b.numeroPeriodo)) return false;
        if (reuniones.some((r) => r.seccionIds.includes(b.seccionId) && solapaReunion(b, r))) return false;
        return true;
      });

      if (disponibles.length < carga.bloquesSemanalesRequeridos) {
        return `El docente '${prof.nombre}' solo dispone de ${disponibles.length} de los ${carga.bloquesSemanalesRequeridos} bloques necesarios para '${nombreMateria(carga.materiaId)}' en '${nombreCurso(curso.id)}' con su jornada parcial (${jornadaDesc}).`;
      }
    }
  }
  return null;
}

function validarColaborativas(
  colaborativas: { departamentoId: number; materiaIds: number[] }[],
  nombreDepto: Map<number, string>,
  dias: { id: number; numeroDia: number }[],
  bloques: { id: number; seccionId: number; diaSemanaId: number; numeroPeriodo: string; inicioMin: number; finMin: number; esAcademico: boolean }[],
  deportes: { seccionId: number; diaSemanaId: number; numeroPeriodo: string }[],
  reuniones: { diaSemanaId: number; horaInicio: number; horaFin: number }[],
  bloquesColaborativa: number
): string | null {
  const nombreDia = (id: number) => {
    const nd = dias.find((d) => d.id === id)?.numeroDia;
    return nd ? DIAS_NOMBRE[nd - 1] ?? `día ${nd}` : `día ${id}`;
  };

  const reservados: { diaSemanaId: number; inicioMin: number; finMin: number }[] = [];
  for (const r of reuniones) reservados.push({ diaSemanaId: r.diaSemanaId, inicioMin: r.horaInicio, finMin: r.horaFin });
  for (const dep of deportes) {
    const b = bloques.find(
      (x) =>
        x.esAcademico &&
        x.seccionId === dep.seccionId &&
        x.diaSemanaId === dep.diaSemanaId &&
        x.numeroPeriodo === dep.numeroPeriodo
    );
    if (b) reservados.push({ diaSemanaId: b.diaSemanaId, inicioMin: b.inicioMin, finMin: b.finMin });
  }

  const solapa = (
    a: { diaSemanaId: number; inicioMin: number; finMin: number },
    b: { diaSemanaId: number; inicioMin: number; finMin: number }
  ) => a.diaSemanaId === b.diaSemanaId && a.inicioMin < b.finMin && b.inicioMin < a.finMin;

  const vistos = new Set<string>();
  const libres: { diaSemanaId: number; inicioMin: number; finMin: number }[] = [];
  for (const b of bloques) {
    if (!b.esAcademico) continue;
    const k = `${b.diaSemanaId}_${b.inicioMin}_${b.finMin}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    if (reservados.some((r) => solapa(b, r))) continue;
    libres.push({ diaSemanaId: b.diaSemanaId, inicioMin: b.inicioMin, finMin: b.finMin });
  }

  const n = Math.max(1, bloquesColaborativa);
  const tieneVentana = (dia: number): boolean => {
    const delDia = libres
      .filter((i) => i.diaSemanaId === dia)
      .sort((a, b) => a.inicioMin - b.inicioMin);
    for (let i = 0; i < delDia.length; i++) {
      let fin = delDia[i].finMin;
      let pasos = 1;
      while (pasos < n) {
        const sig = delDia.find((x) => x.inicioMin === fin);
        if (!sig) break;
        fin = sig.finMin;
        pasos++;
      }
      if (pasos === n) return true;
    }
    return false;
  };

  if (!libres.some((i) => tieneVentana(i.diaSemanaId))) {
    const conVentana = new Set<number>();
    for (const it of libres) if (tieneVentana(it.diaSemanaId)) conVentana.add(it.diaSemanaId);
    const diasSin = dias.filter((d) => !conVentana.has(d.id)).map((d) => nombreDia(d.id));
    const detalle = diasSin.length ? ` (ni ${diasSin.join(", ")})` : "";
    for (const col of colaborativas) {
      const nombre = nombreDepto.get(col.departamentoId) ?? `departamento ${col.departamentoId}`;
      return `El departamento '${nombre}' no tiene ${n} bloques académicos consecutivos libres en ningún día${detalle} para su reunión colaborativa. Libera franjas ocupadas (deportes o reuniones de sección) o reduce la cantidad de bloques.`;
    }
  }
  return null;
}

router.post("/generate", async (req, res) => {
  const payload = await buildPayload();
  if (payload.cargas.length === 0) {
    res.status(400).json({ error: "No hay cargas académicas para generar el horario" });
    return;
  }

  const errorPares = validarParesMismoBloque(payload.materiasMismoBloque, payload.materias, payload.cursos, payload.cargas);
  if (errorPares) {
    res.status(400).json({ error: errorPares });
    return;
  }

  const errorDisponibilidad = validarDisponibilidadProfesor(
    payload.profesores,
    payload.dias,
    payload.cursos,
    payload.materias,
    payload.cargas,
    payload.bloques,
    payload.deportes,
    payload.reunionesSeccion
  );
  if (errorDisponibilidad) {
    res.status(400).json({ error: errorDisponibilidad });
    return;
  }

  const nombreDepto = new Map(
    (await prisma.departamento.findMany({ select: { id: true, nombre: true } })).map((d) => [d.id, d.nombre])
  );
  const errorColaborativas = validarColaborativas(
    payload.colaborativas,
    nombreDepto,
    payload.dias,
    payload.bloques,
    payload.deportes,
    payload.reunionesSeccion,
    payload.bloquesColaborativa
  );
  if (errorColaborativas) {
    res.status(400).json({ error: errorColaborativas });
    return;
  }

  let solverResponse: Awaited<ReturnType<typeof fetch>>;
  try {
    solverResponse = await fetch(`${config.solverUrl}/solve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    res.status(502).json({ error: "No se pudo contactar al solucionador", detail: String(err) });
    return;
  }

  if (!solverResponse.ok) {
    res.status(502).json({ error: `El solucionador respondió ${solverResponse.status}` });
    return;
  }

  const result = (await solverResponse.json()) as {
    status: string;
    asignaciones: { cargaAcademicaId: number; bloqueHorarioId: number }[];
    colaborativas?: { departamentoId: number; diaSemanaId: number; horaInicio: number; horaFin: number }[];
    numConsecutivos?: number;
    numDiasUsados?: number;
  };

  if (result.status === "INFEASIBLE") {
    const diag = diagnosticarInviabilidad(payload, nombreDepto);
    const error =
      diag.causas.length > 0
        ? `No se puede generar el horario: se detectaron ${diag.causas.length} incompatibilidad(es) en los datos.`
        : "No se encontró una solución viable con las restricciones actuales (las cargas no encajan entre sí).";
    res.status(422).json({ error, causas: diag.causas, sugerencias: diag.sugerencias });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.horarioAsignado.deleteMany();
    for (const asignacion of result.asignaciones) {
      await tx.horarioAsignado.create({ data: asignacion });
    }

    await tx.colaborativaGenerada.deleteMany();
    for (const col of result.colaborativas ?? []) {
      await tx.colaborativaGenerada.create({
        data: {
          departamentoId: col.departamentoId,
          diaSemanaId: col.diaSemanaId,
          horaInicio: minutesToHhmm(col.horaInicio),
          horaFin: minutesToHhmm(col.horaFin),
        },
      });
    }
  });

  res.json({ ...result });
});

function minutesToHhmm(min: number): string {
  const h = Math.floor(min / 60).toString().padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

router.delete("/resultado", async (_req, res) => {
  await prisma.$transaction([prisma.horarioAsignado.deleteMany(), prisma.colaborativaGenerada.deleteMany()]);
  res.status(204).end();
});

router.get("/resultado", async (_req, res) => {
  const items = await prisma.horarioAsignado.findMany({
    include: {
      bloqueHorario: { include: { seccion: true, diaSemana: true } },
      cargaAcademica: {
        include: { curso: { include: { seccion: true } }, materia: true, profesor: true },
      },
    },
    orderBy: [{ bloqueHorario: { diaSemanaId: "asc" } }, { bloqueHorario: { horaInicio: "asc" } }],
  });
  res.json(items);
});

router.get("/resultado/colaborativas", async (_req, res) => {
  const items = await prisma.colaborativaGenerada.findMany({
    include: { departamento: { select: { id: true, nombre: true } }, diaSemana: true },
    orderBy: [{ diaSemanaId: "asc" }, { horaInicio: "asc" }],
  });
  res.json(items);
});

export default router;