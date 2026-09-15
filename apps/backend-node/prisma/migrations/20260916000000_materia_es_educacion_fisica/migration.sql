-- AlterTable: marca la educación física para las reglas del solver (P.E no coincide
-- con días de deportes; grados 6 ven P.E el mismo día).
ALTER TABLE "Materia" ADD COLUMN "esEducacionFisica" BOOLEAN NOT NULL DEFAULT false;

-- Asigna el flag a las materias de educación física (por nombre, no por id fijo).
UPDATE "Materia" SET "esEducacionFisica" = true WHERE "nombre" IN ('P.E', 'Educación Física');