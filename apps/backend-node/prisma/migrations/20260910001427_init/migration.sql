-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" TEXT NOT NULL DEFAULT 'directivo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seccion" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Seccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiaSemana" (
    "id" SERIAL NOT NULL,
    "numeroDia" INTEGER NOT NULL,
    "esHorarioEspecial" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DiaSemana_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BloqueHorario" (
    "id" SERIAL NOT NULL,
    "seccionId" INTEGER NOT NULL,
    "diaSemanaId" INTEGER NOT NULL,
    "numeroPeriodo" TEXT NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,
    "esAcademico" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BloqueHorario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profesor" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "maxHorasSemana" INTEGER,

    CONSTRAINT "Profesor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Curso" (
    "id" SERIAL NOT NULL,
    "seccionId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Curso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Materia" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Materia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargaAcademica" (
    "id" SERIAL NOT NULL,
    "cursoId" INTEGER NOT NULL,
    "materiaId" INTEGER NOT NULL,
    "profesorId" INTEGER NOT NULL,
    "bloquesSemanalesRequeridos" INTEGER NOT NULL,

    CONSTRAINT "CargaAcademica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorarioAsignado" (
    "id" SERIAL NOT NULL,
    "cargaAcademicaId" INTEGER NOT NULL,
    "bloqueHorarioId" INTEGER NOT NULL,

    CONSTRAINT "HorarioAsignado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Seccion_nombre_key" ON "Seccion"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "DiaSemana_numeroDia_key" ON "DiaSemana"("numeroDia");

-- CreateIndex
CREATE UNIQUE INDEX "BloqueHorario_seccionId_diaSemanaId_numeroPeriodo_key" ON "BloqueHorario"("seccionId", "diaSemanaId", "numeroPeriodo");

-- CreateIndex
CREATE UNIQUE INDEX "Profesor_email_key" ON "Profesor"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Curso_seccionId_nombre_key" ON "Curso"("seccionId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Materia_nombre_key" ON "Materia"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "CargaAcademica_cursoId_materiaId_profesorId_key" ON "CargaAcademica"("cursoId", "materiaId", "profesorId");

-- CreateIndex
CREATE UNIQUE INDEX "HorarioAsignado_cargaAcademicaId_bloqueHorarioId_key" ON "HorarioAsignado"("cargaAcademicaId", "bloqueHorarioId");

-- AddForeignKey
ALTER TABLE "BloqueHorario" ADD CONSTRAINT "BloqueHorario_seccionId_fkey" FOREIGN KEY ("seccionId") REFERENCES "Seccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueHorario" ADD CONSTRAINT "BloqueHorario_diaSemanaId_fkey" FOREIGN KEY ("diaSemanaId") REFERENCES "DiaSemana"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Curso" ADD CONSTRAINT "Curso_seccionId_fkey" FOREIGN KEY ("seccionId") REFERENCES "Seccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargaAcademica" ADD CONSTRAINT "CargaAcademica_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargaAcademica" ADD CONSTRAINT "CargaAcademica_materiaId_fkey" FOREIGN KEY ("materiaId") REFERENCES "Materia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargaAcademica" ADD CONSTRAINT "CargaAcademica_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Profesor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioAsignado" ADD CONSTRAINT "HorarioAsignado_cargaAcademicaId_fkey" FOREIGN KEY ("cargaAcademicaId") REFERENCES "CargaAcademica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioAsignado" ADD CONSTRAINT "HorarioAsignado_bloqueHorarioId_fkey" FOREIGN KEY ("bloqueHorarioId") REFERENCES "BloqueHorario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
