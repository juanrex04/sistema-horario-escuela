import { prisma } from "./src/lib/prisma.js";
import { generarPdfSeccion } from "./src/lib/horarioPdf.js";

async function main() {
  const secciones = await prisma.seccion.findMany({ orderBy: { id: "asc" } });
  const asignaciones = await prisma.horarioAsignado.findMany({
    include: {
      bloqueHorario: { include: { seccion: true, diaSemana: true } },
      cargaAcademica: {
        include: { curso: { include: { seccion: true } }, materia: true, profesor: true },
      },
    },
  });
  console.log("total asignaciones:", asignaciones.length);
  const cursos = await prisma.curso.findMany();
  const profesores = await prisma.profesor.findMany({ include: { seccionBase: true } });
  const bloques = await prisma.bloqueHorario.findMany();
  const reuniones = await prisma.reunionSeccion.findMany({ include: { secciones: true } });
  const deportes = await prisma.deporteSeccion.findMany();
  const colaborativas = await prisma.colaborativaGenerada.findMany({
    include: { departamento: { select: { id: true, nombre: true } } },
  });
  const dias = await prisma.diaSemana.findMany({ select: { id: true, numeroDia: true } });

  for (const sec of secciones) {
    const nCursos = cursos.filter((c) => c.seccionId === sec.id).length;
    const nAsig = asignaciones.filter((a) => a.cargaAcademica.curso.seccionId === sec.id).length;
    const profIds = new Set(asignaciones.filter((a) => a.cargaAcademica.curso.seccionId === sec.id).map((a) => a.cargaAcademica.profesorId));
    console.log(`SEC ${sec.id} ${sec.nombre}: cursos=${nCursos} asignaciones=${nAsig} profes=${profIds.size}`);
  }

  const sec = secciones[1];
  const bytes = await generarPdfSeccion({
    seccion: sec,
    asignaciones,
    bloques,
    cursos,
    profesores,
    reuniones,
    deportes,
    colaborativas,
    dias,
  });
  console.log("pdf bytes Primaria:", bytes.length);
}

main().finally(() => prisma.$disconnect());