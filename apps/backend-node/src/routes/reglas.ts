import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { mapPrismaError } from "../lib/errors.js";

const router = Router();

router.use(requireAuth);

const horaRe = /^\d{2}:\d{2}$/;

const reunionSchema = z
  .object({
    diaSemanaId: z.number().int().positive(),
    horaInicio: z.string().regex(horaRe),
    horaFin: z.string().regex(horaRe),
    seccionIds: z.array(z.number().int().positive()).min(1, "Selecciona al menos una sección"),
  })
  .refine((r) => r.horaFin > r.horaInicio, {
    path: ["horaFin"],
    message: "La hora de fin debe ser posterior a la de inicio",
  });

const deporteSchema = z.object({
  seccionId: z.number().int().positive(),
  diaSemanaId: z.number().int().positive(),
  numeroPeriodo: z.string().min(1),
});

const reglasSchema = z.object({
  reunionesSeccion: z.array(reunionSchema),
  deportes: z.array(deporteSchema),
});

async function getSnapshot() {
  const [reunionesSeccion, deportes] = await Promise.all([
    prisma.reunionSeccion.findMany({
      include: { secciones: { select: { id: true, nombre: true } } },
      orderBy: [{ diaSemanaId: "asc" }, { horaInicio: "asc" }],
    }),
    prisma.deporteSeccion.findMany({
      include: { seccion: true, diaSemana: true },
      orderBy: [{ seccionId: "asc" }, { diaSemanaId: "asc" }],
    }),
  ]);
  return { reunionesSeccion, deportes };
}

router.get("/reglas", async (_req, res) => {
  res.json(await getSnapshot());
});

router.put("/reglas", async (req, res) => {
  const parsed = reglasSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
    return;
  }
  const { reunionesSeccion, deportes } = parsed.data;

  const [secciones, dias] = await Promise.all([
    prisma.seccion.findMany({ select: { id: true, nombre: true } }),
    prisma.diaSemana.findMany({ select: { id: true, numeroDia: true } }),
  ]);
  const nombreSeccion = (id: number) => secciones.find((s) => s.id === id)?.nombre ?? `sección ${id}`;
  const nombreDia = (id: number) => dias.find((d) => d.id === id)?.numeroDia ?? id;

  for (const d of deportes) {
    const existe = await prisma.bloqueHorario.findFirst({
      where: {
        seccionId: d.seccionId,
        diaSemanaId: d.diaSemanaId,
        numeroPeriodo: d.numeroPeriodo,
        esAcademico: true,
      },
    });
    if (!existe) {
      res.status(400).json({
        error: `No existe un bloque académico para ${nombreSeccion(d.seccionId)}, día ${nombreDia(d.diaSemanaId)}, período ${d.numeroPeriodo}. Crea el bloque antes de marcar el día de deportes.`,
      });
      return;
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.reunionSeccion.deleteMany();
      await tx.deporteSeccion.deleteMany();

      for (const r of reunionesSeccion) {
        await tx.reunionSeccion.create({
          data: {
            diaSemanaId: r.diaSemanaId,
            horaInicio: r.horaInicio,
            horaFin: r.horaFin,
            secciones: { connect: r.seccionIds.map((id) => ({ id })) },
          },
        });
      }
      for (const d of deportes) {
        await tx.deporteSeccion.create({
          data: {
            seccionId: d.seccionId,
            diaSemanaId: d.diaSemanaId,
            numeroPeriodo: d.numeroPeriodo,
          },
        });
      }
    });
    res.json(await getSnapshot());
  } catch (err) {
    throw mapPrismaError(err);
  }
});

export default router;