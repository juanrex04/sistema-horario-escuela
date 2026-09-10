export type Seccion = { id: number; nombre: string; _count?: { cursos: number; bloques: number } };
export type DiaSemana = { id: number; numeroDia: number; esHorarioEspecial: boolean };
export type BloqueHorario = {
  id: number;
  seccionId: number;
  diaSemanaId: number;
  numeroPeriodo: string;
  horaInicio: string;
  horaFin: string;
  esAcademico: boolean;
  seccion?: Seccion;
  diaSemana?: DiaSemana;
  _count?: { asignaciones: number };
};
export type Profesor = {
  id: number;
  nombre: string;
  email: string | null;
  maxHorasSemana: number | null;
  _count?: { cargas: number };
};
export type Curso = { id: number; seccionId: number; nombre: string; seccion?: Seccion; _count?: { cargas: number } };
export type Materia = { id: number; nombre: string; _count?: { cargas: number } };
export type CargaAcademica = {
  id: number;
  cursoId: number;
  materiaId: number;
  profesorId: number;
  bloquesSemanalesRequeridos: number;
  curso?: Curso & { seccion?: Seccion };
  materia?: Materia;
  profesor?: Profesor;
  asignaciones?: { id: number }[];
};
export type HorarioAsignado = {
  id: number;
  cargaAcademicaId: number;
  bloqueHorarioId: number;
  bloqueHorario: BloqueHorario & { seccion: Seccion; diaSemana: DiaSemana };
  cargaAcademica: CargaAcademica & {
    curso: Curso & { seccion: Seccion };
    materia: Materia;
    profesor: Profesor;
  };
};
export type GenerateResult = {
  status: string;
  numAsignaciones: number;
  asignaciones: { cargaAcademicaId: number; bloqueHorarioId: number }[];
};