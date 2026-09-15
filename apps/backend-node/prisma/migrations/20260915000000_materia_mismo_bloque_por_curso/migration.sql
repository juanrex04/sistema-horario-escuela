-- AlterTable: los pares de materias del mismo bloque pueden acotarse a un grado (curso).
ALTER TABLE "MateriaMismoBloque" ADD COLUMN "cursoId" INTEGER;

-- DropIndex
DROP INDEX "MateriaMismoBloque_materiaAId_materiaBId_key";

-- CreateIndex: unique por (par, curso). NULL permite varios pares globales (dedup en código).
CREATE UNIQUE INDEX "MateriaMismoBloque_materiaAId_materiaBId_cursoId_key" ON "MateriaMismoBloque"("materiaAId", "materiaBId", "cursoId");

-- AddForeignKey
ALTER TABLE "MateriaMismoBloque" ADD CONSTRAINT "MateriaMismoBloque_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE CASCADE ON UPDATE CASCADE;