-- Catálogo de espacios físicos (salas, laboratorios, etc.) y vínculos con materias.
-- Permite restringir la asignación de espacio a una sección específica (seccionId
-- nulo = global).

CREATE TABLE "Espacio" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Espacio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Espacio_nombre_key" ON "Espacio"("nombre");
CREATE INDEX "Espacio_nombre_idx" ON "Espacio"("nombre");

CREATE TABLE "MateriaEspacio" (
    "id" SERIAL NOT NULL,
    "materiaId" INTEGER NOT NULL,
    "espacioId" INTEGER NOT NULL,
    "seccionId" INTEGER,

    CONSTRAINT "MateriaEspacio_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MateriaEspacio_materiaId_idx" ON "MateriaEspacio"("materiaId");
CREATE INDEX "MateriaEspacio_espacioId_idx" ON "MateriaEspacio"("espacioId");
CREATE INDEX "MateriaEspacio_seccionId_idx" ON "MateriaEspacio"("seccionId");

ALTER TABLE "MateriaEspacio" ADD CONSTRAINT "MateriaEspacio_materiaId_fkey" FOREIGN KEY ("materiaId") REFERENCES "Materia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MateriaEspacio" ADD CONSTRAINT "MateriaEspacio_espacioId_fkey" FOREIGN KEY ("espacioId") REFERENCES "Espacio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MateriaEspacio" ADD CONSTRAINT "MateriaEspacio_seccionId_fkey" FOREIGN KEY ("seccionId") REFERENCES "Seccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
