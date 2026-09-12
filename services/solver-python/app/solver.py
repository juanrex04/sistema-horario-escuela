from ortools.sat.python import cp_model

from .schemas import SolveRequest, Asignacion, SolveResponse, ReunionCalculada


def _overlap(b1, b2) -> bool:
    """Los intervalos se cruzan temporalmente solo si comparten el mismo día."""
    if b1.dia_semana_id != b2.dia_semana_id:
        return False
    return int(b1.inicio_min) < int(b2.fin_min) and int(b2.inicio_min) < int(b1.fin_min)


def _overlap_times(d1, i1, f1, d2, i2, f2) -> bool:
    if d1 != d2:
        return False
    return i1 < f2 and i2 < f1


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
    for c in req.cursos:
        bloques_por_seccion.setdefault(c.seccion_id, [])

    # ---- Restricciones de horario reservado (deportes y reuniones de sección) ----
    # deporte: (seccionId, diaSemanaId, numeroPeriodo) -> bloque académico
    deporte_por_bloque: dict[tuple[int, int, str], int] = {}
    for d in req.deportes:
        for b_id, b in academic_blocks.items():
            if (
                b.seccion_id == d.seccion_id
                and b.dia_semana_id == d.dia_semana_id
                and b.numero_periodo == d.numero_periodo
            ):
                deporte_por_bloque[(d.seccion_id, d.dia_semana_id, d.numero_periodo)] = b_id

    prohibidas: dict[int, set[int]] = {}
    for carga in req.cargas:
        curso = curso_por_id[carga.curso_id]

        for dep in req.deportes:
            if curso.seccion_id != dep.seccion_id:
                continue
            b_id = deporte_por_bloque.get((dep.seccion_id, dep.dia_semana_id, dep.numero_periodo))
            if b_id is not None:
                prohibidas.setdefault(carga.id, set()).add(b_id)

    profesor_base_por_id = {p.id: p.seccion_base_id for p in req.profesores}

    # reuniones de sección (colaborativa obligatoria por sección de adscripción):
    #   (a) ocupación física: las cargas de cursos de las secciones asistentes no pueden
    #       caer en bloques solapados con la franja (la sección se reúne, no hay clase);
    #   (b) obligación base: los docentes adscritos a una sección asistente quedan libres
    #       en todo bloque solapado, vengan de la sección que vengan (para poder asistir).
    for reunion in req.reuniones_seccion:
        seccion_ids = set(reunion.seccion_ids)
        prof_ids_base = {
            pid for pid, base_id in profesor_base_por_id.items() if base_id in seccion_ids
        }
        if not seccion_ids:
            continue
        for b_id, b in academic_blocks.items():
            if not _overlap_times(
                b.dia_semana_id,
                int(b.inicio_min),
                int(b.fin_min),
                reunion.dia_semana_id,
                reunion.hora_inicio,
                reunion.hora_fin,
            ):
                continue
            for c in req.cargas:
                curso = curso_por_id[c.curso_id]
                if curso.seccion_id in seccion_ids or c.profesor_id in prof_ids_base:
                    prohibidas.setdefault(c.id, set()).add(b_id)

    # Variables: X[(carga_id, bloque_id)] = 1 si la carga se asigna al bloque
    variables: dict[tuple[int, int], cp_model.IntVar] = {}
    candidatos: dict[int, list[int]] = {}
    for carga in req.cargas:
        curso = curso_por_id[carga.curso_id]
        bloqueados = prohibidas.get(carga.id) or set()
        libre = [b_id for b_id in bloques_por_seccion.get(curso.seccion_id, []) if b_id not in bloqueados]
        if len(libre) < carga.bloques_semanales_requeridos:
            return SolveResponse(status="INFEASIBLE", num_asignaciones=0, asignaciones=[])
        candidatos[carga.id] = libre
        for b_id in libre:
            var = model.NewBoolVar(f"X_{carga.id}_{b_id}")
            variables[(carga.id, b_id)] = var

    # 1. Cada carga recibe exactamente sus bloques semanales requeridos
    for carga in req.cargas:
        vars_carga = [variables[(carga.id, b_id)] for b_id in candidatos[carga.id]]
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

    # 5. Colaborativas de departamento: garantizar un hueco común semanal (cualquier día)
    #    Candidatos = franjas académicas absolutas de la semana que no estén reservadas
    #    (ni por deportes ni por reuniones de sección), para no solapar actividades fijas.
    profesores_de_departamento: dict[int, list[int]] = {}
    for col in req.colaborativas:
        if not col.materia_ids:
            continue
        prof_ids = {
            c.profesor_id
            for c in req.cargas
            if c.materia_id in col.materia_ids
        }
        if prof_ids:
            profesores_de_departamento[col.departamento_id] = sorted(prof_ids)

    reservados_candidatos: list[tuple[int, int, int]] = []
    for reunion in req.reuniones_seccion:
        reservados_candidatos.append((reunion.dia_semana_id, reunion.hora_inicio, reunion.hora_fin))
    for (seccion_id, dia_id, periodo), b_id in deporte_por_bloque.items():
        b = academic_blocks[b_id]
        reservados_candidatos.append((b.dia_semana_id, int(b.inicio_min), int(b.fin_min)))

    intervalos_candidatos: list[tuple[int, int, int]] = []
    for b_id in sorted(academic_blocks, key=lambda i: (academic_blocks[i].dia_semana_id, int(academic_blocks[i].inicio_min))):
        b = academic_blocks[b_id]
        intervalo = (b.dia_semana_id, int(b.inicio_min), int(b.fin_min))
        if intervalo in intervalos_candidatos:
            continue
        if any(_overlap_times(*intervalo, *r) for r in reservados_candidatos):
            continue
        intervalos_candidatos.append(intervalo)

    meet: dict[int, dict[tuple[int, int, int], cp_model.IntVar]] = {}
    for dept_id, prof_ids in profesores_de_departamento.items():
        if not intervalos_candidatos:
            return SolveResponse(status="INFEASIBLE", num_asignaciones=0, asignaciones=[])
        meet_vars: dict[tuple[int, int, int], cp_model.IntVar] = {}
        prof_set = set(prof_ids)
        for intervalo in intervalos_candidatos:
            var = model.NewBoolVar(f"MEET_{dept_id}_{intervalo[0]}_{intervalo[1]}_{intervalo[2]}")
            meet_vars[intervalo] = var
            for c in req.cargas:
                if c.profesor_id not in prof_set:
                    continue
                for b_id in candidatos.get(c.id, []):
                    b = academic_blocks[b_id]
                    if _overlap_times(
                        b.dia_semana_id, int(b.inicio_min), int(b.fin_min), *intervalo
                    ):
                        model.Add(var + variables[(c.id, b_id)] <= 1)
        meet[dept_id] = meet_vars
        model.Add(sum(meet_vars.values()) >= 1)

    # 5b. Un docente miembro de varios departamentos no puede tener dos reuniones
    #     de departamento simultáneas (o que se solapen en el tiempo).
    deptos_por_profesor: dict[int, list[int]] = {}
    for dept_id, prof_ids in profesores_de_departamento.items():
        for p in prof_ids:
            deptos_por_profesor.setdefault(p, []).append(dept_id)

    for prof_id, dept_ids in deptos_por_profesor.items():
        if len(dept_ids) < 2:
            continue
        for i, d1 in enumerate(dept_ids):
            for d2 in dept_ids[i + 1:]:
                for t1, v1 in meet[d1].items():
                    for t2, v2 in meet[d2].items():
                        if _overlap_times(*t1, *t2):
                            model.Add(v1 + v2 <= 1)

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

        colaborativas: list[ReunionCalculada] = []
        for dept_id, meet_vars in meet.items():
            elegido = next(
                (t for t, v in meet_vars.items() if solver.Value(v) == 1), None
            )
            if elegido is not None:
                colaborativas.append(
                    ReunionCalculada(
                        departamentoId=dept_id,
                        diaSemanaId=elegido[0],
                        horaInicio=elegido[1],
                        horaFin=elegido[2],
                    )
                )

        status_label = "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE"
        return SolveResponse(
            status=status_label,
            num_asignaciones=len(asignaciones),
            asignaciones=asignaciones,
            colaborativas=colaborativas,
        )

    return SolveResponse(status="INFEASIBLE", num_asignaciones=0, asignaciones=[])