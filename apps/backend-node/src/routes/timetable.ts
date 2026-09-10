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
  const [secciones, dias, bloques, profesores, cursos, materias, cargas] = await Promise.all([
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
  ]);

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
    profesores: profesores.map(({ id, nombre, maxHorasSemana }) => ({ id, nombre, maxHorasSemana })),
    cursos: cursos.map(({ id, nombre, seccionId }) => ({ id, nombre, seccionId })),
    materias: materias.map(({ id, nombre }) => ({ id, nombre })),
    cargas: cargas.map(({ id, cursoId, materiaId, profesorId, bloquesSemanalesRequeridos }) => ({
      id,
      cursoId,
      materiaId,
      profesorId,
      bloquesSemanalesRequeridos,
    })),
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
  };

  if (result.status === "INFEASIBLE") {
    res.status(422).json({ error: "No se encontró una solución viable con las restricciones actuales" });
    return;
  }

  for (const asignacion of result.asignaciones) {
    await prisma.horarioAsignado.create({ data: asignacion });
  }

  res.json({ ...result });
});

router.delete("/resultado", async (_req, res) => {
  await prisma.horarioAsignado.deleteMany();
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

export default router;