import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, RefreshCw, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import type { BloqueHorario, CargaAcademica, Curso, HorarioAsignado, Materia, Profesor } from "../lib/types";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

export default function Horario() {
  const qc = useQueryClient();
  const [view, setView] = useState<"curso" | "profesor">("curso");
  const [cursoId, setCursoId] = useState<string>("");
  const [profesorId, setProfesorId] = useState<string>("");
  const [fDia, setFDia] = useState("");
  const [fMateria, setFMateria] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const { data: resultado = [], isLoading } = useQuery({
    queryKey: ["resultado"],
    queryFn: () => api.get<HorarioAsignado[]>("/timetables/resultado"),
  });
  const { data: cursos = [] } = useQuery({
    queryKey: ["cursos"],
    queryFn: () => api.get<Curso[]>("/cursos"),
  });
  const { data: profesores = [] } = useQuery({
    queryKey: ["profesores"],
    queryFn: () => api.get<Profesor[]>("/profesores"),
  });
  const { data: bloques = [] } = useQuery({
    queryKey: ["bloques"],
    queryFn: () => api.get<BloqueHorario[]>("/bloques"),
  });
  const { data: cargas = [] } = useQuery({
    queryKey: ["cargas"],
    queryFn: () => api.get<CargaAcademica[]>("/cargas"),
  });
  const { data: materias = [] } = useQuery({
    queryKey: ["materias"],
    queryFn: () => api.get<Materia[]>("/materias"),
  });

  const generate = useMutation({
    mutationFn: () => api.post<import("../lib/types").GenerateResult>("/timetables/generate"),
    onSuccess: (data) => {
      setFeedback(`Horario generado: estado ${data.status}, ${data.numAsignaciones} asignaciones.`);
      qc.invalidateQueries({ queryKey: ["resultado"] });
    },
    onError: (err) => setFeedback(err instanceof Error ? err.message : "Error al generar"),
  });

  const clear = useMutation({
    mutationFn: () => api.delete("/timetables/resultado"),
    onSuccess: () => {
      setFeedback("Horario eliminado.");
      qc.invalidateQueries({ queryKey: ["resultado"] });
    },
    onError: (err) => setFeedback(err instanceof Error ? err.message : "Error al limpiar"),
  });

  const requeridas = useMemo(
    () => cargas.reduce((acc, c) => acc + c.bloquesSemanalesRequeridos, 0),
    [cargas]
  );

  const curso = useMemo(() => cursos.find((c) => c.id === Number(cursoId)), [cursos, cursoId]);
  const seccionId = curso?.seccionId;

  const grid = useMemo(() => {
    if (!seccionId) return null;
    const secBloques = bloques
      .filter((b) => b.seccionId === seccionId)
      .sort((a, b) => (a.horaInicio < b.horaInicio ? -1 : 1));
    const periods = Array.from(new Map(secBloques.map((b) => [b.numeroPeriodo, b])).values());
    const cells: Record<string, HorarioAsignado | undefined> = {};
    for (const asig of resultado) {
      if (asig.cargaAcademica.curso.id === Number(cursoId)) {
        cells[`${asig.bloqueHorario.diaSemanaId}-${asig.bloqueHorario.numeroPeriodo}`] = asig;
      }
    }
    return { periods, cells: cells as Record<string, HorarioAsignado> };
  }, [seccionId, cursoId, bloques, resultado]);

  const profesorRows = useMemo(() => {
    if (!profesorId) return [];
    return resultado
      .filter((a) => a.cargaAcademica.profesor.id === Number(profesorId))
      .filter((a) => (fDia ? a.bloqueHorario.diaSemanaId === Number(fDia) : true))
      .filter((a) => (fMateria ? a.cargaAcademica.materia.id === Number(fMateria) : true))
      .sort((a, b) =>
        a.bloqueHorario.diaSemanaId !== b.bloqueHorario.diaSemanaId
          ? a.bloqueHorario.diaSemanaId - b.bloqueHorario.diaSemanaId
          : a.bloqueHorario.horaInicio < b.bloqueHorario.horaInicio
            ? -1
            : 1
      );
  }, [resultado, profesorId, fDia, fMateria]);

  const numAsig = resultado.length;
  const visibleDias = fDia ? DIAS.filter((_, i) => String(i + 1) === fDia) : DIAS;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Horario Generado</h1>
          <p className="text-sm text-slate-500">
            {numAsig > 0
              ? `${numAsig} de ${requeridas} asignaciones en base de datos. Filtra por curso o profesor.`
              : `Aún no hay horario generado (${requeridas} requeridas).`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => clear.mutate()}
            disabled={clear.isPending || numAsig === 0}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
            {clear.isPending ? "Limpiando..." : "Limpiar"}
          </button>
          <button
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {generate.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Generar horario
          </button>
        </div>
      </header>

      {feedback && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          {feedback}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex rounded-lg border border-slate-200 bg-white p-1 text-sm">
          <button
            onClick={() => setView("curso")}
            className={`rounded-md px-3 py-1.5 font-medium ${
              view === "curso" ? "bg-indigo-600 text-white" : "text-slate-600"
            }`}
          >
            Por curso
          </button>
          <button
            onClick={() => setView("profesor")}
            className={`rounded-md px-3 py-1.5 font-medium ${
              view === "profesor" ? "bg-indigo-600 text-white" : "text-slate-600"
            }`}
          >
            Por profesor
          </button>
        </div>
        {view === "curso" ? (
          <select
            value={cursoId}
            onChange={(e) => setCursoId(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          >
            <option value="">Selecciona un curso...</option>
            {cursos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.seccion?.nombre} - {c.nombre}
              </option>
            ))}
          </select>
        ) : (
          <>
            <select
              value={profesorId}
              onChange={(e) => setProfesorId(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            >
              <option value="">Selecciona un profesor...</option>
              {profesores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <select
              value={fMateria}
              onChange={(e) => setFMateria(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            >
              <option value="">Todas las materias</option>
              {materias.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </>
        )}
        <select
          value={fDia}
          onChange={(e) => setFDia(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        >
          <option value="">Todos los días</option>
          {DIAS.map((d, i) => (
            <option key={d} value={i + 1}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-sm text-slate-400">Cargando...</p>}

      {view === "curso" && grid && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Período</th>
                {visibleDias.map((d) => (
                  <th key={d} className="px-4 py-3 text-left font-medium text-slate-600">
                    {d}
                    {d === "Viernes" && <span className="ml-1 text-xs text-amber-600">(esp.)</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {grid.periods.map((p) => {
                const academico = p.esAcademico;
                return (
                  <tr key={p.numeroPeriodo}>
                    <td className="px-4 py-2 whitespace-nowrap text-slate-600">
                      <span className="font-medium text-slate-800">{p.numeroPeriodo}</span>
                      <span className="ml-2 text-xs text-slate-400">
                        {p.horaInicio}-{p.horaFin}
                      </span>
                    </td>
                    {visibleDias.map((d) => {
                      const i = DIAS.indexOf(d);
                      const cell = grid.cells[`${i + 1}-${p.numeroPeriodo}`];
                      return (
                        <td key={i} className="px-4 py-2">
                          {cell ? (
                            <div className="rounded-lg bg-indigo-50 px-3 py-2">
                              <p className="font-semibold text-indigo-800">{cell.cargaAcademica.materia?.nombre}</p>
                              <p className="text-xs text-indigo-600">{cell.cargaAcademica.profesor?.nombre}</p>
                            </div>
                          ) : academico ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <span className="text-xs text-amber-600">{p.numeroPeriodo}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === "profesor" && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Día</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Hora</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Período</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Curso</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Sección</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Materia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {profesorRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    Selecciona un profesor para ver su horario.
                  </td>
                </tr>
              )}
              {profesorRows.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 text-slate-700">{DIAS[a.bloqueHorario.diaSemanaId - 1]}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {a.bloqueHorario.horaInicio}-{a.bloqueHorario.horaFin}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{a.bloqueHorario.numeroPeriodo}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {a.cargaAcademica.curso.nombre}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{a.cargaAcademica.curso.seccion?.nombre ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{a.cargaAcademica.materia.nombre}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}