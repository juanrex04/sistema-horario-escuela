const { PrismaClient } = require("@prisma/client");
const { generarPdfSeccion } = require("./dist/lib/horarioPdf.js");
const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

const PROF_NOMBRE = "ligia";

(async () => {
  const prof = await prisma.profesor.findFirst({
    where: { nombre: { contains: PROF_NOMBRE, mode: "insensitive" } },
    select: { id: true, nombre: true, seccionBaseId: true },
  });
  if (!prof) throw new Error(`No se encontró profesor con "${PROF_NOMBRE}"`);
  console.log("Docente:", prof.nombre, "id:", prof.id, "seccionBaseId:", prof.seccionBaseId);

  const seccion = await prisma.seccion.findUnique({ where: { id: prof.seccionBaseId } });
  if (!seccion) throw new Error("Sección base no encontrada");

  const [asignaciones, bloques, cursos, profesores, reuniones, deportes, colaborativas, dias] = await Promise.all([
    prisma.horarioAsignado.findMany({
      include: {
        bloqueHorario: { include: { seccion: true, diaSemana: true } },
        cargaAcademica: { include: { curso: { include: { seccion: true } }, materia: true, profesor: true } },
      },
    }),
    prisma.bloqueHorario.findMany(),
    prisma.curso.findMany(),
    prisma.profesor.findMany({ include: { seccionBase: true } }),
    prisma.reunionSeccion.findMany({ include: { secciones: true } }),
    prisma.deporteSeccion.findMany(),
    prisma.colaborativaGenerada.findMany({ include: { departamento: true } }),
    prisma.diaSemana.findMany(),
  ]);

  const bytes = await generarPdfSeccion({
    seccion,
    asignaciones,
    bloques,
    cursos,
    profesores,
    reuniones,
    deportes,
    colaborativas,
    dias,
  });

  const outDir = path.join(__dirname, "temp");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const out = path.join(outDir, `verif-ligia.pdf`);
  fs.writeFileSync(out, Buffer.from(bytes));
  console.log("PDF escrito:", out, "(", bytes.length, "bytes )");

  const doc = await PDFDocument.load(bytes);
  const nPaginas = doc.getPageCount();
  console.log("Total páginas:", nPaginas);

  const terminos = await doc.save();
  const textoCompleto = Buffer.from(terminos).toString("latin1");

  for (let i =  fuentes###; i < nPaginas; i++) {
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
