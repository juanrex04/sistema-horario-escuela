import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

type Block = { periodo: string; inicio: string; fin: string; academico: boolean };

const HORARIOS: Record<string, { monThu: Block[]; friday: Block[] }> = {
  Preescolar: {
    monThu: [
      { periodo: "1", inicio: "07:30", fin: "08:10", academico: true },
      { periodo: "2", inicio: "08:10", fin: "08:50", academico: true },
      { periodo: "BREAK", inicio: "08:50", fin: "09:10", academico: false },
      { periodo: "3", inicio: "09:10", fin: "09:50", academico: true },
      { periodo: "4", inicio: "09:50", fin: "10:30", academico: true },
    ],
    friday: [
      { periodo: "1", inicio: "07:30", fin: "08:10", academico: true },
      { periodo: "2", inicio: "08:10", fin: "08:50", academico: true },
      { periodo: "BREAK", inicio: "08:50", fin: "09:10", academico: false },
      { periodo: "3", inicio: "09:10", fin: "09:50", academico: true },
    ],
  },
  Primaria: {
    monThu: [
      { periodo: "1", inicio: "07:00", fin: "07:50", academico: true },
      { periodo: "2", inicio: "07:50", fin: "08:40", academico: true },
      { periodo: "BREAK", inicio: "08:40", fin: "09:00", academico: false },
      { periodo: "3", inicio: "09:00", fin: "09:50", academico: true },
      { periodo: "4", inicio: "09:50", fin: "10:40", academico: true },
      { periodo: "5", inicio: "10:40", fin: "11:30", academico: true },
      { periodo: "LUNCH", inicio: "11:30", fin: "12:10", academico: false },
      { periodo: "6", inicio: "12:10", fin: "13:00", academico: true },
    ],
    friday: [
      { periodo: "1", inicio: "07:00", fin: "07:50", academico: true },
      { periodo: "2", inicio: "07:50", fin: "08:40", academico: true },
      { periodo: "BREAK", inicio: "08:40", fin: "09:00", academico: false },
      { periodo: "3", inicio: "09:00", fin: "09:50", academico: true },
      { periodo: "4", inicio: "09:50", fin: "10:40", academico: true },
      { periodo: "5", inicio: "10:40", fin: "11:30", academico: true },
      { periodo: "LUNCH", inicio: "11:30", fin: "12:10", academico: false },
    ],
  },
  "Middle School": {
    monThu: [
      { periodo: "1", inicio: "07:10", fin: "08:00", academico: true },
      { periodo: "2", inicio: "08:00", fin: "08:50", academico: true },
      { periodo: "BREAK", inicio: "08:50", fin: "09:10", academico: false },
      { periodo: "3", inicio: "09:10", fin: "10:00", academico: true },
      { periodo: "4", inicio: "10:00", fin: "10:50", academico: true },
      { periodo: "5", inicio: "10:50", fin: "11:40", academico: true },
      { periodo: "LUNCH", inicio: "11:40", fin: "12:20", academico: false },
      { periodo: "6", inicio: "12:20", fin: "13:10", academico: true },
      { periodo: "7", inicio: "13:10", fin: "14:00", academico: true },
    ],
    friday: [
      { periodo: "1", inicio: "07:10", fin: "08:00", academico: true },
      { periodo: "2", inicio: "08:00", fin: "08:50", academico: true },
      { periodo: "BREAK", inicio: "08:50", fin: "09:10", academico: false },
      { periodo: "3", inicio: "09:10", fin: "10:00", academico: true },
      { periodo: "4", inicio: "10:00", fin: "10:50", academico: true },
      { periodo: "5", inicio: "10:50", fin: "11:40", academico: true },
      { periodo: "LUNCH", inicio: "11:40", fin: "12:20", academico: false },
    ],
  },
  Diploma: {
    monThu: [
      { periodo: "1", inicio: "08:00", fin: "08:50", academico: true },
      { periodo: "2", inicio: "08:50", fin: "09:40", academico: true },
      { periodo: "BREAK", inicio: "09:40", fin: "09:55", academico: false },
      { periodo: "3", inicio: "09:55", fin: "10:45", academico: true },
      { periodo: "4", inicio: "10:45", fin: "11:35", academico: true },
      { periodo: "5", inicio: "11:35", fin: "12:25", academico: true },
      { periodo: "LUNCH", inicio: "12:25", fin: "13:05", academico: false },
      { periodo: "6", inicio: "13:05", fin: "13:55", academico: true },
      { periodo: "7", inicio: "13:55", fin: "14:45", academico: true },
    ],
    friday: [
      { periodo: "1", inicio: "08:00", fin: "08:50", academico: true },
      { periodo: "2", inicio: "08:50", fin: "09:40", academico: true },
      { periodo: "BREAK", inicio: "09:40", fin: "09:55", academico: false },
      { periodo: "3", inicio: "09:55", fin: "10:45", academico: true },
      { periodo: "4", inicio: "10:45", fin: "11:35", academico: true },
      { periodo: "5", inicio: "11:35", fin: "12:25", academico: true },
      { periodo: "LUNCH", inicio: "12:25", fin: "13:05", academico: false },
    ],
  },
};

type SeccionNombre = keyof typeof HORARIOS;

async function main() {
  console.log("Limpiando base de datos...");
  await prisma.horarioAsignado.deleteMany();
  await prisma.colaborativaGenerada.deleteMany();
  await prisma.deporteSeccion.deleteMany();
  await prisma.reunionSeccion.deleteMany();
  await prisma.cargaAcademica.deleteMany();
  await prisma.bloqueHorario.deleteMany();
  await prisma.curso.deleteMany();
  await prisma.materia.deleteMany();
  await prisma.departamento.deleteMany();
  await prisma.profesor.deleteMany();
  await prisma.seccion.deleteMany();
  await prisma.diaSemana.deleteMany();
  await prisma.user.deleteMany();

  console.log("Creando admin...");
  await prisma.user.create({
    data: {
      email: "admin@colegio.local",
      passwordHash: await bcrypt.hash("admin123", 10),
      nombre: "Administrador",
      rol: "directivo",
    },
  });

  console.log("Creando días de la semana...");
  const dias = [];
  for (let n = 1; n <= 5; n++) {
    dias[n] = await prisma.diaSemana.create({
      data: { numeroDia: n, esHorarioEspecial: n === 5 },
    });
  }

  console.log("Creando secciones y bloques horarios...");
  const secciones: Record<SeccionNombre, number> = {} as never;
  for (const [nombre, cfg] of Object.entries(HORARIOS) as [SeccionNombre, (typeof HORARIOS)[SeccionNombre]][]) {
    const sec = await prisma.seccion.create({ data: { nombre } });
    secciones[nombre] = sec.id;
    for (let d = 1; d <= 5; d++) {
      const lista = d === 5 ? cfg.friday : cfg.monThu;
      for (const b of lista) {
        await prisma.bloqueHorario.create({
          data: {
            seccionId: sec.id,
            diaSemanaId: dias[d].id,
            numeroPeriodo: b.periodo,
            horaInicio: b.inicio,
            horaFin: b.fin,
            esAcademico: b.academico,
          },
        });
      }
    }
  }

  console.log("Creando materias...");
  const materias: Record<string, number> = {};
  const nombresMaterias = [
    "Matemáticas", "Lenguaje", "Inglés", "Ciencias Naturales", "Historia",
    "Artes", "Educación Física", "Música", "Programación", "Física",
    "Biología", "Química", "Filosofía",
  ];
  for (const nombre of nombresMaterias) {
    const m = await prisma.materia.create({ data: { nombre } });
    materias[nombre] = m.id;
  }

  console.log("Creando departamentos...");
  const departamentos: Record<string, number> = {};
  const materiasPorDepartamento: Record<string, string[]> = {
    "Ciencia": ["Ciencias Naturales", "Física", "Biología", "Química"],
    "Matemáticas": ["Matemáticas"],
    "Lenguaje": ["Lenguaje"],
    "Idiomas": ["Inglés"],
    "Humanidades": ["Historia", "Filosofía"],
    "Artes": ["Artes", "Música"],
    "Tecnología": ["Programación"],
    "Ed. Física": ["Educación Física"],
  };
  for (const [nombre, lista] of Object.entries(materiasPorDepartamento)) {
    const d = await prisma.departamento.create({
      data: { nombre, materias: { connect: lista.map((m) => ({ id: materias[m] })) } },
    });
    departamentos[nombre] = d.id;
  }

  console.log("Creando profesores...");
  const profesores: Record<string, number> = {};
  const listaProfesores = [
    { nombre: "María López", email: "maria.lopez@colegio.local", maxHorasSemana: 30, seccionBaseId: secciones.Primaria },
    { nombre: "Juan Pérez", email: "juan.perez@colegio.local", maxHorasSemana: 30, seccionBaseId: secciones.Primaria },
    { nombre: "Ana Rodríguez", email: "ana.rodriguez@colegio.local", maxHorasSemana: 28, seccionBaseId: secciones["Middle School"] },
    { nombre: "Carlos Gómez", email: "carlos.gomez@colegio.local", maxHorasSemana: 30, seccionBaseId: secciones["Middle School"] },
    { nombre: "Lucía Fernández", email: "lucia.fernandez@colegio.local", maxHorasSemana: 25, seccionBaseId: secciones.Preescolar },
    { nombre: "Pedro Sánchez", email: "pedro.sanchez@colegio.local", maxHorasSemana: 26, seccionBaseId: secciones.Primaria },
    { nombre: "Elena Ruiz", email: "elena.ruiz@colegio.local", maxHorasSemana: 25, seccionBaseId: secciones.Preescolar },
    { nombre: "Jorge Morales", email: "jorge.morales@colegio.local", maxHorasSemana: 28, seccionBaseId: secciones["Middle School"] },
    { nombre: "Sofía Torres", email: "sofia.torres@colegio.local", maxHorasSemana: 24, seccionBaseId: secciones.Diploma },
  ];
  for (const p of listaProfesores) {
    const prof = await prisma.profesor.create({ data: p });
    profesores[p.nombre] = prof.id;
  }

  console.log("Creando cursos...");
  const cursos: Record<string, number> = {};
  const listaCursos: Record<SeccionNombre, string[]> = {
    Preescolar: ["Prekínder A", "Kínder B"],
    Primaria: ["1A", "2A", "5A", "5B"],
    "Middle School": ["7A", "8A", "9A"],
    Diploma: ["10A", "10B", "11A"],
  };
  for (const [seccion, nombres] of Object.entries(listaCursos) as [SeccionNombre, string[]][]) {
    for (const nombre of nombres) {
      const c = await prisma.curso.create({
        data: { seccionId: secciones[seccion], nombre },
      });
      cursos[`${seccion}::${nombre}`] = c.id;
    }
  }

  const M = materias;
  const P = profesores;

  type Carga = { seccion: SeccionNombre; curso: string; materia: string; profesor: string; bloques: number };
  const cargas: Carga[] = [
    // Preescolar
    { seccion: "Preescolar", curso: "Prekínder A", materia: "Matemáticas", profesor: "Lucía Fernández", bloques: 4 },
    { seccion: "Preescolar", curso: "Prekínder A", materia: "Lenguaje", profesor: "Elena Ruiz", bloques: 4 },
    { seccion: "Preescolar", curso: "Prekínder A", materia: "Inglés", profesor: "Lucía Fernández", bloques: 2 },
    { seccion: "Preescolar", curso: "Prekínder A", materia: "Artes", profesor: "Elena Ruiz", bloques: 3 },
    { seccion: "Preescolar", curso: "Kínder B", materia: "Matemáticas", profesor: "Lucía Fernández", bloques: 4 },
    { seccion: "Preescolar", curso: "Kínder B", materia: "Lenguaje", profesor: "Elena Ruiz", bloques: 4 },
    { seccion: "Preescolar", curso: "Kínder B", materia: "Inglés", profesor: "Lucía Fernández", bloques: 2 },
    { seccion: "Preescolar", curso: "Kínder B", materia: "Música", profesor: "Elena Ruiz", bloques: 2 },
    // Primaria
    { seccion: "Primaria", curso: "5A", materia: "Matemáticas", profesor: "Juan Pérez", bloques: 6 },
    { seccion: "Primaria", curso: "5A", materia: "Lenguaje", profesor: "María López", bloques: 5 },
    { seccion: "Primaria", curso: "5A", materia: "Ciencias Naturales", profesor: "Pedro Sánchez", bloques: 4 },
    { seccion: "Primaria", curso: "5A", materia: "Inglés", profesor: "Ana Rodríguez", bloques: 3 },
    { seccion: "Primaria", curso: "5A", materia: "Historia", profesor: "Juan Pérez", bloques: 3 },
    { seccion: "Primaria", curso: "5A", materia: "Artes", profesor: "Elena Ruiz", bloques: 2 },
    { seccion: "Primaria", curso: "5A", materia: "Educación Física", profesor: "Pedro Sánchez", bloques: 2 },
    { seccion: "Primaria", curso: "5B", materia: "Matemáticas", profesor: "Juan Pérez", bloques: 6 },
    { seccion: "Primaria", curso: "5B", materia: "Lenguaje", profesor: "María López", bloques: 5 },
    { seccion: "Primaria", curso: "5B", materia: "Ciencias Naturales", profesor: "Pedro Sánchez", bloques: 4 },
    { seccion: "Primaria", curso: "5B", materia: "Inglés", profesor: "Ana Rodríguez", bloques: 3 },
    { seccion: "Primaria", curso: "5B", materia: "Artes", profesor: "Elena Ruiz", bloques: 2 },
    { seccion: "Primaria", curso: "5B", materia: "Educación Física", profesor: "Pedro Sánchez", bloques: 2 },
    // Middle School
    { seccion: "Middle School", curso: "8A", materia: "Matemáticas", profesor: "Carlos Gómez", bloques: 6 },
    { seccion: "Middle School", curso: "8A", materia: "Lenguaje", profesor: "Ana Rodríguez", bloques: 5 },
    { seccion: "Middle School", curso: "8A", materia: "Ciencias Naturales", profesor: "Jorge Morales", bloques: 5 },
    { seccion: "Middle School", curso: "8A", materia: "Historia", profesor: "Carlos Gómez", bloques: 3 },
    { seccion: "Middle School", curso: "8A", materia: "Inglés", profesor: "María López", bloques: 4 },
    { seccion: "Middle School", curso: "8A", materia: "Programación", profesor: "Jorge Morales", bloques: 2 },
    { seccion: "Middle School", curso: "8A", materia: "Educación Física", profesor: "Pedro Sánchez", bloques: 3 },
    // Diploma
    { seccion: "Diploma", curso: "10B", materia: "Matemáticas", profesor: "Carlos Gómez", bloques: 6 },
    { seccion: "Diploma", curso: "10B", materia: "Física", profesor: "Carlos Gómez", bloques: 4 },
    { seccion: "Diploma", curso: "10B", materia: "Lenguaje", profesor: "Ana Rodríguez", bloques: 5 },
    { seccion: "Diploma", curso: "10B", materia: "Inglés", profesor: "Sofía Torres", bloques: 4 },
    { seccion: "Diploma", curso: "10B", materia: "Historia", profesor: "Sofía Torres", bloques: 3 },
    { seccion: "Diploma", curso: "10B", materia: "Biología", profesor: "Jorge Morales", bloques: 4 },
  ];

  console.log("Creando cargas académicas...");
  for (const c of cargas) {
    await prisma.cargaAcademica.create({
      data: {
        cursoId: cursos[`${c.seccion}::${c.curso}`],
        materiaId: M[c.materia],
        profesorId: P[c.profesor],
        bloquesSemanalesRequeridos: c.bloques,
      },
    });
  }

  console.log("Creando días de deportes...");
  const deportes: { seccion: SeccionNombre; dia: number; periodo: string }[] = [
    { seccion: "Primaria", dia: 2, periodo: "6" },
    { seccion: "Primaria", dia: 4, periodo: "6" },
    { seccion: "Middle School", dia: 1, periodo: "7" },
    { seccion: "Middle School", dia: 3, periodo: "7" },
    { seccion: "Diploma", dia: 1, periodo: "7" },
    { seccion: "Diploma", dia: 3, periodo: "7" },
  ];
  for (const d of deportes) {
    await prisma.deporteSeccion.create({
      data: { seccionId: secciones[d.seccion], diaSemanaId: dias[d.dia].id, numeroPeriodo: d.periodo },
    });
  }

  console.log("Creando reuniones de sección...");
  // Preescolar jueves último bloque (09:50-10:30) | Primaria martes último bloque (12:10-13:00)
  // Middle + Diploma miércoles (13:10-14:00, referencia último bloque de Middle)
  const reuniones: { dia: number; inicio: string; fin: string; secciones: SeccionNombre[] }[] = [
    { dia: 4, inicio: "09:50", fin: "10:30", secciones: ["Preescolar"] },
    { dia: 2, inicio: "12:10", fin: "13:00", secciones: ["Primaria"] },
    { dia: 3, inicio: "13:10", fin: "14:00", secciones: ["Middle School", "Diploma"] },
  ];
  for (const r of reuniones) {
    await prisma.reunionSeccion.create({
      data: {
        diaSemanaId: dias[r.dia].id,
        horaInicio: r.inicio,
        horaFin: r.fin,
        secciones: { connect: r.secciones.map((s) => ({ id: secciones[s] })) },
      },
    });
  }

  const stats = {
    usuarios: await prisma.user.count(),
    secciones: await prisma.seccion.count(),
    dias: await prisma.diaSemana.count(),
    bloques: await prisma.bloqueHorario.count(),
    materias: await prisma.materia.count(),
    departamentos: await prisma.departamento.count(),
    profesores: await prisma.profesor.count(),
    cursos: await prisma.curso.count(),
    cargas: await prisma.cargaAcademica.count(),
    deportes: await prisma.deporteSeccion.count(),
    reunionesSeccion: await prisma.reunionSeccion.count(),
  };
  console.log("Seed completado:", stats);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });