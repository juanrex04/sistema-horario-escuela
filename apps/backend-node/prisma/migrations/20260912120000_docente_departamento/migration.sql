-- AlterTable
ALTER TABLE "Profesor" DROP COLUMN "email";
ALTER TABLE "Profesor" DROP COLUMN "maxHorasSemana";
ALTER TABLE "Profesor" ADD COLUMN "departamentoId" INTEGER;

-- AddForeignKey
ALTER TABLE "Profesor" ADD CONSTRAINT "Profesor_departamentoId_fkey" FOREIGN KEY ("departamentoId") REFERENCES "Departamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;