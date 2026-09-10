from ortools.sat.python import cp_model

from .schemas import SolveRequest, Asignacion, SolveResponse


def _overlap(b1, b2) -> bool:
    """Los intervalos se cruzan temporalmente solo si comparten el mismo día."""
    if b1.dia_semana_id != b2.dia_semana_id:
        return False
    return int(b1.inicio_min) < int(b2.fin_min) and int(b2.inicio_min) < int(b1.fin_min)


def solve(req: SolveRequest) -> SolveResponse:
    model = cp_model.CpModel()

    academic_blocks = {b.id: b for b in req.bloques if b.es_academico}
    curso_por_id = {c.id: c for c in req.cursos}
    carga_por_id = {c.id: c for c in req.cargas}

    if not academic_blocks or not req.cargas:
        return SolveResponse(status="NO_DATA", num_asignaciones=0, asignaciones=[])

    bloques_por_seccion: dict[int, list[int]] = {}
    for b in academic_blocks.values():
        bloques_por_seccion.setdefault(b.seccion_id, []).append(b.id)
    # Incluir secciones que no tienen bloques académicos (para validación)
    for c in req.cursos:
        bloques_por_seccion.setdefault(c.seccion_id, [])

    # Variables: X[(carga_id, bloque_id)] = 1 si la carga se asigna al bloque
    variables: dict[tuple[int, int], cp_model.IntVar] = {}
    candidatos: dict[int, list[int]] = {}
    for carga in req.cargas:
        curso = curso_por_id[carga.curso_id]
        candidatos[carga.id] = bloques_por_seccion.get(curso.seccion_id, [])
        for b_id in candidatos[carga.id]:
            b = academic_blocks[b_id]
            var = model.NewBoolVar(f"X_{carga.id}_{b_id}")
            variables[(carga.id, b_id)] = var

    # 1. Cada carga recibe exactamente sus bloques semanales requeridos
    for carga in req.cargas:
        vars_carga = [variables[(carga.id, b_id)] for b_id in candidatos[carga.id]]
        if not vars_carga:
            continue
        model.Add(sum(vars_carga) == carga.bloques_semanales_requeridos)

    # Bloques disponibles por carga (para restricciones de curso)
    cargas_por_curso: dict[int, list[int]] = {}
    for carga in req.cargas:
        cargas_por_curso.setdefault(carga.curso_id, []).append(carga.id)

    # 2. Un curso no puede tener dos asignaciones en el mismo bloque de su sección
    for bloque_id in academic_blocks:
        for curso_id, lista_cargas in cargas_por_curso.items():
            vars_curso = [variables[(c, bloque_id)] for c in lista_cargas if (c, bloque_id) in variables]
            if len(vars_curso) > 1:
                model.Add(sum(vars_curso) <= 1)

    # 3. No solapamiento docente (matriz de incompatibilidad temporal)
    cargas_por_profesor: dict[int, list[int]] = {}
    for carga in req.cargas:
        cargas_por_profesor.setdefault(carga.profesor_id, []).append(carga.id)

    bloques_ids = list(academic_blocks.keys())
    bloques_por_id = academic_blocks

    for prof_id, lista_cargas in cargas_por_profesor.items():
        if not lista_cargas:
            continue
        # Pares de bloques (incluye b1 == b2 para evitar doble asignación en el mismo bloque)
        for i, b1_id in enumerate(bloques_ids):
            b1 = bloques_por_id[b1_id]
            for b2_id in bloques_ids[i:]:
                b2 = bloques_por_id[b2_id]
                if not _overlap(b1, b2):
                    continue
                if b1_id == b2_id:
                    vars_conflicto = [
                        variables[(c, b1_id)] for c in lista_cargas if (c, b1_id) in variables
                    ]
                else:
                    vars_conflicto = [
                        variables[(c, b1_id)] for c in lista_cargas if (c, b1_id) in variables
                    ] + [
                        variables[(c, b2_id)] for c in lista_cargas if (c, b2_id) in variables
                    ]
                if len(vars_conflicto) > 1:
                    model.Add(sum(vars_conflicto) <= 1)

    # 4. Límite de horas semanales por profesor (si está definido)
    profesor_por_id = {p.id: p for p in req.profesores}
    for prof in req.profesores:
        if not prof.max_horas_semana:
            continue
        total_min = []
        for c in req.cargas:
            if c.profesor_id != prof.id:
                continue
            for b_id in candidatos.get(c.id, []):
                b = academic_blocks[b_id]
                total_min.append(variables[(c.id, b_id)] * (b.fin_min - b.inicio_min))
        if total_min:
            model.Add(sum(total_min) <= prof.max_horas_semana * 60)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 30
    status = solver.Solve(model)

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        asignaciones: list[Asignacion] = []
        for (carga_id, bloque_id), var in variables.items():
            if solver.Value(var) == 1:
                asignaciones.append(
                    Asignacion(cargaAcademicaId=carga_id, bloqueHorarioId=bloque_id)
                )
        status_label = "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE"
        return SolveResponse(
            status=status_label,
            num_asignaciones=len(asignaciones),
            asignaciones=asignaciones,
        )

    return SolveResponse(status="INFEASIBLE", num_asignaciones=0, asignaciones=[])