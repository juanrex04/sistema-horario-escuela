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

const materiaMismoBloqueSchema = z
  .object({
    materiaAId: z.number().int().positive(),
    materiaBId: z.number().int().positive(),
  })
  .refine((p) => p.materiaAId !== p.materiaBId, {
    path: ["materiaBId"],
    message: "Las materias del par deben ser distintas",
  });

const reglasSchema = z.object({
  reunionesSeccion: z.array(reunionSchema),
  deportes: z.array(deporteSchema),
  materiasMismoBloque: z.array(materiaMismoBloqueSchema),
  bloquesColaborativa: z.number().int().min(1).max(4),
});

function normalizarPares(pares: { materiaAId: number; materiaBId: number }[]) {
  const vistos = new Set<string>();
  const unicos: { materiaAId: number; materiaBId: number }[] = [];
  for (const p of pares) {
    const [a, b] = p.materiaAId < p.materiaBId ? [p.materiaAId, p.materiaBId] : [p.materiaBId, p.materiaAId];
    const k = `${a}_${b}`;
    if (!vistos.has(k)) {
      vistos.add(k);
      unicos.push({ materiaAId: a, materiaBId: b });
    }
  }
  return unicos;
}

const BLOQUES_COLABORATIVA_KEY = "bloquesColaborativa";

async function getSnapshot() {
  const [reunionesSeccion, deportes, materiasMismoBloque, config] = await Promise.all([
    prisma.reunionSeccion.findMany({
      include: { secciones: { select: { id: true, nombre: true } } },
      orderBy: [{ diaSemanaId: "asc" }, { horaInicio: "asc" }],
    }),
    prisma.deporteSeccion.findMany({
      include: { seccion: true, diaSemana: true },
      orderBy: [{ seccionId: "asc" }, { diaSemanaId: "asc" }],
    }),
    prisma.materiaMismoBloque.findMany({
      include: { materiaA: { select: { id: true, nombre: true } }, materiaB: { select: { id: true, nombre: true } } },
      orderBy: [{ materiaAId: "asc" }, { materiaBId: "asc" }],
    }),
    prisma.configuracion.findUnique({ where: { clave: BLOQUES_COLABORATIVA_KEY } }),
  ]);
  return { reunionesSeccion, deportes, materiasMismoBloque, bloquesColaborativa: Number(config?.valor) || 2 };
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
  const { reunionesSeccion, deportes, materiasMismoBloque, bloquesColaborativa } = parsed.data;

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
      await tx.materiaMismoBloque.deleteMany();

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
      for (const p of normalizarPares(materiasMismoBloque)) {
        await tx.materiaMismoBloque.create({
          data: { materiaAId: p.materiaAId, materiaBId: p.materiaBId },
        });
      }
      await tx.configuracion.upsert({
        where: { clave: BLOQUES_COLABORATIVA_KEY },
        update: { valor: String(bloquesColaborativa) },
        create: { clave: BLOQUES_COLABORATIVA_KEY, valor: String(bloquesColaborativa) },
      });
    });
    res.json(await getSnapshot());
  } catch (err) {
    throw mapPrismaError(err);
  }
});

export default router;