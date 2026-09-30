-- Regla B de P.E.: las cargas de educación física de un docente pueden agruparse en
-- pares de grupos del mismo grado que deben verse el mismo día. Es opt-in por docente.
ALTER TABLE "Profesor" ADD COLUMN "peParesMismoDia" BOOLEAN NOT NULL DEFAULT false;

-- Activa la regla en el docente que hoy tiene P.E. en Primaria, para no alterar el
-- horario vigente. Se identifica por nombre y no por id fijo, igual que el backfill de
-- "Materia"."esEducacionFisica" de la migración 20260916000000.
UPDATE "Profesor" SET "peParesMismoDia" = true WHERE "nombre" = 'Ricardo Alvarez';
