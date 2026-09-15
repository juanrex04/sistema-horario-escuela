from ortools.sat.python import cp_model

from .schemas import (
    SolveRequest,
    Asignacion,
    SolveResponse,
    ReunionCalculada,
    Bloque,
    Profesor,
)


def _overlap(b1, b2) -> bool:
    """Los intervalos se cruzan temporalmente solo si comparten el mismo día."""
    if b1.dia_semana_id != b2.dia_semana_id:
        return False
    return int(b1.inicio_min) < int(b2.fin_min) and int(b2.inicio_min) < int(b1.fin_min)


def _overlap_times(d1, i1, f1, d2, i2, f2) -> bool:
    if d1 != d2:
        return False
    return i1 < f2 and i2 < f1


def _grado_base(nombre: str) -> str:
    """Base del nombre de un curso sin la letra(s) de grupo.

    '2A'/'2B' -> '2'; 'Kínder A'/'Kínder B' -> 'Kínder'. Sirve para agrupar
    grupos paralelos del mismo grado dentro de una misma sección.
    """
    stripped = nombre.strip()
    i = len(stripped)
    while i > 0 and stripped[i - 1] in "ABCDEFGHIJKLMNÑOPQRSTUVWXYZÁÉÍÓÚÜ":
        i -= 1
    if i == len(stripped) or i == 0:
        return stripped
    return stripped[:i].rstrip()


# Pesos del objetivo blando. La preferencia de grupos consecutivos (docentes
# con la bandera) domina sobre la distribución semanal, pero un emparejamiento
# repartido en días distintos siempre gana frente a juntarlo todo en un día.
PESO_CONSECUTIVOS = 100
PESO_DISTRIBUCION = 10
PESO_EXCESO = 40


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
    materia_por_id = {m.id: m for m in req.materias}
    pe_dias_por_seccion: dict[int, set[int]] = {}
    for dias_bloqueados in req.dias_sin_pe_por_seccion:
        pe_dias_por_seccion.setdefault(dias_bloqueados.seccion_id, set()).update(
            dias_bloqueados.dia_semana_ids
        )

    for carga in req.cargas:
        curso = curso_por_id[carga.curso_id]

        for dep in req.deportes:
            if curso.seccion_id != dep.seccion_id:
                continue
            b_id = deporte_por_bloque.get((dep.seccion_id, dep.dia_semana_id, dep.numero_periodo))
            if b_id is not None:
                prohibidas.setdefault(carga.id, set()).add(b_id)

        # Regla A: la educación física no cae en los días de deporte de su sección.
        materia = materia_por_id.get(carga.materia_id)
        if materia is not None and materia.es_educacion_fisica:
            dias_pe = pe_dias_por_seccion.get(curso.seccion_id)
            if dias_pe:
                for b_id, b in academic_blocks.items():
                    if b.seccion_id == curso.seccion_id and b.dia_semana_id in dias_pe:
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
    profesor_por_id = {p.id: p for p in req.profesores}

    def _disponibilidad_ok(bloque: Bloque, prof: Profesor) -> bool:
        # Tiempo completo: todos los días hasta las 16:00 (no hay filtro).
        if prof.es_tiempo_completo:
            return True
        # Tiempo parcial: solo trabaja los días de su jornada y hasta la hora
        # de salida configurada para ese día.
        for j in prof.jornada:
            if j.dia_semana_id == bloque.dia_semana_id:
                return bloque.fin_min <= j.hora_fin
        return False

    variables: dict[tuple[int, int], cp_model.IntVar] = {}
    candidatos: dict[int, list[int]] = {}
    for carga in req.cargas:
        curso = curso_por_id[carga.curso_id]
        prof = profesor_por_id.get(carga.profesor_id)
        bloqueados = prohibidas.get(carga.id) or set()
        libre = [
            b_id
            for b_id in bloques_por_seccion.get(curso.seccion_id, [])
            if b_id not in bloqueados
            and (prof is None or _disponibilidad_ok(academic_blocks[b_id], prof))
        ]
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

    # Pares de materias que comparten bloque (p. ej. Música y Expresión Corporal:
    # en el mismo bloque el alumno elige a cuál asistir). Normalizados (min, max).
    # Un par puede acotarse a un curso (grado): solo aplica en ese curso; sin cursoId,
    # aplica en todos los cursos donde coexistan ambas materias (global).
    pares_globales: set[tuple[int, int]] = set()
    pares_por_curso: dict[int, set[tuple[int, int]]] = {}
    for p in req.materias_mismo_bloque:
        t = tuple(sorted((p.materia_a_id, p.materia_b_id)))
        if p.curso_id is None:
            pares_globales.add(t)
        else:
            pares_por_curso.setdefault(p.curso_id, set()).add(t)

    def _pares_de_curso(curso_id: int) -> set[tuple[int, int]]:
        return pares_globales | pares_por_curso.get(curso_id, set())

    # carga_ids que pertenecen a algún par configurado EN SU CURSO
    # (materias distintas = cargas distintas)
    cargas_en_par: dict[tuple[int, int], set[int]] = {}
    cargas_por_materia_en_curso: dict[int, dict[int, list[int]]] = {}
    for carga in req.cargas:
        cargas_par_en_curso = cargas_por_materia_en_curso.setdefault(
            carga.curso_id, {}
        )
        cargas_par_en_curso.setdefault(carga.materia_id, []).append(carga.id)

    for curso_id, por_materia in cargas_por_materia_en_curso.items():
        for (a, b) in _pares_de_curso(curso_id):
            cargas_a = por_materia.get(a, [])
            cargas_b = por_materia.get(b, [])
            if not cargas_a or not cargas_b:
                continue
            for ca in cargas_a:
                for cb in cargas_b:
                    cargas_en_par.setdefault((ca, cb), set())
                    cargas_en_par.setdefault((cb, ca), set())

    # 2. Un curso no puede tener dos asignaciones en el mismo bloque de su sección,
    #    salvo cuando sus cargas forman un par de "mismo bloque" (comparten el bloque
    #    a propósito). Se usa violencia por pares, equivalente a la suma <= 1.
    for bloque_id in academic_blocks:
        for curso_id, lista_cargas in cargas_por_curso.items():
            for i, c1 in enumerate(lista_cargas):
                for c2 in lista_cargas[i + 1:]:
                    if (c1, c2) in cargas_en_par:
                        continue
                    v1 = variables.get((c1, bloque_id))
                    v2 = variables.get((c2, bloque_id))
                    if v1 is not None and v2 is not None:
                        model.Add(v1 + v2 <= 1)

    # 2b. Pares de materias que comparten bloque: por cada curso donde coexistan las
    #     cargas de ambas materias, ocupan exactamente los mismos bloques.
    for curso_id, por_materia in cargas_por_materia_en_curso.items():
        for (a, b) in _pares_de_curso(curso_id):
            cargas_a = por_materia.get(a, [])
            cargas_b = por_materia.get(b, [])
            if not cargas_a or not cargas_b:
                continue
            for ca in cargas_a:
                for cb in cargas_b:
                    for b_id in candidatos.get(ca, []):
                        if b_id not in candidatos.get(cb, []):
                            continue
                        model.Add(variables[(ca, b_id)] == variables[(cb, b_id)])

    # 2c. Pares de P.E en el mismo día (Regla B): las dos cargas del par ven la
    #     materia exactamente los mismos días, con a lo sumo un bloque por día y
    #     por carga. No se exige que los periodos sean consecutivos.
    def _dias_por_carga(carga_id: int) -> dict[int, list[cp_model.IntVar]]:
        por_dia: dict[int, list[cp_model.IntVar]] = {}
        curso = curso_por_id[carga_por_id[carga_id].curso_id]
        for b_id, b in academic_blocks.items():
            if b.seccion_id != curso.seccion_id:
                continue
            var = variables.get((carga_id, b_id))
            if var is not None:
                por_dia.setdefault(b.dia_semana_id, []).append(var)
        return por_dia

    for par in req.pares_pe_mismo_dia:
        ca, cb = par.carga_a_id, par.carga_b_id
        if ca not in carga_por_id or cb not in carga_por_id:
            continue
        if curso_por_id[carga_por_id[ca].curso_id].seccion_id != curso_por_id[
            carga_por_id[cb].curso_id
        ].seccion_id:
            continue
        dias_a, dias_b = _dias_por_carga(ca), _dias_por_carga(cb)
        n = carga_por_id[ca].bloques_semanales_requeridos
        total_a: list[cp_model.IntVar] = []
        for dia_id in set(dias_a) | set(dias_b):
            vars_a = dias_a.get(dia_id, [])
            vars_b = dias_b.get(dia_id, [])
            if not vars_a and not vars_b:
                continue
            usa_a = model.NewBoolVar(f"PE_PRESA_{ca}_{dia_id}")
            usa_b = model.NewBoolVar(f"PE_PRESB_{cb}_{dia_id}")
            model.Add(usa_a <= sum(vars_a))
            model.Add(sum(vars_a) <= len(vars_a) * usa_a)
            model.Add(usa_b <= sum(vars_b))
            model.Add(sum(vars_b) <= len(vars_b) * usa_b)
            model.Add(usa_a == usa_b)
            total_a.append(usa_a)
            if vars_a:
                model.Add(sum(vars_a) <= 1)
            if vars_b:
                model.Add(sum(vars_b) <= 1)
        model.Add(sum(total_a) == n)

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

    # 4. Colaborativas de departamento: garantizar un hueco común semanal (cualquier día).
    #    La reunión ocupa N bloques académicos consecutivos (N configurable globalmente).
    #    Candidatas = ventanas de N bloques académicos absolutos contiguos del mismo día
    #    (fin[k] == inicio[k+1]) que no estén reservados (ni por deportes ni por reuniones
    #    de sección) y que queden dentro de la jornada de TODOS los docentes del departamento:
    #    si algún miembro de tiempo parcial no está en el colegio durante la ventana, esta se
    #    descarta (no se programa la reunión en su hora de salida).
    #    Los miembros de la reunión son los docentes ADSCRITOS al departamento
    #    (departamentoId del docente). Los docentes sin departamento no participan en
    #    ninguna colaborativa; los departamentos sin docentes adscritos no agenda reunión.
    profesores_de_departamento: dict[int, list[int]] = {}
    for col in req.colaborativas:
        prof_ids = {
            p.id for p in req.profesores if p.departamento_id == col.departamento_id
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

    def _ventanas_consecutivas(n: int) -> list[tuple[int, int, int]]:
        """Ventanas de n bloques académicos absolutos contiguos del mismo día."""
        if n <= 1:
            return list(intervalos_candidatos)
        por_dia: dict[int, list[tuple[int, int, int]]] = {}
        for it in intervalos_candidatos:
            por_dia.setdefault(it[0], []).append(it)
        ventanas: list[tuple[int, int, int]] = []
        for dia, lista in por_dia.items():
            por_inicio: dict[int, list[int]] = {}
            for idx, it in enumerate(lista):
                por_inicio.setdefault(it[1], []).append(idx)
            for it in lista:
                fin = it[2]
                pasos = 0
                while pasos < n - 1:
                    siguientes = por_inicio.get(fin, [])
                    if not siguientes:
                        break
                    fin = lista[siguientes[0]][2]
                    pasos += 1
                if pasos == n - 1:
                    ventanas.append((dia, it[1], fin))
        return ventanas

    ventanas_candidatas = _ventanas_consecutivas(max(1, int(req.bloques_colaborativa)))

    def _miembro_presente(ventana: tuple[int, int, int], prof: Profesor | None) -> bool:
        # Tiempo completo: trabaja todos los días hasta las 16:00 (sin restricción).
        if prof is None or prof.es_tiempo_completo:
            return True
        # Tiempo parcial: debe estar en el colegio todo el rango de la ventana.
        dia, _ini, fin = ventana
        return any(
            j.dia_semana_id == dia and fin <= j.hora_fin
            for j in prof.jornada
        )

    meet: dict[int, dict[tuple[int, int, int], cp_model.IntVar]] = {}
    for dept_id, prof_ids in profesores_de_departamento.items():
        meet_vars: dict[tuple[int, int, int], cp_model.IntVar] = {}
        prof_set = set(prof_ids)
        for ventana in ventanas_candidatas:
            if not all(_miembro_presente(ventana, profesor_por_id.get(p)) for p in prof_ids):
                continue
            var = model.NewBoolVar(f"MEET_{dept_id}_{ventana[0]}_{ventana[1]}_{ventana[2]}")
            meet_vars[ventana] = var
            for c in req.cargas:
                if c.profesor_id not in prof_set:
                    continue
                for b_id in candidatos.get(c.id, []):
                    b = academic_blocks[b_id]
                    if _overlap_times(
                        b.dia_semana_id, int(b.inicio_min), int(b.fin_min), *ventana
                    ):
                        model.Add(var + variables[(c.id, b_id)] <= 1)
        if not meet_vars:
            return SolveResponse(status="INFEASIBLE", num_asignaciones=0, asignaciones=[])
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

    # 5. (Blando) Preferencia de grupos consecutivos por docente: maximiza que
    #    las cargas del mismo profesor+materia cuyos cursos comparten sección Y
    #    grado (misma base de nombre, p. ej. 2A y 2B) queden en bloques vecinos
    #    del mismo día. No rompe la viabilidad: solo guía la búsqueda.
    variables_consecutivos: list[cp_model.IntVar] = []
    prof_ids_flag = {p.id for p in req.profesores if p.prefiere_grupos_consecutivos}
    if prof_ids_flag:
        cargas_flag = [c for c in req.cargas if c.profesor_id in prof_ids_flag]

        bloques_orden_por_seccion_dia: dict[tuple[int, int], list[int]] = {}
        for b_id, b in academic_blocks.items():
            bloques_orden_por_seccion_dia.setdefault((b.seccion_id, b.dia_semana_id), []).append(
                (int(b.inicio_min), b_id)
            )
        for key in bloques_orden_por_seccion_dia:
            bloques_orden_por_seccion_dia[key].sort()
            bloques_orden_por_seccion_dia[key] = [b_id for _, b_id in bloques_orden_por_seccion_dia[key]]

        def _agregar_premio(x1: cp_model.IntVar, x2: cp_model.IntVar) -> None:
            y = model.NewBoolVar(f"CONSEC_{x1.Name()}_{x2.Name()}")
            model.Add(y <= x1)
            model.Add(y <= x2)
            model.Add(y >= x1 + x2 - 1)
            variables_consecutivos.append(y)

        for i, c1 in enumerate(cargas_flag):
            curso1 = curso_por_id[c1.curso_id]
            base1 = _grado_base(curso1.nombre)
            for c2 in cargas_flag[i + 1:]:
                if (
                    c2.profesor_id != c1.profesor_id
                    or c2.materia_id != c1.materia_id
                ):
                    continue
                curso2 = curso_por_id[c2.curso_id]
                if curso2.seccion_id != curso1.seccion_id:
                    continue
                if _grado_base(curso2.nombre) != base1:
                    continue
                for (sec_id, _dia_id), orden in bloques_orden_por_seccion_dia.items():
                    if sec_id != curso1.seccion_id:
                        continue
                    for u, v in zip(orden, orden[1:]):
                        if (c1.id, u) in variables and (c2.id, v) in variables:
                            _agregar_premio(variables[(c1.id, u)], variables[(c2.id, v)])
                        if (c1.id, v) in variables and (c2.id, u) in variables:
                            _agregar_premio(variables[(c1.id, v)], variables[(c2.id, u)])

    # 6. (Blando) Distribución semanal: reparte los bloques de cada carga a lo
    #    largo de la semana. Se premia usar el mayor número de días posible y se
    #    castiga superar el tope diario (1 bloque/día en materias de 3 o menos
    #    bloques semanales; 2 bloques/día como máximo en materias de 4 o más).
    #    No rompe la viabilidad: solo guía la búsqueda.
    variables_dias: list[cp_model.IntVar] = []
    variables_exceso: list[cp_model.IntVar] = []
    for carga in req.cargas:
        tope_diario = 1 if carga.bloques_semanales_requeridos <= 3 else 2
        curso = curso_por_id[carga.curso_id]
        por_dia: dict[int, list[cp_model.IntVar]] = {}
        for b_id, b in academic_blocks.items():
            if b.seccion_id != curso.seccion_id:
                continue
            var = variables.get((carga.id, b_id))
            if var is not None:
                por_dia.setdefault(b.dia_semana_id, []).append(var)
        for dia_id, vars_dia in por_dia.items():
            n = model.NewIntVar(0, len(vars_dia), f"CONEO_{carga.id}_{dia_id}")
            usa = model.NewBoolVar(f"DIA_{carga.id}_{dia_id}")
            exceso = model.NewBoolVar(f"EXCESO_{carga.id}_{dia_id}")
            model.Add(n == sum(vars_dia))
            model.Add(usa <= n)
            model.Add(n <= len(vars_dia) * usa)
            model.Add(n >= tope_diario + 1).OnlyEnforceIf(exceso)
            model.Add(n <= tope_diario).OnlyEnforceIf(exceso.Not())
            variables_dias.append(usa)
            variables_exceso.append(exceso)

    model.Maximize(
        PESO_CONSECUTIVOS * sum(variables_consecutivos)
        + PESO_DISTRIBUCION * sum(variables_dias)
        - PESO_EXCESO * sum(variables_exceso)
    )

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
            num_consecutivos=sum(
                1 for v in variables_consecutivos if solver.Value(v) == 1
            ),
            num_dias_usados=sum(
                1 for v in variables_dias if solver.Value(v) == 1
            ),
        )

    return SolveResponse(status="INFEASIBLE", num_asignaciones=0, asignaciones=[])