export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
export type Seccion = { id: number; nombre: string; _count?: { cursos: number; bloques: number; profesoresAdscritos: number } };
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
  seccionBaseId: number;
  seccionBase?: Seccion;
  departamentoId: number | null;
  departamento?: Departamento | null;
  prefiereGruposConsecutivos?: boolean;
  _count?: { cargas: number };
};
export type Curso = { id: number; seccionId: number; nombre: string; seccion?: Seccion; _count?: { cargas: number } };
export type Departamento = {
  id: number;
  nombre: string;
  reunionActiva: boolean;
  materias?: { id: number; nombre: string }[];
  _count?: { materias: number; colaborativas: number };
};
export type Materia = {
  id: number;
  nombre: string;
  departamentoId: number | null;
  departamento?: Departamento | null;
  _count?: { cargas: number };
};
export type ReunionSeccion = {
  id: number;
  diaSemanaId: number;
  horaInicio: string;
  horaFin: string;
  secciones: { id: number; nombre: string }[];
};
export type DeporteSeccion = {
  id: number;
  seccionId: number;
  diaSemanaId: number;
  numeroPeriodo: string;
  seccion?: Seccion;
  diaSemana?: DiaSemana;
};
export type Reglas = { reunionesSeccion: ReunionSeccion[]; deportes: DeporteSeccion[] };
export type ColaborativaGenerada = {
  id: number;
  departamentoId: number;
  departamento: { id: number; nombre: string };
  diaSemanaId: number;
  diaSemana: DiaSemana;
  horaInicio: string;
  horaFin: string;
};
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
  colaborativas?: { departamentoId: number; diaSemanaId: number; horaInicio: number; horaFin: number }[];
  numConsecutivos?: number;
};