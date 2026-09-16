const { PrismaClient } = require("@prisma/client");
const { generarPdfSeccion } = require("./dist/lib/horarioPdf.js");
const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

async function main() {
  const prof = await prisma.profesor.findFirst({
    where: { nombre: { contains: "ligia", mode: "insensitive" } },
    select: { id: true, nombre: true, seccionBaseId: true },
  });
  if (!prof) throw new Error("No se encontro profesor Ligia");
  console.log("Docente:", prof.nombre, "| id:", prof.id, "| seccionBaseId:", prof.seccionBaseId);

  const seccion = await prisma.seccion.findUnique({ where: { id: prof.seccionBaseId } });
  if (!seccion) throw new Error("Seccion base no encontrada");
  console.log("Seccion base:", seccion.nombre);

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
    prisma.diaSemana.findMany({ select: { id: true, numeroDia: true } }),
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
  const out = path.join(outDir, "verif-ligia.pdf");
  fs.writeFileSync(out, Buffer.from(bytes));
  console.log("PDF escrito:", out, "| bytes:", bytes.length);

  const doc = await PDFDocument.load(bytes);
  console.log("Total paginas:", doc.getPageCount());

  const todas = await doc.save();
  const texto = Buffer.from(todas).toString("latin1");

  const etiquetasPorPagina = [];
  for (let i = 0; i < doc.getPageCount(); i++) {
    const p = await doc.getPage(i);
    const op = p.node.contents;
    const frag = op?.toString() ?? "";
    etiquetasPorPagina.push(frag.length);
  }

  const paginasDocente = [];
  const pattern = /Horario \u00b7 Docente/g;
  let m;
  let idx = 0;
  while ((m = pattern.exec(texto)) !== null) {
    paginasDocente.push({ inicio: m.index, pag: "?" });
    idx += 1;
  }
  console.log("Paginas 'Horario · Docente' encontradas en el stream:", idx);

  const fran = /Franc\u00e9s/g;
  const encuentra = texto.match(/Franc\u00e9s/g) ?? [];
  console.log("Total ocurrencias 'Francés' en el PDF completo:", encuentra.lengthapse);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
