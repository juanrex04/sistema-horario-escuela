from app.solver import solve
from app.schemas import SolveRequest, Seccion, Dia, Bloque, Profesor, Curso, Materia, Carga

payload = SolveRequest(
    secciones=[Seccion(id=1, nombre="Test")],
    dias=[Dia(id=1, numeroDia=1, esHorarioEspecial=False), Dia(id=2, numeroDia=2, esHorarioEspecial=False)],
    bloques=[
        Bloque(id=i, seccionId=1, diaSemanaId=d, numeroPeriodo=str(p), inicioMin=ini, finMin=fin, esAcademico=True)
        for i, (d, p, ini, fin) in enumerate(
            [
                (1, 1, 420, 480), (1, 2, 480, 540),
                (1, 3, 540, 600), (1, 4, 600, 660),
                (2, 1, 420, 480), (2, 2, 480, 540),
                (2, 3, 540, 600), (2, 4, 600, 660),
            ],
            1,
        )
    ],
    profesores=[Profesor(id=1, nombre="P", maxHorasSemana=None)],
    cursos=[Curso(id=1, nombre="C1", seccionId=1)],
    materias=[Materia(id=1, nombre="M1"), Materia(id=2, nombre="M2")],
    cargas=[
        Carga(id=1, cursoId=1, materiaId=1, profesorId=1, bloquesSemanalesRequeridos=4),
        Carga(id=2, cursoId=1, materiaId=2, profesorId=1, bloquesSemanalesRequeridos=4),
    ],
)

result = solve(payload)
print("status:", result.status)
print("num_asignaciones:", result.num_asignaciones)
for a in result.asignaciones:
    print(a)
assert result.status == "OPTIMAL", result.status
assert result.num_asignaciones == 8
print("OK")