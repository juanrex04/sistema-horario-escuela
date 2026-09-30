-- Bloques fijos por carga: permite anclar una carga académica a bloques concretos
-- (p. ej. una P.E. que debe dictarse siempre en un período) en lugar de dejar que
-- el solver elija libremente.

-- CreateTable
CREATE TABLE "CargaBloqueFijo" (
    "id" SERIAL NOT NULL,
    "cargaAcademicaId" INTEGER NOT NULL,
    "bloqueHorarioId" INTEGER NOT NULL,

    CONSTRAINT "CargaBloqueFijo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CargaBloqueFijo_cargaAcademicaId_bloqueHorarioId_key" ON "CargaBloqueFijo"("cargaAcademicaId", "bloqueHorarioId");

-- CreateIndex
CREATE INDEX "CargaBloqueFijo_cargaAcademicaId_idx" ON "CargaBloqueFijo"("cargaAcademicaId");

-- AddForeignKey
ALTER TABLE "CargaBloqueFijo" ADD CONSTRAINT "CargaBloqueFijo_cargaAcademicaId_fkey" FOREIGN KEY ("cargaAcademicaId") REFERENCES "CargaAcademica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargaBloqueFijo" ADD CONSTRAINT "CargaBloqueFijo_bloqueHorarioId_fkey" FOREIGN KEY ("bloqueHorarioId") REFERENCES "BloqueHorario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
