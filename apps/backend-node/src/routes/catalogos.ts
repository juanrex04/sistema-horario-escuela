import { Router } from "express";
import ExcelJS from "exceljs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
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

const DIA_NOMBRES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

function normalizaTexto(v: string): string {
  return v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizaHora(v: unknown): string | null {
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0 || v >= 1) return null;
    const total = Math.round(v * 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  if (typeof v !== "string") return null;
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(v.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function parseAcademico(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "number" && (v === 1 || v === 0)) return v === 1;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["si", "sí", "1", "true"].includes(s)) return true;
    if (["no", "0", "false"].includes(s)) return false;
  }
  return undefined;
}

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

router.get("/bloques/plantilla", async (_req, res) => {
  const secciones = await prisma.seccion.findMany({ orderBy: { nombre: "asc" }, select: { nombre: true } });
  const listaSecciones = secciones.length ? secciones.map((s) => s.nombre).join(",") : "Sección";

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Bloques");
  ws.columns = [
    { header: "Sección", key: "seccion", width: 22 },
    { header: "Día", key: "dia", width: 16 },
    { header: "Período", key: "periodo", width: 16 },
    { header: "Hora inicio", key: "horaInicio", width: 13 },
    { header: "Hora fin", key: "horaFin", width: 13 },
    { header: "¿Académico?", key: "academico", width: 14 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: "FF1F2937" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
  ws.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 22;
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const validaciones = (
    ws as unknown as {
      dataValidations: {
        add: (address: string, validation: { type: string; formulae: string[]; allowBlank?: boolean }) => void;
      };
    }
  ).dataValidations;
  validaciones.add("A2:A2000", { type: "list", formulae: [`"${listaSecciones}"`], allowBlank: true });
  validaciones.add("B2:B2000", { type: "list", formulae: [`"${DIA_NOMBRES.join(",")}"`], allowBlank: true });
  validaciones.add("F2:F2000", { type: "list", formulae: [`"Sí,No"`], allowBlank: true });

  const notas = wb.addWorksheet("Notas");
  notas.columns = [{ width: 95 }];
  const instrucciones = [
    "Instrucciones para llenar la plantilla",
    "",
    "1. Una fila por bloque (período) de la sección.",
    "2. Sección, Día y ¿Académico? tienen listas desplegables.",
    "3. Período: texto libre (se convierte a mayúsculas), ej.: 1, 2, 3, HOMEROOM, LUNCH.",
    "4. Horas en formato HH:MM; la hora de fin debe ser posterior al inicio.",
    "5. Si el bloque (misma sección, día y período) ya existe, se actualiza con los nuevos datos.",
    "6. Guarda el archivo y usa 'Cargar desde Excel' en la página de Bloques.",
    "7. Las filas con errores se reportan al final; las demás se importan igual.",
  ];
  instrucciones.forEach((linea, idx) => {
    const celda = notas.getCell(idx + 1, 1);
    celda.value = linea;
    if (idx === 0) {
      celda.font = { bold: true, size: 13 };
    }
  });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="plantilla_bloques.xlsx"');
  await wb.xlsx.write(res);
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

type FilaBloqueImportada = {
  seccionId: number;
  diaSemanaId: number;
  numeroPeriodo: string;
  horaInicio: string;
  horaFin: string;
  esAcademico: boolean;
};

router.post("/bloques/importar", async (req, res) => {
  const parsed = z
    .object({
      bloques: z.array(z.unknown()).min(1).max(5000),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return void res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });

  const diasNorm = DIA_NOMBRES.map((d) => normalizaTexto(d));
  const errores: { fila: number; motivo: string }[] = [];
  const pendientes: {
    fila: number;
    seccion: string;
    diaNum: number;
    numeroPeriodo: string;
    horaInicio: string;
    horaFin: string;
    esAcademico: boolean;
  }[] = [];

  parsed.data.bloques.forEach((row, i) => {
    const fila = i + 2;
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      errores.push({ fila, motivo: "La fila no es un bloque válido" });
      return;
    }
    const r = row as Record<string, unknown>;
    const seccion = typeof r.seccion === "string" ? r.seccion.trim() : "";
    const dia = typeof r.dia === "string" ? r.dia.trim() : "";
    const numeroPeriodo =
      typeof r.numeroPeriodo === "string" ? r.numeroPeriodo.trim().toUpperCase() : "";

    if (!seccion) {
      errores.push({ fila, motivo: "Sección vacía" });
      return;
    }
    const diaIdx = dia ? diasNorm.indexOf(normalizaTexto(dia)) : -1;
    if (diaIdx === -1) {
      errores.push({
        fila,
        motivo: dia
          ? `Día no reconocido: "${dia}" (usa Lunes...Viernes)`
          : "Día vacío (usa Lunes...Viernes)",
      });
      return;
    }
    if (!numeroPeriodo) {
      errores.push({ fila, motivo: "Período vacío" });
      return;
    }
    const horaInicio = normalizaHora(r.horaInicio);
    if (horaInicio === null) {
      errores.push({ fila, motivo: `Hora inicio inválida: "${String(r.horaInicio)}"` });
      return;
    }
    const horaFin = normalizaHora(r.horaFin);
    if (horaFin === null) {
      errores.push({ fila, motivo: `Hora fin inválida: "${String(r.horaFin)}"` });
      return;
    }
    if (horaFin <= horaInicio) {
      errores.push({ fila, motivo: "La hora de fin debe ser posterior a la de inicio" });
      return;
    }
    pendientes.push({
      fila,
      seccion,
      diaNum: diaIdx + 1,
      numeroPeriodo,
      horaInicio,
      horaFin,
      esAcademico: parseAcademico(r.esAcademico) ?? true,
    });
  });

  const seccionPorNombre = new Map<string, number>();
  if (pendientes.length > 0) {
    const secciones = await prisma.seccion.findMany({
      where: { nombre: { in: [...new Set(pendientes.map((p) => p.seccion))] } },
      select: { id: true, nombre: true },
    });
    for (const s of secciones) seccionPorNombre.set(s.nombre, s.id);
  }
  const dias = await prisma.diaSemana.findMany({ select: { id: true, numeroDia: true } });
  const diaPorNumero = new Map(dias.map((d) => [d.numeroDia, d.id]));

  const validas: FilaBloqueImportada[] = [];
  for (const p of pendientes) {
    const seccionId = seccionPorNombre.get(p.seccion);
    if (seccionId === undefined) {
      errores.push({ fila: p.fila, motivo: `Sección no encontrada: "${p.seccion}"` });
      continue;
    }
    const diaSemanaId = diaPorNumero.get(p.diaNum);
    if (diaSemanaId === undefined) {
      errores.push({
        fila: p.fila,
        motivo: `Día no configurado en el sistema: "${DIA_NOMBRES[p.diaNum - 1]}"`,
      });
      continue;
    }
    validas.push({
      seccionId,
      diaSemanaId,
      numeroPeriodo: p.numeroPeriodo,
      horaInicio: p.horaInicio,
      horaFin: p.horaFin,
      esAcademico: p.esAcademico,
    });
  }

  const agrupadas = new Map<string, FilaBloqueImportada>();
  for (const v of validas) agrupadas.set(`${v.seccionId}_${v.diaSemanaId}_${v.numeroPeriodo}`, v);
  const filas = [...agrupadas.values()];

  const existentes = await prisma.bloqueHorario.findMany({
    where: {
      seccionId: { in: [...new Set(filas.map((f) => f.seccionId))] },
      diaSemanaId: { in: [...new Set(filas.map((f) => f.diaSemanaId))] },
    },
    select: { seccionId: true, diaSemanaId: true, numeroPeriodo: true },
  });
  const existentesSet = new Set(
    existentes.map((e) => `${e.seccionId}_${e.diaSemanaId}_${e.numeroPeriodo}`)
  );

  try {
    await prisma.$transaction(
      filas.map((v) =>
        prisma.bloqueHorario.upsert({
          where: {
            seccionId_diaSemanaId_numeroPeriodo: {
              seccionId: v.seccionId,
              diaSemanaId: v.diaSemanaId,
              numeroPeriodo: v.numeroPeriodo,
            },
          },
          create: v,
          update: { horaInicio: v.horaInicio, horaFin: v.horaFin, esAcademico: v.esAcademico },
        })
      )
    );
  } catch (err) {
    throw mapPrismaError(err);
  }

  const creados = filas.filter(
    (v) => !existentesSet.has(`${v.seccionId}_${v.diaSemanaId}_${v.numeroPeriodo}`)
  ).length;
  res.json({ creados, actualizados: filas.length - creados, errores });
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
const horaRe = /^\d{2}:\d{2}$/;
const jornadaParcialSchema = z
  .object({
    diaSemanaId: z.number().int().positive(),
    horaFin: z.string().regex(horaRe),
  })
  .refine((j) => j.horaFin > "06:45", {
    message: "La hora de salida debe ser posterior a las 06:45",
    path: ["horaFin"],
  });

const profesorFields = {
  nombre: z.string().min(1),
  departamentoId: z.number().int().positive().optional().nullable(),
  seccionBaseId: z.number().int().positive(),
  prefiereGruposConsecutivos: z.boolean().optional(),
  esTiempoCompleto: z.boolean().optional(),
  jornadaParcial: z.array(jornadaParcialSchema).optional().nullable(),
};

function validarJornadaProfesor(data: any, ctx: z.RefinementCtx): void {
  if (data.esTiempoCompleto !== false) return;
  if (!data.jornadaParcial || data.jornadaParcial.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Un docente de tiempo parcial debe tener al menos un día de trabajo configurado.",
      path: ["jornadaParcial"],
    });
    return;
  }
  const ids = data.jornadaParcial.map((j: { diaSemanaId: number }) => j.diaSemanaId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "El día de trabajo no puede repetirse.",
      path: ["jornadaParcial"],
    });
  }
}

const profesorSchemaBase = z.object(profesorFields);
const profesorSchema = profesorSchemaBase.superRefine(validarJornadaProfesor);
const profesorPatchSchema = profesorSchemaBase.partial().superRefine(validarJornadaProfesor);

router.get("/profesores", async (req, res) => {
  const { paginado, page, pageSize, skip, take } = paginar(req);
  const withCargas = req.query.withCargas === "true";
  const tieneCargas = qs.bool(req.query.tieneCargas);
  const seccionBaseId = qs.num(req.query.seccionBaseId);
  const departamentoId = qs.num(req.query.departamentoId);
  const q = qs.str(req.query.q);
  const where = {
    ...(q ? { nombre: contains(q) } : {}),
    ...(tieneCargas === undefined ? undefined : tieneCargas ? { cargas: { some: {} } } : { cargas: { none: {} } }),
    ...(seccionBaseId === undefined ? undefined : { seccionBaseId }),
    ...(departamentoId === undefined ? undefined : { departamentoId }),
  };
  const items = await prisma.profesor.findMany({
    where,
    include: withCargas
      ? { seccionBase: true, departamento: true, cargas: { include: { curso: true, materia: true } }, _count: { select: { cargas: true } } }
      : { seccionBase: true, departamento: true, _count: { select: { cargas: true } } },
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
    include: { seccionBase: true, departamento: true, cargas: { include: { curso: true, materia: true } }, _count: { select: { cargas: true } } },
  });
  if (!item) throw new HttpError(404, "Profesor no encontrado.");
  res.json(item);
});

router.post("/profesores", async (req, res) => {
  const parsed = profesorSchema.safeParse(req.body);
  if (!parsed.success)
    return void res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
  const data: Prisma.ProfesorUncheckedCreateInput = {
    ...parsed.data,
    esTiempoCompleto: parsed.data.esTiempoCompleto ?? true,
    jornadaParcial: parsed.data.esTiempoCompleto === false ? parsed.data.jornadaParcial ?? [] : Prisma.DbNull,
  };
  try {
    const item = await prisma.profesor.create({ data });
    res.status(201).json(item);
  } catch (err) {
    throw mapPrismaError(err);
  }
});

router.patch("/profesores/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const parsed = profesorPatchSchema.safeParse(req.body);
  if (!parsed.success)
    return void res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
  const { jornadaParcial: _jp, ...resto } = parsed.data;
  const data: Prisma.ProfesorUpdateInput = { ...resto };
  if (parsed.data.esTiempoCompleto === true) data.jornadaParcial = Prisma.DbNull;
  else if (parsed.data.jornadaParcial !== undefined)
    data.jornadaParcial = parsed.data.jornadaParcial === null ? Prisma.DbNull : parsed.data.jornadaParcial;
  try {
    const item = await prisma.profesor.update({ where: { id }, data });
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
  const [materias, profesores] = await Promise.all([
    prisma.materia.count({ where: { departamentoId: id } }),
    prisma.profesor.count({ where: { departamentoId: id } }),
  ]);
  if (materias > 0)
    throw new HttpError(409, "El departamento tiene materias asociadas. Reasigna o elimina esas materias primero.");
  if (profesores > 0)
    throw new HttpError(409, "El departamento tiene docentes adscritos. Reasigna o elimina esos docentes primero.");
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
    materiaIds: z.array(z.number().int().positive()).min(1),
    profesorId: z.number().int().positive(),
    bloquesSemanalesRequeridos: z.number().int().positive(),
  })
  .refine((d) => new Set(d.cursoIds).size === d.cursoIds.length, {
    message: "Los cursoIds no deben repetirse.",
    path: ["cursoIds"],
  })
  .refine((d) => new Set(d.materiaIds).size === d.materiaIds.length, {
    message: "Las materiaIds no deben repetirse.",
    path: ["materiaIds"],
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
  const { cursoIds, materiaIds, profesorId, bloquesSemanalesRequeridos } = parsed.data;
  const yaExistentes = await prisma.cargaAcademica.findMany({
    where: { profesorId, cursoId: { in: cursoIds }, materiaId: { in: materiaIds } },
    select: { cursoId: true, materiaId: true },
  });
  const existentesSet = new Set(yaExistentes.map((e) => `${e.cursoId}_${e.materiaId}`));
  const combinaciones: { cursoId: number; materiaId: number }[] = [];
  for (const cursoId of cursoIds) {
    for (const materiaId of materiaIds) {
      if (!existentesSet.has(`${cursoId}_${materiaId}`)) combinaciones.push({ cursoId, materiaId });
    }
  }
  const omitidas = yaExistentes.map((e) => ({ cursoId: e.cursoId, materiaId: e.materiaId }));
  const creadas = await prisma.$transaction(
    combinaciones.map(({ cursoId, materiaId }) =>
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