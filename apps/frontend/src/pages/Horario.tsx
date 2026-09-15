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

  const cursoBloques = useMemo(
    () => (seccionId ? bloques.filter((b) => b.seccionId === seccionId) : []),
    [seccionId, bloques]
  );
  const cursoClases = useMemo(() => {
    const m: Record<string, HorarioAsignado[]> = {};
    for (const a of resultado) {
      if (a.cargaAcademica.curso.id === Number(cursoId)) {
        const nd = numeroDeDiaId(a.bloqueHorario.diaSemanaId);
        const key = `${nd}-${a.bloqueHorario.numeroPeriodo}`;
        (m[key] ??= []).push(a);
      }
    }
    for (const arr of Object.values(m)) {
      arr.sort((a, b) => (a.cargaAcademica.materia?.nombre ?? "").localeCompare(b.cargaAcademica.materia?.nombre ?? ""));
    }
    return m;
  }, [cursoId, resultado, diasById]);

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

  const profSeccionBaseId = useMemo(
    () => profesores.find((p) => p.id === pid)?.seccionBaseId ?? 0,
    [profesores, pid]
  );

  const profDeptoId = useMemo(
    () => profesores.find((p) => p.id === pid)?.departamentoId ?? null,
    [profesores, pid]
  );

  const profBaseSecBloques = useMemo(
    () => bloques.filter((b) => b.seccionId === profSeccionBaseId),
    [bloques, profSeccionBaseId]
  );

  const profClasesByPeriod = useMemo(() => {
    const m = new Map<string, HorarioAsignado[]>();
    if (!pid) return m;
    for (const a of resultado) {
      if (a.cargaAcademica.profesor.id !== pid) continue;
      if (fMateria && a.cargaAcademica.materia.id !== Number(fMateria)) continue;
      const nd = numeroDeDiaId(a.bloqueHorario.diaSemanaId);
      const match = profBaseSecBloques.find(
        (b) =>
          numeroDeDiaId(b.diaSemanaId) === nd &&
          toMinutes(a.bloqueHorario.horaInicio) < toMinutes(b.horaFin) &&
          toMinutes(b.horaInicio) < toMinutes(a.bloqueHorario.horaFin)
      );
      if (!match) continue;
      const key = `${nd}-${match.numeroPeriodo}`;
      const arr = m.get(key) ?? [];
      arr.push(a);
      m.set(key, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.cargaAcademica.materia?.nombre ?? "").localeCompare(b.cargaAcademica.materia?.nombre ?? ""));
    }
    return m;
  }, [resultado, pid, fMateria, profBaseSecBloques, diasById]);

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

  const profPorDia = useMemo(() => {
    type Entry = {
      bloque: BloqueHorario;
      reu?: ReunionSeccion;
      col?: ColaborativaGenerada;
      clases?: HorarioAsignado[];
      skip?: boolean;
    };
    const m = new Map<number, Entry[]>();
    if (!pid || !profSeccionBaseId) return m;
    for (const d of visibleDias) {
      const nd = DIAS.indexOf(d) + 1;
      const bloquesDia = profBaseSecBloques
        .filter((b) => numeroDeDiaId(b.diaSemanaId) === nd)
        .sort((a, b) => toMinutes(a.horaInicio) - toMinutes(b.horaInicio));
      const entries: Entry[] = [];
      let mergeId: string | null = null;
      for (const b of bloquesDia) {
        const reu = reunionEnCelda(nd, b.horaInicio, b.horaFin);
        const col = colabEnCelda(nd, b.horaInicio, b.horaFin);
        const id = reu || col ? `${reu ? `r${reu.id}` : "n"}|${col ? `c${col.id}` : "n"}` : null;
        if (id) {
          if (id === mergeId) {
            entries.push({ bloque: b, skip: true });
          } else {
            mergeId = id;
            entries.push({ bloque: b, reu, col });
          }
        } else {
          mergeId = null;
          entries.push({ bloque: b, clases: profClasesByPeriod.get(`${nd}-${b.numeroPeriodo}`) });
        }
      }
      m.set(nd, entries);
    }
    return m;
  }, [pid, profSeccionBaseId, visibleDias, profBaseSecBloques, profClasesByPeriod, reglas, colaborativas, profDeptoId, diasById]);

  const resumenProfesor = useMemo(() => {
    if (!pid || !profSeccionBaseId) return null;
    const esEsp = (nd: number) => diasPorNumero.get(nd) ?? false;
    const regularPeriodos = new Set<string>();
    const viernesPeriodos = new Set<string>();
    let regMin = Infinity, regMax = 0, vieMin = Infinity, vieMax = 0;
    for (const a of resultado) {
      if (a.cargaAcademica.profesor.id !== pid) continue;
      const nd = numeroDeDiaId(a.bloqueHorario.diaSemanaId);
      const ini = toMinutes(a.bloqueHorario.horaInicio);
      const fin = toMinutes(a.bloqueHorario.horaFin);
      if (esEsp(nd)) {
        viernesPeriodos.add(a.bloqueHorario.numeroPeriodo);
        vieMin = Math.min(vieMin, ini);
        vieMax = Math.max(vieMax, fin);
      } else {
        regularPeriodos.add(a.bloqueHorario.numeroPeriodo);
        regMin = Math.min(regMin, ini);
        regMax = Math.max(regMax, fin);
      }
    }
    const regular = regularPeriodos.size > 0 ? { n: regularPeriodos.size, ini: hhmm(regMin), fin: hhmm(regMax) } : null;
    const viernes = viernesPeriodos.size > 0 ? { n: viernesPeriodos.size, ini: hhmm(vieMin), fin: hhmm(vieMax) } : null;
    const nReu = (reglas?.reunionesSeccion ?? []).filter((r) => r.secciones.some((s) => s.id === profSeccionBaseId)).length;
    const nCol = colaborativas.filter((c) => profDeptoId !== null && c.departamentoId === profDeptoId).length;
    return { regular, viernes, nReu, nCol };
  }, [pid, resultado, reglas, colaborativas, profSeccionBaseId, profDeptoId, diasById, diasPorNumero]);

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

      {view === "curso" && cursoBloques.length > 0 && (
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
                <CabeceraGrilla labelColumna="" columnas={columnasGrilla(diasPorNumero, visibleDias)} />
              </thead>
              <tbody>
                <tr>
                  <td className="w-10" />
                  {visibleDias.map((d) => {
                    const nd = DIAS.indexOf(d) + 1;
                    const esEspecialDia = diasPorNumero.get(nd) ?? false;
                    const bloquesDia = cursoBloques
                      .filter((b) => numeroDeDiaId(b.diaSemanaId) === nd)
                      .sort((a, b) => toMinutes(a.horaInicio) - toMinutes(b.horaInicio));
                    return (
                      <td key={nd} className={`align-top px-3 py-3 ${esEspecialDia ? "border-l-2 border-dashed border-amber-300" : ""}`}>
                        <div className="space-y-1.5">
                          {bloquesDia.map((b) => {
                            const cell = cursoClases[`${nd}-${b.numeroPeriodo}`];
                            const esDeporte = reglas?.deportes.some(
                              (dep) =>
                                dep.seccionId === seccionId &&
                                numeroDeDiaId(dep.diaSemanaId) === nd &&
                                dep.numeroPeriodo === b.numeroPeriodo
                            );
                            if (cell) {
                              return cell.length > 1 ? (
                                <div key={b.id} className="rounded-lg bg-indigo-50 px-3 py-2 shadow-sm">
                                  <div className="flex flex-wrap items-center gap-y-0.5">
                                    {cell.map((a, idx) => (
                                      <span key={a.id} className="whitespace-nowrap font-semibold text-indigo-800">
                                        {idx > 0 && <span className="mx-1.5 font-normal text-indigo-400">/</span>}
                                        {a.cargaAcademica.materia?.nombre}
                                      </span>
                                    ))}
                                  </div>
                                  <p className="text-[10px] text-indigo-400">
                                    {cell[0].bloqueHorario.horaInicio}-{cell[0].bloqueHorario.horaFin}
                                  </p>
                                </div>
                              ) : (
                                <div key={b.id} className="rounded-lg bg-indigo-50 px-3 py-2 shadow-sm">
                                  <p className="font-semibold text-indigo-800">
                                    {cell[0].cargaAcademica.materia?.nombre}
                                  </p>
                                  <p className="text-[10px] text-indigo-400">
                                    {cell[0].bloqueHorario.horaInicio}-{cell[0].bloqueHorario.horaFin}
                                  </p>
                                </div>
                              );
                            }
                            if (esDeporte) {
                              return (
                                <div key={b.id} className="rounded-lg bg-emerald-50 px-3 py-2 shadow-sm">
                                  <p className="font-semibold text-emerald-800">Día de deportes</p>
                                  <p className="text-xs text-emerald-600">Bloque reservado</p>
                                </div>
                              );
                            }
                            if (!b.esAcademico) {
                              return (
                                <div key={b.id} className="rounded-lg bg-amber-50 px-3 py-2">
                                  <p className="font-semibold text-amber-700">{b.numeroPeriodo}</p>
                                  <p className="text-xs text-amber-600">
                                    {b.horaInicio}-{b.horaFin} · Recreo
                                  </p>
                                </div>
                              );
                            }
                            return (
                              <span key={b.id} className="block text-sm text-slate-400">
                                Libre {b.horaInicio}-{b.horaFin}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "profesor" && (
        <div className="space-y-2">
          {resumenProfesor && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
              {resumenProfesor.regular && (
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-indigo-400" />
                  <span className="font-medium text-slate-800">Lun–Jue:</span>
                  {resumenProfesor.regular.n} períodos ({resumenProfesor.regular.ini}–{resumenProfesor.regular.fin})
                </span>
              )}
              {resumenProfesor.viernes && (
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
                  <span className="font-medium text-slate-800">Viernes (especial):</span>
                  {resumenProfesor.viernes.n} períodos ({resumenProfesor.viernes.ini}–{resumenProfesor.viernes.fin})
                </span>
              )}
              {resumenProfesor.nReu > 0 && (
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-purple-300" />
                  <span className="font-medium text-slate-800">Reuniones de sección:</span>
                  {resumenProfesor.nReu}
                </span>
              )}
              {resumenProfesor.nCol > 0 && (
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-amber-300" />
                  <span className="font-medium text-slate-800">Colaborativas de departamento:</span>
                  {resumenProfesor.nCol}
                </span>
              )}
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <CabeceraGrilla labelColumna="" columnas={columnasGrilla(diasPorNumero, visibleDias)} />
              </thead>
              <tbody>
                <tr>
                  <td className="w-10" />
                  {visibleDias.map((d) => {
                    const nd = DIAS.indexOf(d) + 1;
                    const esEspCol = diasPorNumero.get(nd) ?? false;
                    const entries = profPorDia.get(nd) ?? [];
                    return (
                      <td key={nd} className={`align-top px-3 py-3 ${esEspCol ? "border-l-2 border-dashed border-amber-300" : ""}`}>
                        <div className="space-y-1.5">
                          {entries.length === 0 && (
                            <span className="text-xs text-slate-300">{pid ? "—" : "Selecciona un profesor"}</span>
                          )}
                          {entries.map((e) => {
                            if (e.skip) return null;
                            if (e.reu || e.col) {
                              return (
                                <div key={e.bloque.id} className="space-y-1">
                                  {e.reu && (
                                    <div className="rounded-lg bg-purple-50 px-3 py-2 shadow-sm">
                                      <p className="font-semibold text-purple-800">
                                        Reunión: {e.reu.secciones.map((s) => s.nombre).join(" + ")}
                                      </p>
                                      <p className="text-xs text-purple-600">{e.reu.horaInicio}–{e.reu.horaFin}</p>
                                    </div>
                                  )}
                                  {e.col && (
                                    <div className={`rounded-lg bg-amber-50 px-3 py-2 shadow-sm ${e.reu ? "mt-1" : ""}`}>
                                      <p className="font-semibold text-amber-800">
                                        Colaborativa · {e.col.departamento.nombre}
                                      </p>
                                      <p className="text-xs text-amber-600">{e.col.horaInicio}–{e.col.horaFin}</p>
                                    </div>
                                  )}
                                </div>
                              );
                            }
                            if (e.clases && e.clases.length > 0) {
                              return e.clases.length > 1 ? (
                                <div key={e.bloque.id} className="rounded-lg bg-indigo-50 px-3 py-2 shadow-sm">
                                  <div className="flex flex-wrap items-center gap-y-0.5">
                                    {e.clases.map((a, idx) => (
                                      <span key={a.id} className="whitespace-nowrap font-semibold text-indigo-800">
                                        {idx > 0 && <span className="mx-1.5 font-normal text-indigo-400">/</span>}
                                        {a.cargaAcademica.materia?.nombre}
                                      </span>
                                    ))}
                                  </div>
                                  <p className="text-xs text-indigo-600">
                                    {e.clases.map((a) => `${a.cargaAcademica.curso.nombre} · ${a.cargaAcademica.curso.seccion?.nombre}`).join(" · ")}
                                  </p>
                                  <p className="text-[10px] text-indigo-400">
                                    {e.clases[0].bloqueHorario.horaInicio}-{e.clases[0].bloqueHorario.horaFin}
                                  </p>
                                </div>
                              ) : (
                                <div key={e.bloque.id} className="rounded-lg bg-indigo-50 px-3 py-2 shadow-sm">
                                  <p className="font-semibold text-indigo-800">{e.clases[0].cargaAcademica.materia?.nombre}</p>
                                  <p className="text-xs text-indigo-600">
                                    {e.clases[0].cargaAcademica.curso.nombre} · {e.clases[0].cargaAcademica.curso.seccion?.nombre}
                                  </p>
                                  <p className="text-[10px] text-indigo-400">
                                    {e.clases[0].bloqueHorario.horaInicio}-{e.clases[0].bloqueHorario.horaFin}
                                  </p>
                                </div>
                              );
                            }
                            if (!e.bloque.esAcademico) {
                              return (
                                <div key={e.bloque.id} className="rounded-lg bg-amber-50 px-3 py-2">
                                  <p className="font-semibold text-amber-700">{e.bloque.numeroPeriodo}</p>
                                  <p className="text-xs text-amber-600">
                                    {e.bloque.horaInicio}-{e.bloque.horaFin} · Recreo
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
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