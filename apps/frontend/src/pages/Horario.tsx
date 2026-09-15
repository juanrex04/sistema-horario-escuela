import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, RefreshCw, Trash2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import CabeceraGrilla, { columnasGrilla } from "../components/CabeceraGrilla";
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

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export default function Horario() {
  const qc = useQueryClient();
  const [view, setView] = useState<"curso" | "profesor">("curso");
  const [cursoId, setCursoId] = useState<string>("");
  const [profesorId, setProfesorId] = useState<string>("");
  const [fDia, setFDia] = useState("");
  const [fMateria, setFMateria] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [genError, setGenError] = useState<{
    message: string;
    causas?: string[];
    sugerencias?: string[];
  } | null>(null);

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
      setGenError(null);
      const extra = data.numConsecutivos && data.numConsecutivos > 0
        ? `, ${data.numConsecutivos} clases consecutivas entre grupos del mismo grado`
        : "";
      const reparto = data.numDiasUsados && data.numDiasUsados > 0
        ? `, bloques repartidos en ${data.numDiasUsados} días`
        : "";
      setFeedback(`Horario generado: estado ${data.status}, ${data.numAsignaciones} asignaciones${extra}${reparto}.`);
      qc.invalidateQueries({ queryKey: ["resultado"] });
    },
    onError: (err) => {
      setFeedback(null);
      const message = err instanceof Error ? err.message : "Error al generar";
      const body = (err instanceof ApiError ? err.data : undefined) as
        | { causas?: string[]; sugerencias?: string[] }
        | undefined;
      setGenError({
        message,
        causas: Array.isArray(body?.causas) ? body.causas : undefined,
        sugerencias: Array.isArray(body?.sugerencias) ? body.sugerencias : undefined,
      });
    },
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

  const diasPorNumero = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const d of dias) m.set(d.numeroDia, d.esHorarioEspecial);
    return m;
  }, [dias]);

  const curso = useMemo(() => cursos.find((c) => c.id === Number(cursoId)), [cursos, cursoId]);
  const seccionId = curso?.seccionId;

  const grid = useMemo(() => {
    if (!seccionId) return null;
    const secBloques = bloques.filter((b) => b.seccionId === seccionId);
    const ordenKey = new Map<string, number>();
    const ordenFb = new Map<string, number>();
    for (const b of secBloques) {
      const nd = numeroDeDiaId(b.diaSemanaId);
      const t = toMinutes(b.horaInicio);
      if (!(diasPorNumero.get(nd) ?? false) && !ordenKey.has(b.numeroPeriodo)) ordenKey.set(b.numeroPeriodo, t);
      if (!ordenFb.has(b.numeroPeriodo)) ordenFb.set(b.numeroPeriodo, t);
    }
    const clave = (p: string) => ordenKey.get(p) ?? ordenFb.get(p) ?? 0;
    const periods = Array.from(new Map(secBloques.map((b) => [b.numeroPeriodo, b])).values()).sort(
      (a, b) => clave(a.numeroPeriodo) - clave(b.numeroPeriodo)
    );
    const cells: Record<string, HorarioAsignado[]> = {};
    for (const asig of resultado) {
      if (asig.cargaAcademica.curso.id === Number(cursoId)) {
        const nd = numeroDeDiaId(asig.bloqueHorario.diaSemanaId);
        const key = `${nd}-${asig.bloqueHorario.numeroPeriodo}`;
        (cells[key] ??= []).push(asig);
      }
    }
    for (const arr of Object.values(cells)) {
      arr.sort((a, b) =>
        (a.cargaAcademica.materia?.nombre ?? "").localeCompare(b.cargaAcademica.materia?.nombre ?? "")
      );
    }
    const bloquesPorCelda: Record<string, BloqueHorario | undefined> = {};
    for (const b of secBloques) bloquesPorCelda[`${numeroDeDiaId(b.diaSemanaId)}-${b.numeroPeriodo}`] = b;
    return { periods, cells, bloquesPorCelda };
  }, [seccionId, cursoId, bloques, resultado, diasById, diasPorNumero]);

  const resumenCurso = useMemo(() => {
    if (!seccionId) return null;
    const secAcad = bloques.filter((b) => b.seccionId === seccionId && b.esAcademico);
    const numDe = (b: BloqueHorario) => numeroDeDiaId(b.diaSemanaId);
    const esEsp = (b: BloqueHorario) => diasPorNumero.get(numDe(b)) ?? false;
    const resumen = (pred: (b: BloqueHorario) => boolean) => {
      const arr = secAcad.filter(pred);
      if (arr.length === 0) return null;
      const inicios = arr.map((b) => toMinutes(b.horaInicio));
      const fines = arr.map((b) => toMinutes(b.horaFin));
      return {
        n: arr.length,
        inicio: hhmm(Math.min(...inicios)),
        fin: hhmm(Math.max(...fines)),
      };
    };
    const regular = resumen((b) => !esEsp(b));
    const viernes = resumen((b) => esEsp(b));
    const reservados = secAcad.filter((b) => {
      if (reglas?.deportes.some((d) => d.seccionId === seccionId && numDe(b) === numeroDeDiaId(d.diaSemanaId) && d.numeroPeriodo === b.numeroPeriodo)) {
        return true;
      }
      if (
        reglas?.reunionesSeccion.some(
          (r) =>
            r.secciones.some((s) => s.id === seccionId) &&
            toMinutes(b.horaInicio) < toMinutes(r.horaFin) &&
            toMinutes(r.horaInicio) < toMinutes(b.horaFin),
        )
      ) {
        return true;
      }
      return false;
    }).length;
    return { regular, viernes, reservados };
  }, [seccionId, bloques, reglas, diasById, diasPorNumero]);

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

  const profDeptoId = useMemo(
    () => profesores.find((p) => p.id === pid)?.departamentoId ?? null,
    [profesores, pid]
  );

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
        if (profDeptoId !== null && col.departamentoId === profDeptoId) add(col.horaInicio, col.horaFin, "evento");
      }
    }
    rows.sort((a, b) => toMinutes(a.inicio) - toMinutes(b.inicio) || toMinutes(a.fin) - toMinutes(b.fin));
    return rows;
  }, [pid, bloques, profSeccionIds, profSeccionBaseId, reglas, colaborativas, profDeptoId, fMateria]);

  const profClases = useMemo(() => {
    const m = new Map<string, HorarioAsignado[]>();
    if (!pid) return m;
    for (const a of resultado) {
      if (a.cargaAcademica.profesor.id !== pid) continue;
      if (fMateria && a.cargaAcademica.materia.id !== Number(fMateria)) continue;
      const nd = numeroDeDiaId(a.bloqueHorario.diaSemanaId);
      const key = `${nd}-${a.bloqueHorario.horaInicio}-${a.bloqueHorario.horaFin}`;
      const arr = m.get(key) ?? [];
      arr.push(a);
      m.set(key, arr);
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
        profDeptoId !== null &&
        col.departamentoId === profDeptoId &&
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

      {genError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <p className="font-semibold">{genError.message}</p>
          {genError.causas && genError.causas.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {genError.causas.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
          {genError.sugerencias && genError.sugerencias.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
              <p className="font-medium">Sugerencias</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {genError.sugerencias.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
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
        <div className="space-y-2">
          {resumenCurso && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
              {resumenCurso.regular && (
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-indigo-400" />
                  <span className="font-medium text-slate-800">Lun–Jue:</span>
                  {resumenCurso.regular.n} períodos ({resumenCurso.regular.inicio}–{resumenCurso.regular.fin})
                </span>
              )}
              {resumenCurso.viernes && (
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
                  <span className="font-medium text-slate-800">Viernes (especial):</span>
                  {resumenCurso.viernes.n} períodos ({resumenCurso.viernes.inicio}–{resumenCurso.viernes.fin})
                </span>
              )}
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-slate-400" />
                <span className="font-medium text-slate-800">Reservados:</span>
                {resumenCurso.reservados} bloques (deportes y reunión de sección)
              </span>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <CabeceraGrilla labelColumna="Período" columnas={columnasGrilla(diasPorNumero, visibleDias)} />
              </thead>
              <tbody className="divide-y divide-slate-100">
                {grid.periods.map((p) => (
                    <tr key={p.numeroPeriodo}>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className="font-medium text-slate-800">{p.numeroPeriodo}</span>
                      </td>
                      {visibleDias.map((d) => {
                        const i = DIAS.indexOf(d);
                        const nd = i + 1;
                        const cell = grid.cells[`${nd}-${p.numeroPeriodo}`];
                        const bloque = grid.bloquesPorCelda[`${nd}-${p.numeroPeriodo}`];
                        const esDeporte = reglas?.deportes.some(
                          (dep) =>
                            dep.seccionId === seccionId &&
                            numeroDeDiaId(dep.diaSemanaId) === nd &&
                            dep.numeroPeriodo === p.numeroPeriodo
                        );
                        const esEspecialDia = diasPorNumero.get(nd) ?? false;
                        return (
                          <td key={i} className={`px-4 py-2 ${esEspecialDia ? "border-l-2 border-dashed border-amber-300" : ""}`}>
                            {cell ? (
                              cell.length > 1 ? (
                                <div className="rounded-lg bg-indigo-50 px-3 py-2 shadow-sm">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                    {cell.map((a) => (
                                      <span key={a.id} className="whitespace-nowrap font-semibold text-indigo-800">
                                        {a.cargaAcademica.materia?.nombre}
                                      </span>
                                    ))}
                                  </div>
                                  <p className="text-xs text-indigo-600">
                                    {cell.map((a) => a.cargaAcademica.profesor?.nombre).join(" · ")}
                                  </p>
                                  <p className="text-[10px] text-indigo-400">
                                    {cell[0].bloqueHorario.horaInicio}-{cell[0].bloqueHorario.horaFin} · Eligen los estudiantes
                                  </p>
                                </div>
                              ) : (
                                <div className="rounded-lg bg-indigo-50 px-3 py-2 shadow-sm">
                                  <p className="font-semibold text-indigo-800">
                                    {cell[0].cargaAcademica.materia?.nombre}
                                  </p>
                                  <p className="text-xs text-indigo-600">
                                    {cell[0].cargaAcademica.profesor?.nombre}
                                  </p>
                                  <p className="text-[10px] text-indigo-400">
                                    {cell[0].bloqueHorario.horaInicio}-{cell[0].bloqueHorario.horaFin}
                                  </p>
                                </div>
                              )
                            ) : esDeporte ? (
                              <div className="rounded-lg bg-emerald-50 px-3 py-2 shadow-sm">
                                <p className="font-semibold text-emerald-800">Día de deportes</p>
                                <p className="text-xs text-emerald-600">Bloque reservado</p>
                              </div>
                            ) : bloque ? (
                              bloque.esAcademico ? (
                                <span className="text-sm text-slate-400">
                                  Libre {bloque.horaInicio}-{bloque.horaFin}
                                </span>
                              ) : (
                                <span className="text-xs text-amber-600">
                                  {bloque.numeroPeriodo} · {bloque.horaInicio}-{bloque.horaFin} · Recreo
                                </span>
                              )
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
</tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "profesor" && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <CabeceraGrilla labelColumna="Hora" columnas={columnasGrilla(diasPorNumero, visibleDias)} />
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
                    const esEspCol = diasPorNumero.get(nd) ?? false;
                    const clase = profClases.get(`${nd}-${row.inicio}-${row.fin}`);
                    if (clase) {
                      return (
                        <td key={d} className={`px-4 py-2 ${esEspCol ? "border-l-2 border-dashed border-amber-300" : ""}`}>
                          <div className={clase.length > 1 ? "space-y-1" : undefined}>
                            {clase.map((a) => (
                              <div
                                key={a.id}
                                className={
                                  clase.length > 1
                                    ? "rounded-lg bg-indigo-50 px-2 py-1 shadow-sm"
                                    : "rounded-lg bg-indigo-50 px-3 py-2 shadow-sm"
                                }
                              >
                                <p className="font-semibold text-indigo-800">
                                  {a.cargaAcademica.curso.nombre}
                                </p>
                                <p className="text-xs text-indigo-600">
                                  {a.cargaAcademica.curso.seccion?.nombre} ·{" "}
                                  {a.cargaAcademica.materia.nombre}
                                </p>
                              </div>
                            ))}
                            {clase.length > 1 && (
                              <p className="text-[10px] font-medium text-indigo-400">
                                Eligen los estudiantes
                              </p>
                            )}
                          </div>
                        </td>
                      );
                    }
                    const reu = reunionEnCelda(nd, row.inicio, row.fin);
                    if (reu) {
                      return (
                        <td key={d} className={`px-4 py-2 ${esEspCol ? "border-l-2 border-dashed border-amber-300" : ""}`}>
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
                        <td key={d} className={`px-4 py-2 ${esEspCol ? "border-l-2 border-dashed border-amber-300" : ""}`}>
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
                        <td key={d} className={`px-4 py-2 ${esEspCol ? "border-l-2 border-dashed border-amber-300" : ""}`}>
                          <span className="text-slate-300">—</span>
                        </td>
                      );
                    }
                    return <td key={d} className={`px-4 py-2 ${esEspCol ? "border-l-2 border-dashed border-amber-300" : ""}`} />;
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