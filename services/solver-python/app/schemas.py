from pydantic import BaseModel, Field


class Dia(BaseModel):
    id: int
    numero_dia: int = Field(alias="numeroDia")
    es_horario_especial: bool = Field(alias="esHorarioEspecial")

    model_config = {"populate_by_name": True}


class Seccion(BaseModel):
    id: int
    nombre: str


class Bloque(BaseModel):
    id: int
    seccion_id: int = Field(alias="seccionId")
    dia_semana_id: int = Field(alias="diaSemanaId")
    numero_periodo: str = Field(alias="numeroPeriodo")
    inicio_min: int = Field(alias="inicioMin")
    fin_min: int = Field(alias="finMin")
    es_academico: bool = Field(alias="esAcademico")

    model_config = {"populate_by_name": True}


class JornadaDia(BaseModel):
    dia_semana_id: int = Field(alias="diaSemanaId")
    hora_fin: int = Field(alias="horaFin")

    model_config = {"populate_by_name": True}


class Profesor(BaseModel):
    id: int
    nombre: str
    seccion_base_id: int = Field(alias="seccionBaseId")
    departamento_id: int | None = Field(default=None, alias="departamentoId")
    prefiere_grupos_consecutivos: bool = Field(
        default=False, alias="prefiereGruposConsecutivos"
    )
    es_tiempo_completo: bool = Field(default=True, alias="esTiempoCompleto")
    jornada: list[JornadaDia] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class Curso(BaseModel):
    id: int
    nombre: str
    seccion_id: int = Field(alias="seccionId")

    model_config = {"populate_by_name": True}


class Materia(BaseModel):
    id: int
    nombre: str
    es_educacion_fisica: bool = Field(default=False, alias="esEducacionFisica")

    model_config = {"populate_by_name": True}


class Carga(BaseModel):
    id: int
    curso_id: int = Field(alias="cursoId")
    materia_id: int = Field(alias="materiaId")
    profesor_id: int = Field(alias="profesorId")
    bloques_semanales_requeridos: int = Field(alias="bloquesSemanalesRequeridos")

    model_config = {"populate_by_name": True}


class ReunionSeccion(BaseModel):
    dia_semana_id: int = Field(alias="diaSemanaId")
    hora_inicio: int = Field(alias="horaInicio")
    hora_fin: int = Field(alias="horaFin")
    seccion_ids: list[int] = Field(alias="seccionIds")


class Deporte(BaseModel):
    seccion_id: int = Field(alias="seccionId")
    dia_semana_id: int = Field(alias="diaSemanaId")
    numero_periodo: str = Field(alias="numeroPeriodo")


class ColaborativaEntrada(BaseModel):
    departamento_id: int = Field(alias="departamentoId")
    materia_ids: list[int] = Field(alias="materiaIds")


class MateriaMismoBloque(BaseModel):
    materia_a_id: int = Field(alias="materiaAId")
    materia_b_id: int = Field(alias="materiaBId")
    curso_id: int | None = Field(default=None, alias="cursoId")

    model_config = {"populate_by_name": True}


class DiasSinPEPorSeccion(BaseModel):
    seccion_id: int = Field(alias="seccionId")
    dia_semana_ids: list[int] = Field(alias="diaSemanaIds")


class ParPEMismoDia(BaseModel):
    carga_a_id: int = Field(alias="cargaAId")
    carga_b_id: int = Field(alias="cargaBId")

    model_config = {"populate_by_name": True}


class Espacio(BaseModel):
    id: int
    nombre: str


class MateriaEspacioEntrada(BaseModel):
    materia_id: int = Field(alias="materiaId")
    espacio_id: int = Field(alias="espacioId")
    seccion_id: int | None = Field(default=None, alias="seccionId")

    model_config = {"populate_by_name": True}


class SolveRequest(BaseModel):
    secciones: list[Seccion] = []
    dias: list[Dia] = []
    bloques: list[Bloque] = []
    profesores: list[Profesor] = []
    cursos: list[Curso] = []
    materias: list[Materia] = []
    cargas: list[Carga] = []
    reuniones_seccion: list[ReunionSeccion] = Field(default_factory=list, alias="reunionesSeccion")
    deportes: list[Deporte] = Field(default_factory=list)
    colaborativas: list[ColaborativaEntrada] = Field(default_factory=list)
    materias_mismo_bloque: list[MateriaMismoBloque] = Field(
        default_factory=list, alias="materiasMismoBloque"
    )
    dias_sin_pe_por_seccion: list[DiasSinPEPorSeccion] = Field(
        default_factory=list, alias="diasSinPEPorSeccion"
    )
    pares_pe_mismo_dia: list[ParPEMismoDia] = Field(
        default_factory=list, alias="paresPEMismoDia"
    )
    espacios: list[Espacio] = Field(default_factory=list)
    materias_espacios: list[MateriaEspacioEntrada] = Field(
        default_factory=list, alias="materiasEspacios"
    )
    bloques_colaborativa: int = Field(default=2, alias="bloquesColaborativa")


class Asignacion(BaseModel):
    carga_academica_id: int = Field(alias="cargaAcademicaId")
    bloque_horario_id: int = Field(alias="bloqueHorarioId")

    model_config = {"populate_by_name": True}


class ReunionCalculada(BaseModel):
    departamento_id: int = Field(alias="departamentoId")
    dia_semana_id: int = Field(alias="diaSemanaId")
    hora_inicio: int = Field(alias="horaInicio")
    hora_fin: int = Field(alias="horaFin")

    model_config = {"populate_by_name": True}


class SolveResponse(BaseModel):
    status: str
    num_asignaciones: int = Field(alias="numAsignaciones")
    asignaciones: list[Asignacion]
    colaborativas: list[ReunionCalculada] = Field(default_factory=list)
    num_consecutivos: int = Field(default=0, alias="numConsecutivos")
    num_dias_usados: int = Field(default=0, alias="numDiasUsados")
    num_pe_antes_lunch: int = Field(default=0, alias="numPEAntesLunch")

    model_config = {"populate_by_name": True}