-- CreateTable
CREATE TABLE "MateriaMismoBloque" (
    "id" SERIAL NOT NULL,
    "materiaAId" INTEGER NOT NULL,
    "materiaBId" INTEGER NOT NULL,

    CONSTRAINT "MateriaMismoBloque_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MateriaMismoBloque_materiaAId_materiaBId_key" ON "MateriaMismoBloque"("materiaAId", "materiaBId");

-- AddForeignKey
ALTER TABLE "MateriaMismoBloque" ADD CONSTRAINT "MateriaMismoBloque_materiaAId_fkey" FOREIGN KEY ("materiaAId") REFERENCES "Materia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MateriaMismoBloque" ADD CONSTRAINT "MateriaMismoBloque_materiaBId_fkey" FOREIGN KEY ("materiaBId") REFERENCES "Materia"("id") ON DELETE CASCADE ON UPDATE CASCADE;