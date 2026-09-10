import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError, mapPrismaError } from "../lib/errors.js";

const router = Router();

router.use(requireAuth);

const idParam = z.coerce.number().int().positive();
const parseId = (v: string) => idParam.parse(v);

const qs = {
  str: (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
  num: (v: unknown) => (typeof v === "string" && v.trim() ? Number(v) : undefined),
  bool: (v: unknown) => {
    if (typeof v !== "string") return undefined;
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
    return undefined;
  },
};

const contains = (v?: string) => (v ? { contains: v, mode: "insensitive" as const } : undefined);

/* ---------------- Secciones ---------------- */
router.get("/secciones", async (_req, res) => {
  const items = await prisma.seccion.findMany({
    include: { _count: { select: { cursos: true, bloques: true } } },
    orderBy: { id: "asc" },
  });
  res.json(items);
});

const seccionSchema = z.object({ nombre: z.string().min(1) });

router.post("/secciones", async (req, res) => {
  const parsed = seccionSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
  try {
    const item = await prisma.seccion.create({ data: parsed.data });
    res.status(201).json(item);
  } catch (err) {
    throw mapPrismaError(err);
  }
});

/* ---------------- Días ---------------- */
router.get("/dias", async (_req, res) => {
  const items = await prisma.diaSemana.findMany({ orderBy: { numeroDia: "asc" } });
  res.json(items);
});

/* ---------------- Bloques horarios ---------------- */
const bloqueSchema = z
  .object({
    seccionId: z.number().int().positive(),
    diaSemanaId: z.number().int().positive(),
    numeroPeriodo: z.string().transform((s) => s.trim().toUpperCase()),
    horaInicio: z.string().regex(/^\d{2}:\d{2}$/),
    horaFin: z.string().regex(/^\d{2}:\d{2}$/),
    esAcademico: z.boolean().default(true),
  })
  .refine((b) => b.horaFin > b.horaInicio, {
    path: ["horaFin"],
    message: "La hora de fin debe ser posterior a la de inicio",
  });

const bloquePatchSchema = z
  .object({
    seccionId: z.number().int().positive().optional(),
    diaSemanaId: z.number().int().positive().optional(),
    numeroPeriodo: z.string().transform((s) => s.trim().toUpperCase()).optional(),
    horaInicio: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    horaFin: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    esAcademico: z.boolean().optional(),
  })
  .refine((b) => !(b.horaInicio && b.horaFin) || b.horaFin > b.horaInicio, {
    path: ["horaFin"],
    message: "La hora de fin debe ser posterior a la de inicio",
  });

router.get("/bloques", async (req, res) => {
  const where = {
    seccionId: qs.num(req.query.seccionId),
    diaSemanaId: qs.num(req.query.diaSemanaId),
    esAcademico: qs.bool(req.query.esAcademico),
    numeroPeriodo: contains(qs.str(req.query.q)),
  };
  const items = await prisma.bloqueHorario.findMany({
    where,
    include: {
      seccion: true,
      diaSemana: true,
      _count: { select: { asignaciones: true } },
    },
    orderBy: [{ seccionId: "asc" }, { diaSemanaId: "asc" }, { horaInicio: "asc" }],
  });
  res.json(items);
});

router.get("/bloques/:id", async (req, res) => {
  const item = await prisma.bloqueHorario.findUnique({
    where: { id: parseId(req.params.id) },
    include: { seccion: true, diaSemana: true, asignaciones: true },
  });
  if (!item) throw new HttpError(404, "Bloque no encontrado.");
  res.json(item);
});

router.post("/bloques", async (req, res) => {
  const parsed = bloqueSchema.safeParse(req.body);
  if (!parsed.success)
    return void res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
  try {
    const item = await prisma.bloqueHorario.create({ data: parsed.data });
    res.status(201).json(item);
  } catch (err) {
    throw mapPrismaError(err);
  }
});

router.patch("/bloques/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const parsed = bloquePatchSchema.safeParse(req.body);
  if (!parsed.success)
    return void res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
  try {
    const item = await prisma.bloqueHorario.update({ where: { id }, data: parsed.data });
    res.json(item);
  } catch (err) {
    throw mapPrismaError(err);
  }
});

router.delete("/bloques/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const count = await prisma.horarioAsignado.count({ where: { bloqueHorarioId: id } });
  if (count > 0)
    throw new HttpError(409, "El bloque tiene asignaciones en el horario generado. Limpia o regenera el horario primero.");
  await prisma.bloqueHorario.delete({ where: { id } });
  res.status(204).end();
});

/* ---------------- Profesores ---------------- */
const profesorSchema = z.object({
  nombre: z.string().min(1),
  email: z.string().email().optional().nullable(),
  maxHorasSemana: z.number().int().positive().optional().nullable(),
});

router.get("/profesores", async (req, res) => {
  const withCargas = req.query.withCargas === "true";
  const tieneCargas = qs.bool(req.query.tieneCargas);
  const q = qs.str(req.query.q);
  const where = {
    ...(q
      ? { OR: [{ nombre: contains(q) }, { email: contains(q) }] }
      : {}),
    ...(tieneCargas === undefined ? undefined : tieneCargas ? { cargas: { some: {} } } : { cargas: { none: {} } }),
  };
  const items = await prisma.profesor.findMany({
    where,
    include: withCargas
      ? { cargas: { include: { curso: true, materia: true } }, _count: { select: { cargas: true } } }
      : { _count: { select: { cargas: true } } },
    orderBy: { nombre: "asc" },
  });
  res.json(items);
});

router.get("/profesores/:id", async (req, res) => {
  const item = await prisma.profesor.findUnique({
    where: { id: parseId(req.params.id) },
    include: { cargas: { include: { curso: true, materia: true } }, _count: { select: { cargas: true } } },
  });
  if (!item) throw new HttpError(404, "Profesor no encontrado.");
  res.json(item);
});

router.post("/profesores", async (req, res) => {
  const parsed = profesorSchema.safeParse(req.body);
  if (!parsed.success)
    return void res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
  try {
    const item = await prisma.profesor.create({ data: parsed.data });
    res.status(201).json(item);
  } catch (err) {
    throw mapPrismaError(err);
  }
});

router.patch("/profesores/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const parsed = profesorSchema.partial().safeParse(req.body);
  if (!parsed.success)
    return void res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
  try {
    const item = await prisma.profesor.update({ where: { id }, data: parsed.data });
    res.json(item);
  } catch (err) {
    throw mapPrismaError(err);
  }
});

router.delete("/profesores/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const count = await prisma.cargaAcademica.count({ where: { profesorId: id } });
  if (count > 0)
    throw new HttpError(409, "El profesor tiene cargas académicas asociadas. Transfiere o elimina esas cargas primero.");
  await prisma.profesor.delete({ where: { id } });
  res.status(204).end();
});

/* ---------------- Cursos ---------------- */
const cursoSchema = z.object({
  seccionId: z.number().int().positive(),
  nombre: z.string().min(1),
});

router.get("/cursos", async (req, res) => {
  const seccionId = qs.num(req.query.seccionId);
  const items = await prisma.curso.findMany({
    where: {
      seccionId,
      nombre: contains(qs.str(req.query.q)),
    },
    include: { seccion: true, _count: { select: { cargas: true } } },
    orderBy: [{ seccionId: "asc" }, { nombre: "asc" }],
  });
  res.json(items);
});

router.get("/cursos/:id", async (req, res) => {
  const item = await prisma.curso.findUnique({
    where: { id: parseId(req.params.id) },
    include: { seccion: true, cargas: { include: { materia: true, profesor: true } } },
  });
  if (!item) throw new HttpError(404, "Curso no encontrado.");
  res.json(item);
});

router.post("/cursos", async (req, res) => {
  const parsed = cursoSchema.safeParse(req.body);
  if (!parsed.success)
    return void res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
  try {
    const item = await prisma.curso.create({ data: parsed.data });
    res.status(201).json(item);
  } catch (err) {
    throw mapPrismaError(err);
  }
});

router.patch("/cursos/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const parsed = cursoSchema.partial().safeParse(req.body);
  if (!parsed.success)
    return void res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
  try {
    const item = await prisma.curso.update({ where: { id }, data: parsed.data });
    res.json(item);
  } catch (err) {
    throw mapPrismaError(err);
  }
});

router.delete("/cursos/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const count = await prisma.cargaAcademica.count({ where: { cursoId: id } });
  if (count > 0)
    throw new HttpError(409, "El curso tiene cargas académicas asociadas. Elimínalas primero.");
  await prisma.curso.delete({ where: { id } });
  res.status(204).end();
});

/* ---------------- Materias ---------------- */
const materiaSchema = z.object({ nombre: z.string().min(1) });

router.get("/materias", async (req, res) => {
  const items = await prisma.materia.findMany({
    where: { nombre: contains(qs.str(req.query.q)) },
    include: { _count: { select: { cargas: true } } },
    orderBy: { nombre: "asc" },
  });
  res.json(items);
});

router.get("/materias/:id", async (req, res) => {
  const item = await prisma.materia.findUnique({
    where: { id: parseId(req.params.id) },
    include: { cargas: { include: { curso: true, profesor: true } } },
  });
  if (!item) throw new HttpError(404, "Materia no encontrada.");
  res.json(item);
});

router.post("/materias", async (req, res) => {
  const parsed = materiaSchema.safeParse(req.body);
  if (!parsed.success)
    return void res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
  try {
    const item = await prisma.materia.create({ data: parsed.data });
    res.status(201).json(item);
  } catch (err) {
    throw mapPrismaError(err);
  }
});

router.patch("/materias/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const parsed = materiaSchema.partial().safeParse(req.body);
  if (!parsed.success)
    return void res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
  try {
    const item = await prisma.materia.update({ where: { id }, data: parsed.data });
    res.json(item);
  } catch (err) {
    throw mapPrismaError(err);
  }
});

router.delete("/materias/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const count = await prisma.cargaAcademica.count({ where: { materiaId: id } });
  if (count > 0)
    throw new HttpError(409, "La materia tiene cargas académicas asociadas. Elimínalas primero.");
  await prisma.materia.delete({ where: { id } });
  res.status(204).end();
});

/* ---------------- Cargas académicas ---------------- */
const cargaSchema = z.object({
  cursoId: z.number().int().positive(),
  materiaId: z.number().int().positive(),
  profesorId: z.number().int().positive(),
  bloquesSemanalesRequeridos: z.number().int().positive(),
});

const cargaInclude = {
  curso: { include: { seccion: true } },
  materia: true,
  profesor: true,
  asignaciones: { select: { id: true } },
};

router.get("/cargas", async (req, res) => {
  const where = {
    cursoId: qs.num(req.query.cursoId),
    materiaId: qs.num(req.query.materiaId),
    profesorId: qs.num(req.query.profesorId),
    bloquesSemanalesRequeridos: {
      ...(qs.num(req.query.minBloques) === undefined ? {} : { gte: qs.num(req.query.minBloques) }),
      ...(qs.num(req.query.maxBloques) === undefined ? {} : { lte: qs.num(req.query.maxBloques) }),
    },
    ...(qs.num(req.query.seccionId) === undefined ? {} : { curso: { seccionId: qs.num(req.query.seccionId) } }),
    ...(qs.str(req.query.q)
      ? {
          OR: [
            { curso: { nombre: contains(qs.str(req.query.q)) } },
            { materia: { nombre: contains(qs.str(req.query.q)) } },
            { profesor: { nombre: contains(qs.str(req.query.q)) } },
          ],
        }
      : {}),
  };
  const items = await prisma.cargaAcademica.findMany({
    where,
    include: cargaInclude,
    orderBy: [{ curso: { seccionId: "asc" } }, { curso: { nombre: "asc" } }, { materia: { nombre: "asc" } }],
  });
  res.json(items);
});

router.get("/cargas/:id", async (req, res) => {
  const item = await prisma.cargaAcademica.findUnique({
    where: { id: parseId(req.params.id) },
    include: cargaInclude,
  });
  if (!item) throw new HttpError(404, "Carga académica no encontrada.");
  res.json(item);
});

router.post("/cargas", async (req, res) => {
  const parsed = cargaSchema.safeParse(req.body);
  if (!parsed.success)
    return void res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
  try {
    const item = await prisma.cargaAcademica.create({ data: parsed.data });
    res.status(201).json(item);
  } catch (err) {
    throw mapPrismaError(err);
  }
});

router.patch("/cargas/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const parsed = cargaSchema.partial().safeParse(req.body);
  if (!parsed.success)
    return void res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
  try {
    const item = await prisma.cargaAcademica.update({ where: { id }, data: parsed.data });
    res.json(item);
  } catch (err) {
    throw mapPrismaError(err);
  }
});

router.delete("/cargas/:id", async (req, res) => {
  await prisma.cargaAcademica.delete({ where: { id: parseId(req.params.id) } });
  res.status(204).end();
});

export default router;