-- AlterTable
ALTER TABLE "Profesor" ADD COLUMN     "seccionBaseId" INTEGER;

-- Backfill: sección de la primera carga académica de cada profesor
UPDATE "Profesor" SET "seccionBaseId" = (
    SELECT "Curso"."seccionId"
    FROM "CargaAcademica"
    JOIN "Curso" ON "Curso"."id" = "CargaAcademica"."cursoId"
    WHERE "CargaAcademica"."profesorId" = "Profesor"."id"
    ORDER BY "CargaAcademica"."id" ASC
    LIMIT 1
);

-- Fallback para profesores sin cargas: sección de menor id
UPDATE "Profesor" SET "seccionBaseId" = (SELECT MIN("id") FROM "Seccion") WHERE "seccionBaseId" IS NULL;

-- AlterTable
ALTER TABLE "Profesor" ALTER COLUMN "seccionBaseId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Profesor_seccionBaseId_idx" ON "Profesor"("seccionBaseId");

-- AddForeignKey
ALTER TABLE "Profesor" ADD CONSTRAINT "Profesor_seccionBaseId_fkey" FOREIGN KEY ("seccionBaseId") REFERENCES "Seccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;