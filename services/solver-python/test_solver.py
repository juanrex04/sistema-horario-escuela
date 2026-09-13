from app.solver import solve
from app.schemas import (
    SolveRequest, Seccion, Dia, Bloque, Profesor, Curso, Materia, Carga,
    ReunionSeccion, Deporte, ColaborativaEntrada, MateriaMismoBloque,
)

DIAS = [
    Dia(id=1, numeroDia=1, esHorarioEspecial=False),
    Dia(id=2, numeroDia=2, esHorarioEspecial=False),
]


def bloques_simples(n_sec=None):
    """4 bloques académicos por sección el día 1 (07:00-10:40)."""
    n_sec = n_sec or 1
    out = []
    i = 1
    for s in range(1, n_sec + 1):
        for p, ini, fin in (
            (1, 420, 480), (2, 480, 540), (3, 540, 600), (4, 600, 660),
        ):
            out.append(Bloque(id=i, seccionId=s, diaSemanaId=1, numeroPeriodo=str(p),
                              inicioMin=ini, finMin=fin, esAcademico=True))
            i += 1
    return out


def bloques_2dias(n_sec=None):
    """4 bloques por sección en 2 días (8 bloques por sección)."""
    n_sec = n_sec or 1
    out = []
    i = 1
    for s in range(1, n_sec + 1):
        for d in (1, 2):
            for p, ini, fin in (
                (1, 420, 480), (2, 480, 540), (3, 540, 600), (4, 600, 660),
            ):
                out.append(Bloque(id=i, seccionId=s, diaSemanaId=d, numeroPeriodo=str(p),
                                  inicioMin=ini, finMin=fin, esAcademico=True))
                i += 1
    return out


def intervalo_de(bloque_id):
    return (bloque_id.dia_semana_id, bloque_id.inicio_min, bloque_id.fin_min)


# 1. Caso base: dos cargas del mismo profesor en una sección
payload = SolveRequest(
    secciones=[Seccion(id=1, nombre="Test")],
    dias=DIAS,
    bloques=bloques_2dias(),
    profesores=[Profesor(id=1, nombre="P", seccionBaseId=1)],
    cursos=[Curso(id=1, nombre="C1", seccionId=1)],
    materias=[Materia(id=1, nombre="M1"), Materia(id=2, nombre="M2")],
    cargas=[
        Carga(id=1, cursoId=1, materiaId=1, profesorId=1, bloquesSemanalesRequeridos=4),
        Carga(id=2, cursoId=1, materiaId=2, profesorId=1, bloquesSemanalesRequeridos=4),
    ],
)
result = solve(payload)
assert result.status == "OPTIMAL", result.status
assert result.num_asignaciones == 8
print("[1] base OPTIMAL OK")

# 2. Día de deportes: bloque reservado sin asignaciones de la sección
payload2 = SolveRequest(
    secciones=[Seccion(id=1, nombre="Test")],
    dias=DIAS,
    bloques=bloques_simples(),
    profesores=[Profesor(id=1, nombre="P", seccionBaseId=1)],
    cursos=[Curso(id=1, nombre="C1", seccionId=1)],
    materias=[Materia(id=1, nombre="M1")],
    cargas=[Carga(id=1, cursoId=1, materiaId=1, profesorId=1, bloquesSemanalesRequeridos=3)],
    deportes=[Deporte(seccionId=1, diaSemanaId=1, numeroPeriodo="2")],
)
result2 = solve(payload2)
assert result2.status == "OPTIMAL", result2.status
assert result2.num_asignaciones == 3
for a in result2.asignaciones:
    b = next(x for x in payload2.bloques if x.id == a.bloque_horario_id)
    assert b.numero_periodo != "2", "no debe asignarse al bloque de deportes"
print("[2] deportes respetados OK")

# 3. Reunión de sección compartida: docente de ambas secciones libre en la franja
payload3 = SolveRequest(
    secciones=[Seccion(id=1, nombre="Sec1"), Seccion(id=2, nombre="Sec2")],
    dias=DIAS,
    bloques=bloques_2dias(n_sec=2),
    profesores=[Profesor(id=1, nombre="P", seccionBaseId=1)],
    cursos=[Curso(id=1, nombre="C1", seccionId=1), Curso(id=2, nombre="C2", seccionId=2)],
    materias=[Materia(id=1, nombre="M1")],
    cargas=[
        Carga(id=1, cursoId=1, materiaId=1, profesorId=1, bloquesSemanalesRequeridos=2),
        Carga(id=2, cursoId=2, materiaId=1, profesorId=1, bloquesSemanalesRequeridos=2),
    ],
    reunionesSeccion=[
        ReunionSeccion(diaSemanaId=1, horaInicio=480, horaFin=540, seccionIds=[1, 2])
    ],
)
result3 = solve(payload3)
assert result3.status == "OPTIMAL", result3.status
for a in result3.asignaciones:
    b = next(x for x in payload3.bloques if x.id == a.bloque_horario_id)
    assert not (b.inicio_min < 540 and 480 < b.fin_min), "docente ocupado durante la reunión"
print("[3] reunión de sección compartida OK")

# 4. Colaborativa de departamento: garantiza hueco común y lo reporta
payload4 = SolveRequest(
    secciones=[Seccion(id=1, nombre="Sec1"), Seccion(id=2, nombre="Sec2")],
    dias=DIAS,
    bloques=bloques_simples(n_sec=2),
    profesores=[
        Profesor(id=1, nombre="A", seccionBaseId=1),
        Profesor(id=2, nombre="B", seccionBaseId=2),
    ],
    cursos=[Curso(id=1, nombre="C1", seccionId=1), Curso(id=2, nombre="C2", seccionId=2)],
    materias=[Materia(id=1, nombre="M1"), Materia(id=2, nombre="M2")],
    cargas=[
        Carga(id=1, cursoId=1, materiaId=1, profesorId=1, bloquesSemanalesRequeridos=2),
        Carga(id=2, cursoId=2, materiaId=2, profesorId=2, bloquesSemanalesRequeridos=2),
    ],
    colaborativas=[ColaborativaEntrada(departamentoId=1, materiaIds=[1, 2])],
)
result4 = solve(payload4)
assert result4.status == "OPTIMAL", result4.status
assert len(result4.colaborativas) == 1, result4.colaborativas
col = result4.colaborativas[0]
for a in result4.asignaciones:
    b = next(x for x in payload4.bloques if x.id == a.bloque_horario_id)
    assert not (
        b.dia_semana_id == col.dia_semana_id
        and b.inicio_min < col.hora_fin
        and col.hora_inicio < b.fin_min
    ), "un docente del depto dicta durante la colaborativa"
print(f"[4] colaborativa depto día {col.dia_semana_id} {col.hora_inicio}-{col.hora_fin} OK")

# 5. Sobre-restringido: carga con menos bloques disponibles que requeridos -> INFEASIBLE
payload5 = SolveRequest(
    secciones=[Seccion(id=1, nombre="Test")],
    dias=DIAS,
    bloques=bloques_simples(),
    profesores=[Profesor(id=1, nombre="P", seccionBaseId=1)],
    cursos=[Curso(id=1, nombre="C1", seccionId=1)],
    materias=[Materia(id=1, nombre="M1")],
    cargas=[Carga(id=1, cursoId=1, materiaId=1, profesorId=1, bloquesSemanalesRequeridos=5)],
)
result5 = solve(payload5)
assert result5.status == "INFEASIBLE", result5.status
print("[5] sobre-restringido INFEASIBLE OK")

# 6. Colaborativa por adscripción: Juan (base Primaria) dicta en Middle. La reunión de
# Primaria lo libera de TODO (incl. su carga de Middle) -> sin bloque en Middle, INFEASIBLE
bloque_middle_unico = [Bloque(id=9, seccionId=2, diaSemanaId=1, numeroPeriodo="1",
                              inicioMin=420, finMin=480, esAcademico=True)]
payload6 = SolveRequest(
    secciones=[Seccion(id=1, nombre="Primaria"), Seccion(id=2, nombre="Middle")],
    dias=DIAS,
    bloques=bloques_2dias(n_sec=1) + bloque_middle_unico,
    profesores=[Profesor(id=1, nombre="Juan", seccionBaseId=1)],
    cursos=[Curso(id=1, nombre="C1", seccionId=1), Curso(id=2, nombre="C2", seccionId=2)],
    materias=[Materia(id=1, nombre="M1")],
    cargas=[
        Carga(id=1, cursoId=1, materiaId=1, profesorId=1, bloquesSemanalesRequeridos=4),
        Carga(id=2, cursoId=2, materiaId=1, profesorId=1, bloquesSemanalesRequeridos=1),
    ],
    reunionesSeccion=[
        ReunionSeccion(diaSemanaId=1, horaInicio=420, horaFin=480, seccionIds=[1])
    ],
)
result6 = solve(payload6)
assert result6.status == "INFEASIBLE", result6.status
print("[6] colaborativa por adscripción (base Prima libera la carga de Middle) INFEASIBLE OK")

# 7. Docente NO adscrito no se libera por la colaborativa de otra sección.
# Ana (base Diploma) dicta en Primaria; la reunión de Middle no la afecta.
bloque_primaria_unico = [Bloque(id=1, seccionId=1, diaSemanaId=2, numeroPeriodo="2",
                                inicioMin=480, finMin=540, esAcademico=True)]
bloques_middle = [
    Bloque(id=2, seccionId=2, diaSemanaId=1, numeroPeriodo=str(p), inicioMin=ini, finMin=fin, esAcademico=True)
    for p, ini, fin in ((1, 420, 480), (2, 480, 540), (3, 540, 600), (4, 600, 660))
] + [
    Bloque(id=6, seccionId=2, diaSemanaId=2, numeroPeriodo=str(p), inicioMin=ini, finMin=fin, esAcademico=True)
    for p, ini, fin in ((1, 420, 480), (2, 480, 540), (3, 540, 600), (4, 600, 660))
]
payload7 = SolveRequest(
    secciones=[
        Seccion(id=1, nombre="Primaria"),
        Seccion(id=2, nombre="Middle"),
        Seccion(id=3, nombre="Diploma"),
    ],
    dias=DIAS,
    bloques=bloque_primaria_unico + bloques_middle,
    profesores=[Profesor(id=5, nombre="Ana", seccionBaseId=3)],
    cursos=[Curso(id=1, nombre="C1", seccionId=1)],
    materias=[Materia(id=1, nombre="M1")],
    cargas=[Carga(id=1, cursoId=1, materiaId=1, profesorId=5, bloquesSemanalesRequeridos=1)],
    reunionesSeccion=[
        ReunionSeccion(diaSemanaId=2, horaInicio=480, horaFin=540, seccionIds=[2])
    ],
)
result7 = solve(payload7)
assert result7.status == "OPTIMAL", result7.status
assert any(a.bloque_horario_id == 1 for a in result7.asignaciones), (
    "Ana debe poder dictar en Primaria durante la reunión de Middle (base Diploma)"
)
print("[7] no adscrito sigue disponible en la reunión de otra sección OK")

# 8. Grupos consecutivos: docente con la preferencia, 2A y 2B (misma materia,
#    misma sección, mismo grado). Con los 8 bloques llenos, el óptimo alterna
#    ambos grupos dentro de cada día (3 contigüidades/día x 2 días = 6).
payload8 = SolveRequest(
    secciones=[Seccion(id=1, nombre="Sec1")],
    dias=DIAS,
    bloques=bloques_2dias(),
    profesores=[Profesor(id=1, nombre="P", seccionBaseId=1,
                         prefiereGruposConsecutivos=True)],
    cursos=[Curso(id=1, nombre="2A", seccionId=1), Curso(id=2, nombre="2B", seccionId=1)],
    materias=[Materia(id=1, nombre="M1")],
    cargas=[
        Carga(id=1, cursoId=1, materiaId=1, profesorId=1, bloquesSemanalesRequeridos=4),
        Carga(id=2, cursoId=2, materiaId=1, profesorId=1, bloquesSemanalesRequeridos=4),
    ],
)
result8 = solve(payload8)
assert result8.status == "OPTIMAL", result8.status
assert result8.num_asignaciones == 8, result8.num_asignaciones
assert result8.num_consecutivos == 6, result8.num_consecutivos
print(f"[8] grupos consecutivos 2A/2B óptimo ({result8.num_consecutivos}/6) OK")

# 9. La preferencia es blanda: no rompe viabilidad y el óptimo con flag nunca
#    logra menos contigüidades que la solución base sin flag.
payload9_sin = SolveRequest(
    secciones=[Seccion(id=1, nombre="Sec1")],
    dias=DIAS,
    bloques=bloques_2dias(),
    profesores=[Profesor(id=1, nombre="P", seccionBaseId=1)],
    cursos=[Curso(id=1, nombre="2A", seccionId=1), Curso(id=2, nombre="2B", seccionId=1)],
    materias=[Materia(id=1, nombre="M1")],
    cargas=[
        Carga(id=1, cursoId=1, materiaId=1, profesorId=1, bloquesSemanalesRequeridos=2),
        Carga(id=2, cursoId=2, materiaId=1, profesorId=1, bloquesSemanalesRequeridos=2),
    ],
)
payload9_con = payload9_sin.model_copy(
    update={"profesores": [Profesor(id=1, nombre="P", seccionBaseId=1,
                                    prefiereGruposConsecutivos=True)]}
)
result9_sin = solve(payload9_sin)
result9_con = solve(payload9_con)
assert result9_sin.status == "OPTIMAL", result9_sin.status
assert result9_con.status == "OPTIMAL", result9_con.status
assert result9_con.num_asignaciones == result9_sin.num_asignaciones == 4
assert result9_con.num_consecutivos >= result9_sin.num_consecutivos
assert result9_con.num_consecutivos >= 1, result9_con.num_consecutivos
print(f"[9] blando sin romper viabilidad ({result9_sin.num_consecutivos}->{result9_con.num_consecutivos}) OK")

# 10. Alcance conservador (mismo grado): 2A y 3A NO se premian entre sí.
payload10 = SolveRequest(
    secciones=[Seccion(id=1, nombre="Sec1")],
    dias=DIAS,
    bloques=bloques_2dias(),
    profesores=[Profesor(id=1, nombre="P", seccionBaseId=1,
                         prefiereGruposConsecutivos=True)],
    cursos=[Curso(id=1, nombre="2A", seccionId=1), Curso(id=2, nombre="3A", seccionId=1)],
    materias=[Materia(id=1, nombre="M1")],
    cargas=[
        Carga(id=1, cursoId=1, materiaId=1, profesorId=1, bloquesSemanalesRequeridos=4),
        Carga(id=2, cursoId=2, materiaId=1, profesorId=1, bloquesSemanalesRequeridos=4),
    ],
)
result10 = solve(payload10)
assert result10.status == "OPTIMAL", result10.status
assert result10.num_consecutivos == 0, result10.num_consecutivos
print(f"[10] sin premio entre grados distintos ({result10.num_consecutivos}) OK")

# 11. Par "mismo bloque" (Música y Expresión Corporal): docentes distintos,
#     mismo curso. Ambas cargas deben ocupar exactamente los mismos bloques.
payload11 = SolveRequest(
    secciones=[Seccion(id=1, nombre="Sec1")],
    dias=DIAS,
    bloques=bloques_simples(),
    profesores=[
        Profesor(id=1, nombre="Músico", seccionBaseId=1),
        Profesor(id=2, nombre="Corporal", seccionBaseId=1),
    ],
    cursos=[Curso(id=1, nombre="3A", seccionId=1)],
    materias=[
        Materia(id=1, nombre="Música"),
        Materia(id=2, nombre="Expresión Corporal"),
    ],
    cargas=[
        Carga(id=1, cursoId=1, materiaId=1, profesorId=1, bloquesSemanalesRequeridos=2),
        Carga(id=2, cursoId=1, materiaId=2, profesorId=2, bloquesSemanalesRequeridos=2),
    ],
    materiasMismoBloque=[MateriaMismoBloque(materiaAId=1, materiaBId=2)],
)
result11 = solve(payload11)
assert result11.status == "OPTIMAL", result11.status
assert result11.num_asignaciones == 4, result11.num_asignaciones
bloques_mus = {a.bloque_horario_id for a in result11.asignaciones if a.carga_academica_id == 1}
bloques_corp = {a.bloque_horario_id for a in result11.asignaciones if a.carga_academica_id == 2}
assert bloques_mus == bloques_corp, (bloques_mus, bloques_corp)
print(f"[11] Música/Expresión en el mismo bloque ({sorted(bloques_mus)}) OK")

# 12. Sin pareja configurada, las cargas de materias distintas en el mismo curso
#     NO pueden compartir bloque (restricción de curso sigue vigente).
payload12 = SolveRequest(
    secciones=[Seccion(id=1, nombre="Sec1")],
    dias=DIAS,
    bloques=bloques_simples(),
    profesores=[
        Profesor(id=1, nombre="A", seccionBaseId=1),
        Profesor(id=2, nombre="B", seccionBaseId=1),
    ],
    cursos=[Curso(id=1, nombre="3A", seccionId=1)],
    materias=[Materia(id=1, nombre="M1"), Materia(id=2, nombre="M2")],
    cargas=[
        Carga(id=1, cursoId=1, materiaId=1, profesorId=1, bloquesSemanalesRequeridos=2),
        Carga(id=2, cursoId=1, materiaId=2, profesorId=2, bloquesSemanalesRequeridos=2),
    ],
)
result12 = solve(payload12)
assert result12.status == "OPTIMAL", result12.status
bloques_a = {a.bloque_horario_id for a in result12.asignaciones if a.carga_academica_id == 1}
bloques_b = {a.bloque_horario_id for a in result12.asignaciones if a.carga_academica_id == 2}
assert bloques_a.isdisjoint(bloques_b), (bloques_a, bloques_b)
print(f"[12] sin par: bloques disjuntos ({sorted(bloques_a)} vs {sorted(bloques_b)}) OK")

print("OK")