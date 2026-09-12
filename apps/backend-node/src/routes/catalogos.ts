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

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function paginar(req: { query: Record<string, unknown> }) {
  const pageQuery = qs.num(req.query.page);
  const rawSize = qs.num(req.query.pageSize);
  const paginado = pageQuery !== undefined;
  const page = Math.max(1, pageQuery ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize ?? DEFAULT_PAGE_SIZE));
  return { paginado, page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/* ---------------- Secciones ---------------- */
router.get("/secciones", async (req, res) => {
  const { paginado, page, pageSize, skip, take } = paginar(req);
  const where = { nombre: contains(qs.str(req.query.q)) };
  const items = await prisma.seccion.findMany({
    where,
    include: { _count: { select: { cursos: true, bloques: true, profesoresAdscritos: true } } },
    orderBy: { id: "asc" },
    ...(paginado ? { skip, take } : {}),
  });
  if (!paginado) return res.json(items);
  const total = await prisma.seccion.count({ where });
  res.json({ items, total, page, pageSize });
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

router.patch("/secciones/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const parsed = seccionSchema.partial().safeParse(req.body);
  if (!parsed.success)
    return void res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
  try {
    const item = await prisma.seccion.update({ where: { id }, data: parsed.data });
    res.json(item);
  } catch (err) {
    throw mapPrismaError(err);
  }
});

router.delete("/secciones/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const uso = await prisma.seccion.findUnique({
    where: { id },
    select: { _count: { select: { profesoresAdscritos: true, cursos: true, bloques: true } } },
  });
  if (!uso) throw new HttpError(404, "Sección no encontrada.");
  const { profesoresAdscritos, cursos, bloques } = uso._count;
  if (profesoresAdscritos > 0 || cursos > 0 || bloques > 0)
    throw new HttpError(
      409,
      `La sección tiene ${profesoresAdscritos} docente(s) adscrito(s), ${cursos} curso(s) y ${bloques} bloque(s). Elimínalos antes de borrarla.`
    );
  await prisma.seccion.delete({ where: { id } });
  res.status(204).end();
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
    diaSemanaId: z.number().int().positive().optional(),
    diaSemanaIds: z.array(z.number().int().positive()).min(1).optional(),
    numeroPeriodo: z.string().transform((s) => s.trim().toUpperCase()),
    horaInicio: z.string().regex(/^\d{2}:\d{2}$/),
    horaFin: z.string().regex(/^\d{2}:\d{2}$/),
    esAcademico: z.boolean().default(true),
  })
  .refine((b) => b.diaSemanaId !== undefined || b.diaSemanaIds !== undefined, {
    path: ["diaSemanaIds"],
    message: "Debe indicarse al menos un día (diaSemanaIds)",
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
  const { paginado, page, pageSize, skip, take } = paginar(req);
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
    ...(paginado ? { skip, take } : {}),
  });
  if (!paginado) return res.json(items);
  const total = await prisma.bloqueHorario.count({ where });
  res.json({ items, total, page, pageSize });
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
  const data = parsed.data;
  const seccion = await prisma.seccion.findUnique({ where: { id: data.seccionId } });
  if (!seccion) throw new HttpError(404, "Sección no encontrada.");
  const dias = Array.from(new Set(data.diaSemanaIds ?? [data.diaSemanaId!]));
  try {
    const items = await prisma.$transaction(
      dias.map((diaSemanaId) =>
        prisma.bloqueHorario.upsert({
          where: {
            seccionId_diaSemanaId_numeroPeriodo: { seccionId: data.seccionId, diaSemanaId, numeroPeriodo: data.numeroPeriodo },
          },
          create: {
            seccionId: data.seccionId,
            diaSemanaId,
            numeroPeriodo: data.numeroPeriodo,
            horaInicio: data.horaInicio,
            horaFin: data.horaFin,
            esAcademico: data.esAcademico,
          },
          update: {
            horaInicio: data.horaInicio,
            horaFin: data.horaFin,
            esAcademico: data.esAcademico,
          },
        })
      )
    );
    res.status(201).json(items);
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
  seccionBaseId: z.number().int().positive(),
});

router.get("/profesores", async (req, res) => {
  const { paginado, page, pageSize, skip, take } = paginar(req);
  const withCargas = req.query.withCargas === "true";
  const tieneCargas = qs.bool(req.query.tieneCargas);
  const seccionBaseId = qs.num(req.query.seccionBaseId);
  const q = qs.str(req.query.q);
  const where = {
    ...(q
      ? { OR: [{ nombre: contains(q) }, { email: contains(q) }] }
      : {}),
    ...(tieneCargas === undefined ? undefined : tieneCargas ? { cargas: { some: {} } } : { cargas: { none: {} } }),
    ...(seccionBaseId === undefined ? undefined : { seccionBaseId }),
  };
  const items = await prisma.profesor.findMany({
    where,
    include: withCargas
      ? { seccionBase: true, cargas: { include: { curso: true, materia: true } }, _count: { select: { cargas: true } } }
      : { seccionBase: true, _count: { select: { cargas: true } } },
    orderBy: { nombre: "asc" },
    ...(paginado ? { skip, take } : {}),
  });
  if (!paginado) return res.json(items);
  const total = await prisma.profesor.count({ where });
  res.json({ items, total, page, pageSize });
});

router.get("/profesores/:id", async (req, res) => {
  const item = await prisma.profesor.findUnique({
    where: { id: parseId(req.params.id) },
    include: { seccionBase: true, cargas: { include: { curso: true, materia: true } }, _count: { select: { cargas: true } } },
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
  const { paginado, page, pageSize, skip, take } = paginar(req);
  const seccionId = qs.num(req.query.seccionId);
  const where = {
    seccionId,
    nombre: contains(qs.str(req.query.q)),
  };
  const items = await prisma.curso.findMany({
    where,
    include: { seccion: true, _count: { select: { cargas: true } } },
    orderBy: [{ seccionId: "asc" }, { nombre: "asc" }],
    ...(paginado ? { skip, take } : {}),
  });
  if (!paginado) return res.json(items);
  const total = await prisma.curso.count({ where });
  res.json({ items, total, page, pageSize });
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
const materiaSchema = z.object({
  nombre: z.string().min(1),
  departamentoId: z.number().int().positive().nullable().optional(),
});

router.get("/materias", async (req, res) => {
  const { paginado, page, pageSize, skip, take } = paginar(req);
  const where = { nombre: contains(qs.str(req.query.q)) };
  const items = await prisma.materia.findMany({
    where,
    include: { departamento: true, _count: { select: { cargas: true } } },
    orderBy: { nombre: "asc" },
    ...(paginado ? { skip, take } : {}),
  });
  if (!paginado) return res.json(items);
  const total = await prisma.materia.count({ where });
  res.json({ items, total, page, pageSize });
});

router.get("/materias/:id", async (req, res) => {
  const item = await prisma.materia.findUnique({
    where: { id: parseId(req.params.id) },
    include: { departamento: true, cargas: { include: { curso: true, profesor: true } } },
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

/* ---------------- Departamentos ---------------- */
const departamentoSchema = z.object({
  nombre: z.string().min(1),
  reunionActiva: z.boolean().optional(),
});

const departamentoInclude = {
  materias: { select: { id: true, nombre: true } },
  _count: { select: { materias: true, colaborativas: true } },
};

router.get("/departamentos", async (req, res) => {
  const { paginado, page, pageSize, skip, take } = paginar(req);
  const where = { nombre: contains(qs.str(req.query.q)) };
  const items = await prisma.departamento.findMany({
    where,
    include: departamentoInclude,
    orderBy: { nombre: "asc" },
    ...(paginado ? { skip, take } : {}),
  });
  if (!paginado) return res.json(items);
  const total = await prisma.departamento.count({ where });
  res.json({ items, total, page, pageSize });
});

router.get("/departamentos/:id", async (req, res) => {
  const item = await prisma.departamento.findUnique({
    where: { id: parseId(req.params.id) },
    include: departamentoInclude,
  });
  if (!item) throw new HttpError(404, "Departamento no encontrado.");
  res.json(item);
});

router.post("/departamentos", async (req, res) => {
  const parsed = departamentoSchema.safeParse(req.body);
  if (!parsed.success)
    return void res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
  try {
    const item = await prisma.departamento.create({ data: parsed.data });
    res.status(201).json(item);
  } catch (err) {
    throw mapPrismaError(err);
  }
});

router.patch("/departamentos/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const parsed = departamentoSchema.partial().safeParse(req.body);
  if (!parsed.success)
    return void res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
  try {
    const item = await prisma.departamento.update({ where: { id }, data: parsed.data });
    res.json(item);
  } catch (err) {
    throw mapPrismaError(err);
  }
});

router.patch("/departamentos/:id/materias", async (req, res) => {
  const id = parseId(req.params.id);
  const parsed = z.object({ materiaIds: z.array(z.number().int().positive()) }).safeParse(req.body);
  if (!parsed.success)
    return void res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
  try {
    const item = await prisma.departamento.update({
      where: { id },
      data: { materias: { set: parsed.data.materiaIds.map((materiaId) => ({ id: materiaId })) } },
      include: departamentoInclude,
    });
    res.json(item);
  } catch (err) {
    throw mapPrismaError(err);
  }
});

router.delete("/departamentos/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const count = await prisma.materia.count({ where: { departamentoId: id } });
  if (count > 0)
    throw new HttpError(409, "El departamento tiene materias asociadas. Reasigna o elimina esas materias primero.");
  await prisma.departamento.delete({ where: { id } });
  res.status(204).end();
});

/* ---------------- Cargas académicas ---------------- */
const cargaSchema = z.object({
  cursoId: z.number().int().positive(),
  materiaId: z.number().int().positive(),
  profesorId: z.number().int().positive(),
  bloquesSemanalesRequeridos: z.number().int().positive(),
});

const cargaMasivaSchema = z
  .object({
    cursoIds: z.array(z.number().int().positive()).min(1),
    materiaId: z.number().int().positive(),
    profesorId: z.number().int().positive(),
    bloquesSemanalesRequeridos: z.number().int().positive(),
  })
  .refine((d) => new Set(d.cursoIds).size === d.cursoIds.length, {
    message: "Los cursoIds no deben repetirse.",
    path: ["cursoIds"],
  });

const cargaInclude = {
  curso: { include: { seccion: true } },
  materia: true,
  profesor: true,
  asignaciones: { select: { id: true } },
};

router.get("/cargas", async (req, res) => {
  const { paginado, page, pageSize, skip, take } = paginar(req);
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
    ...(paginado ? { skip, take } : {}),
  });
  if (!paginado) return res.json(items);
  const total = await prisma.cargaAcademica.count({ where });
  res.json({ items, total, page, pageSize });
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

router.post("/cargas/masivas", async (req, res) => {
  const parsed = cargaMasivaSchema.safeParse(req.body);
  if (!parsed.success)
    return void res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
  const { cursoIds, materiaId, profesorId, bloquesSemanalesRequeridos } = parsed.data;
  const yaExistentes = await prisma.cargaAcademica.findMany({
    where: { materiaId, profesorId, cursoId: { in: cursoIds } },
    select: { cursoId: true },
  });
  const existentesSet = new Set(yaExistentes.map((e) => e.cursoId));
  const omitidas = cursoIds.filter((id) => existentesSet.has(id));
  const aCrear = cursoIds.filter((id) => !existentesSet.has(id));
  const creadas = await prisma.$transaction(
    aCrear.map((cursoId) =>
      prisma.cargaAcademica.create({
        data: { cursoId, materiaId, profesorId, bloquesSemanalesRequeridos },
      })
    )
  );
  res.status(201).json({ creadas, omitidas });
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