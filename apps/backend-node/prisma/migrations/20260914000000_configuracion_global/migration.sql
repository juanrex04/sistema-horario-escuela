-- CreateTable
CREATE TABLE "Configuracion" (
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,

    CONSTRAINT "Configuracion_pkey" PRIMARY KEY ("clave")
);

-- Seed ajuste global: cantidad de bloques consecutivos de la reunión de departamento
INSERT INTO "Configuracion" ("clave", "valor") VALUES ('bloquesColaborativa', '2')
ON CONFLICT ("clave") DO NOTHING;