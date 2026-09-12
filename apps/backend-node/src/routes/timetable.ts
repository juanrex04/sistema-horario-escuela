import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../config.js";

const router = Router();

router.use(requireAuth);

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

async function buildPayload() {
  const [secciones, dias, bloques, profesores, cursos, materias, cargas, reuniones, deportes, departamentos] =
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
    profesores: profesores.map(({ id, nombre, maxHorasSemana, seccionBaseId, prefiereGruposConsecutivos }) => ({ id, nombre, maxHorasSemana, seccionBaseId, prefiereGruposConsecutivos })),
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
    colaborativas,
  };
}

router.post("/generate", async (req, res) => {
  const { cargas } = await buildPayload();
  if (cargas.length === 0) {
    res.status(400).json({ error: "No hay cargas académicas para generar el horario" });
    return;
  }

  await prisma.horarioAsignado.deleteMany();
  const payload = await buildPayload();

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
  };

  if (result.status === "INFEASIBLE") {
    res.status(422).json({ error: "No se encontró una solución viable con las restricciones actuales" });
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