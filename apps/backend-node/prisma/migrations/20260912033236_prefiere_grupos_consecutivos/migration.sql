-- DropIndex
DROP INDEX "Profesor_seccionBaseId_idx";

-- AlterTable
ALTER TABLE "Profesor" ADD COLUMN     "prefiereGruposConsecutivos" BOOLEAN NOT NULL DEFAULT false;
