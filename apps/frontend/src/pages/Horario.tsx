import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, RefreshCw, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import type {
  BloqueHorario,
  CargaAcademica,
  ColaborativaGenerada,
  Curso,
  DiaSemana,
  HorarioAsignado,
  Materia,
  Profesor,
  Reglas,
  ReunionSeccion,
} from "../lib/types";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

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
  const { data: reglas } = useQuery({
    queryKey: ["reglas"],
    queryFn: () => api.get<Reglas>("/reglas"),
  });
  const { data: dias = [] } = useQuery({
    queryKey: ["dias"],
    queryFn: () => api.get<DiaSemana[]>("/dias"),
  });
  const { data: colaborativas = [] } = useQuery({
    queryKey: ["colaborativas"],
    queryFn: () => api.get<ColaborativaGenerada[]>("/timetables/resultado/colaborativas"),
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

  const diasById = useMemo(() => {
    const m = new Map<number, number>();
    for (const d of dias) m.set(d.id, d.numeroDia);
    return m;
  }, [dias]);
  const numeroDeDiaId = (diaId: number) => diasById.get(diaId) ?? diaId;

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
        const nd = numeroDeDiaId(asig.bloqueHorario.diaSemanaId);
        cells[`${nd}-${asig.bloqueHorario.numeroPeriodo}`] = asig;
      }
    }
    return { periods, cells: cells as Record<string, HorarioAsignado> };
  }, [seccionId, cursoId, bloques, resultado, diasById]);

  const pid = Number(profesorId || 0);
  const profSeccionIds = useMemo(() => {
    if (!pid) return new Set<number>();
    const s = new Set<number>();
    for (const c of cargas) {
      if (c.profesor && c.profesor.id === pid && c.curso?.seccionId) s.add(c.curso.seccionId);
    }
    return s;
  }, [cargas, pid]);

  const profSeccionBaseId = useMemo(
    () => profesores.find((p) => p.id === pid)?.seccionBaseId ?? 0,
    [profesores, pid]
  );

  const deptosDocente = useMemo(() => {
    if (!pid) return new Set<number>();
    const s = new Set<number>();
    for (const c of cargas) {
      if (!c.profesor || c.profesor.id !== pid) continue;
      const m = materias.find((mx) => mx.id === c.materiaId);
      if (m?.departamentoId) s.add(m.departamentoId);
    }
    return s;
  }, [cargas, materias, pid]);

  const filasProfesor = useMemo(() => {
    if (!pid) return [];
    const rows: { inicio: string; fin: string; tipo: "academico" | "evento" }[] = [];
    const seen = new Map<string, "academico" | "evento">();
    const add = (inicio: string, fin: string, tipo: "academico" | "evento") => {
      const k = `${inicio}-${fin}`;
      const prev = seen.get(k);
      if (!prev) {
        seen.set(k, tipo);
        rows.push({ inicio, fin, tipo });
      } else if (prev === "evento" && tipo === "academico") {
        seen.set(k, "academico");
        const r = rows.find((x) => x.inicio === inicio && x.fin === fin);
        if (r) r.tipo = "academico";
      }
    };
    for (const b of bloques) {
      if (profSeccionIds.has(b.seccionId) && b.esAcademico) add(b.horaInicio, b.horaFin, "academico");
    }
    if (!fMateria) {
      for (const r of reglas?.reunionesSeccion ?? []) {
        if (r.secciones.some((s) => s.id === profSeccionBaseId)) add(r.horaInicio, r.horaFin, "evento");
      }
      for (const col of colaborativas) {
        if (deptosDocente.has(col.departamentoId)) add(col.horaInicio, col.horaFin, "evento");
      }
    }
    rows.sort((a, b) => toMinutes(a.inicio) - toMinutes(b.inicio) || toMinutes(a.fin) - toMinutes(b.fin));
    return rows;
  }, [pid, bloques, profSeccionIds, profSeccionBaseId, reglas, colaborativas, deptosDocente, fMateria]);

  const profClases = useMemo(() => {
    const m = new Map<string, HorarioAsignado>();
    if (!pid) return m;
    for (const a of resultado) {
      if (a.cargaAcademica.profesor.id !== pid) continue;
      if (fMateria && a.cargaAcademica.materia.id !== Number(fMateria)) continue;
      const nd = numeroDeDiaId(a.bloqueHorario.diaSemanaId);
      m.set(`${nd}-${a.bloqueHorario.horaInicio}-${a.bloqueHorario.horaFin}`, a);
    }
    return m;
  }, [resultado, pid, fMateria, diasById]);

  const reunionEnCelda = (nd: number, inicio: string, fin: string): ReunionSeccion | undefined =>
    reglas?.reunionesSeccion.find(
      (r) =>
        r.secciones.some((s) => s.id === profSeccionBaseId) &&
        numeroDeDiaId(r.diaSemanaId) === nd &&
        toMinutes(inicio) < toMinutes(r.horaFin) &&
        toMinutes(r.horaInicio) < toMinutes(fin)
    );

  const colabEnCelda = (nd: number, inicio: string, fin: string) =>
    colaborativas.find(
      (col) =>
        deptosDocente.has(col.departamentoId) &&
        numeroDeDiaId(col.diaSemanaId) === nd &&
        toMinutes(inicio) < toMinutes(col.horaFin) &&
        toMinutes(col.horaInicio) < toMinutes(fin)
    );

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
                      const esDeporte = reglas?.deportes.some(
                        (dep) =>
                          dep.seccionId === seccionId &&
                          numeroDeDiaId(dep.diaSemanaId) === i + 1 &&
                          dep.numeroPeriodo === p.numeroPeriodo
                      );
                      return (
                        <td key={i} className="px-4 py-2">
                          {cell ? (
                            <div className="rounded-lg bg-indigo-50 px-3 py-2">
                              <p className="font-semibold text-indigo-800">{cell.cargaAcademica.materia?.nombre}</p>
                              <p className="text-xs text-indigo-600">{cell.cargaAcademica.profesor?.nombre}</p>
                            </div>
                          ) : esDeporte ? (
                            <div className="rounded-lg bg-emerald-50 px-3 py-2">
                              <p className="font-semibold text-emerald-800">Día de deportes</p>
                              <p className="text-xs text-emerald-600">Bloque reservado</p>
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
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Hora</th>
                {visibleDias.map((d) => (
                  <th key={d} className="px-4 py-3 text-left font-medium text-slate-600">
                    {d}
                    {d === "Viernes" && <span className="ml-1 text-xs text-amber-600">(esp.)</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filasProfesor.length === 0 && (
                <tr>
                  <td colSpan={visibleDias.length + 1} className="px-4 py-6 text-center text-slate-400">
                    Selecciona un profesor para ver su horario semanal.
                  </td>
                </tr>
              )}
              {filasProfesor.map((row) => (
                <tr key={`${row.inicio}-${row.fin}`}>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-600">
                    <span className="text-xs text-slate-400">{row.inicio}-{row.fin}</span>
                    {row.tipo === "evento" && (
                      <span className="ml-1 text-xs" title="Hueco reservado">
                        <span className="text-purple-500">●</span>
                      </span>
                    )}
                  </td>
                  {visibleDias.map((d) => {
                    const nd = DIAS.indexOf(d) + 1;
                    const clase = profClases.get(`${nd}-${row.inicio}-${row.fin}`);
                    if (clase) {
                      return (
                        <td key={d} className="px-4 py-2">
                          <div className="rounded-lg bg-indigo-50 px-3 py-2">
                            <p className="font-semibold text-indigo-800">{clase.cargaAcademica.curso.nombre}</p>
                            <p className="text-xs text-indigo-600">
                              {clase.cargaAcademica.curso.seccion?.nombre} · {clase.cargaAcademica.materia.nombre}
                            </p>
                          </div>
                        </td>
                      );
                    }
                    const reu = reunionEnCelda(nd, row.inicio, row.fin);
                    if (reu) {
                      return (
                        <td key={d} className="px-4 py-2">
                          <div className="rounded-lg bg-purple-50 px-3 py-2">
                            <p className="font-semibold text-purple-800">
                              Reunión: {reu.secciones.map((s) => s.nombre).join(" + ")}
                            </p>
                            <p className="text-xs text-purple-600">{reu.horaInicio}–{reu.horaFin}</p>
                          </div>
                        </td>
                      );
                    }
                    const col = colabEnCelda(nd, row.inicio, row.fin);
                    if (col) {
                      return (
                        <td key={d} className="px-4 py-2">
                          <div className="rounded-lg bg-amber-50 px-3 py-2">
                            <p className="font-semibold text-amber-800">
                              Colaborativa · {col.departamento.nombre}
                            </p>
                            <p className="text-xs text-amber-600">{col.horaInicio}–{col.horaFin}</p>
                          </div>
                        </td>
                      );
                    }
                    if (row.tipo === "academico") {
                      return (
                        <td key={d} className="px-4 py-2">
                          <span className="text-slate-300">—</span>
                        </td>
                      );
                    }
                    return <td key={d} className="px-4 py-2" />;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-600">
        <span className="font-medium text-slate-800">Leyenda:</span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-indigo-100" /> Clase asignada
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-emerald-100" /> Día de deportes
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-purple-100" /> Reunión de sección
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-amber-100" /> Colaborativa de departamento
        </span>
      </div>
    </div>
  );
}