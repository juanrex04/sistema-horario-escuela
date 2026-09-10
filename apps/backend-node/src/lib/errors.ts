import { Prisma } from "@prisma/client";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const FK_MESSAGES: Record<string, string> = {
  CargaAcademica_profesorId_fkey: "El profesor tiene cargas académicas asociadas. Transfiere o elimina esas cargas primero.",
  CargaAcademica_cursoId_fkey: "El curso tiene cargas académicas asociadas. Elimínalas primero.",
  CargaAcademica_materiaId_fkey: "La materia tiene cargas académicas asociadas. Elimínalas primero.",
  BloqueHorario_horarioAsignado_bloqueHorarioId_fkey:
    "El bloque tiene asignaciones en el horario generado. Regenera o limpia el horario primero.",
};

/** Convierte errores conocidos de Prisma en HttpError con mensaje legible. */
export function mapPrismaError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        return new HttpError(409, "Ya existe un registro con esos datos.");
      case "P2025":
        return new HttpError(404, "El registro solicitado no existe.");
      case "P2003": {
        const meta = (err.meta ?? {}) as { field_name?: string };
        const msg = meta.field_name ? FK_MESSAGES[meta.field_name] ?? undefined : undefined;
        return new HttpError(409, msg ?? "El registro tiene datos relacionados y no puede eliminarse.");
      }
      default:
        return new HttpError(500, `Error de base de datos (${err.code}).`);
    }
  }
  return new HttpError(500, err instanceof Error ? err.message : "Error interno del servidor.");
}