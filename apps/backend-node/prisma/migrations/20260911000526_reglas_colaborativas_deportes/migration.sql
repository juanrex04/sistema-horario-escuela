-- AlterTable
ALTER TABLE "Materia" ADD COLUMN     "departamentoId" INTEGER;

-- CreateTable
CREATE TABLE "Departamento" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "reunionActiva" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Departamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReunionSeccion" (
    "id" SERIAL NOT NULL,
    "diaSemanaId" INTEGER NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,

    CONSTRAINT "ReunionSeccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeporteSeccion" (
    "id" SERIAL NOT NULL,
    "seccionId" INTEGER NOT NULL,
    "diaSemanaId" INTEGER NOT NULL,
    "numeroPeriodo" TEXT NOT NULL,

    CONSTRAINT "DeporteSeccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColaborativaGenerada" (
    "id" SERIAL NOT NULL,
    "departamentoId" INTEGER NOT NULL,
    "diaSemanaId" INTEGER NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,

    CONSTRAINT "ColaborativaGenerada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ReunionSeccionSeccion" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_ReunionSeccionSeccion_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Departamento_nombre_key" ON "Departamento"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "DeporteSeccion_seccionId_diaSemanaId_numeroPeriodo_key" ON "DeporteSeccion"("seccionId", "diaSemanaId", "numeroPeriodo");

-- CreateIndex
CREATE INDEX "_ReunionSeccionSeccion_B_index" ON "_ReunionSeccionSeccion"("B");

-- AddForeignKey
ALTER TABLE "Materia" ADD CONSTRAINT "Materia_departamentoId_fkey" FOREIGN KEY ("departamentoId") REFERENCES "Departamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReunionSeccion" ADD CONSTRAINT "ReunionSeccion_diaSemanaId_fkey" FOREIGN KEY ("diaSemanaId") REFERENCES "DiaSemana"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeporteSeccion" ADD CONSTRAINT "DeporteSeccion_seccionId_fkey" FOREIGN KEY ("seccionId") REFERENCES "Seccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeporteSeccion" ADD CONSTRAINT "DeporteSeccion_diaSemanaId_fkey" FOREIGN KEY ("diaSemanaId") REFERENCES "DiaSemana"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ColaborativaGenerada" ADD CONSTRAINT "ColaborativaGenerada_departamentoId_fkey" FOREIGN KEY ("departamentoId") REFERENCES "Departamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ColaborativaGenerada" ADD CONSTRAINT "ColaborativaGenerada_diaSemanaId_fkey" FOREIGN KEY ("diaSemanaId") REFERENCES "DiaSemana"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ReunionSeccionSeccion" ADD CONSTRAINT "_ReunionSeccionSeccion_A_fkey" FOREIGN KEY ("A") REFERENCES "ReunionSeccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ReunionSeccionSeccion" ADD CONSTRAINT "_ReunionSeccionSeccion_B_fkey" FOREIGN KEY ("B") REFERENCES "Seccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
