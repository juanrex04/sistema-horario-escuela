-- AlterTable
ALTER TABLE "Profesor" ADD COLUMN "esTiempoCompleto" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Profesor" ADD COLUMN "jornadaParcial" JSONB;