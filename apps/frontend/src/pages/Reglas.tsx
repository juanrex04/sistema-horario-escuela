import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Handshake, Dumbbell, Users, ChevronDown, Shuffle } from "lucide-react";
import { api } from "../lib/api";
import { useCatalogQuery } from "../lib/queries";
import { TextField, SelectField } from "../components/fields";
import Modal from "../components/Modal";
import type {
  ColaborativaGenerada,
  Departamento,
  DiaSemana,
  Materia,
  Reglas,
  Seccion,
  BloqueHorario,
} from "../lib/types";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie"];

type ReunionDraft = { diaSemanaId: number; horaInicio: string; horaFin: string; seccionIds: number[] };
type DeporteDraft = { seccionId: number; diaSemanaIds: number[]; numeroPeriodo: string };
type DeporteFila = { seccionId: number; diaSemanaId: number; numeroPeriodo: string };
type ParDraft = { materiaAId: number; materiaBId: number };

function parNormalizado(a: number, b: number) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

export default function Reglas() {
  const qc = useQueryClient();
  const [reuniones, setReuniones] = useState<ReunionDraft[]>([]);
  const [deportes, setDeportes] = useState<DeporteDraft[]>([]);
  const [pares, setPares] = useState<ParDraft[]>([]);

  const aplicar = (data: Reglas) => {
    setReuniones(
      data.reunionesSeccion.map((r) => ({
        diaSemanaId: r.diaSemanaId,
        horaInicio: r.horaInicio,
        horaFin: r.horaFin,
        seccionIds: r.secciones.map((s) => s.id),
      }))
    );
    const agrupados = new Map<string, DeporteDraft>();
    for (const d of data.deportes) {
      const k = `${d.seccionId}_${d.numeroPeriodo}`;
      const e = agrupados.get(k) ?? { seccionId: d.seccionId, diaSemanaIds: [], numeroPeriodo: d.numeroPeriodo };
      if (!e.diaSemanaIds.includes(d.diaSemanaId)) e.diaSemanaIds.push(d.diaSemanaId);
      agrupados.set(k, e);
    }
    for (const e of agrupados.values()) e.diaSemanaIds.sort((a, b) => a - b);
    setDeportes(Array.from(agrupados.values()));
    setPares(data.materiasMismoBloque.map((p) => ({ materiaAId: p.materiaAId, materiaBId: p.materiaBId })));
  };

  const { data: reglas, dataUpdatedAt, refetch: refetchReglas } = useQuery({
    queryKey: ["reglas"],
    queryFn: () => api.get<Reglas>("/reglas"),
  });
  const { data: secciones = [] } = useCatalogQuery<Seccion[]>("secciones", "/secciones");
  const { data: dias = [] } = useCatalogQuery<DiaSemana[]>("dias", "/dias");
  const { data: bloques = [] } = useCatalogQuery<BloqueHorario[]>("bloques", "/bloques");
  const { data: departamentos = [] } = useCatalogQuery<Departamento[]>("departamentos", "/departamentos");
  const { data: materias = [] } = useCatalogQuery<Materia[]>("materias", "/materias");
  const { data: colaborativas = [] } = useQuery({
    queryKey: ["colaborativas"],
    queryFn: () => api.get<ColaborativaGenerada[]>("/timetables/resultado/colaborativas"),
  });

  useEffect(() => {
    if (reglas) aplicar(reglas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt]);

  const [reunionOpen, setReunionOpen] = useState(false);
  const [reunionIdx, setReunionIdx] = useState<number | null>(null);
  const [rDraft, setRDraft] = useState<ReunionDraft>({ diaSemanaId: 0, horaInicio: "12:00", horaFin: "13:00", seccionIds: [] });

  const [deporteOpen, setDeporteOpen] = useState(false);
  const [deporteIdx, setDeporteIdx] = useState<number | null>(null);
  const [dDraft, setDDraft] = useState<DeporteDraft>({ seccionId: 0, diaSemanaIds: [], numeroPeriodo: "" });
  const [seccionesAbiertas, setSeccionesAbiertas] = useState<Record<number, boolean>>({});

  const [parOpen, setParOpen] = useState(false);
  const [parIdx, setParIdx] = useState<number | null>(null);
  const [pDraft, setPDraft] = useState<ParDraft>({ materiaAId: 0, materiaBId: 0 });

  const toggle = useMutation({
    mutationFn: ({ id, reunionActiva }: { id: number; reunionActiva: boolean }) =>
      api.patch(`/departamentos/${id}`, { reunionActiva }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["departamentos"] }),
  });

  const save = useMutation({
    mutationFn: (payload: {
      reunionesSeccion: ReunionDraft[];
      deportes: DeporteFila[];
      materiasMismoBloque: ParDraft[];
    }) => api.put<Reglas>("/reglas", payload),
    onSuccess: (data) => {
      qc.setQueryData(["reglas"], data);
      aplicar(data);
    },
    onError: () => {
      void refetchReglas();
    },
  });

  const guardarReuniones = (r: ReunionDraft[]) =>
    save.mutate({ reunionesSeccion: r, deportes: expandeDeportes(deportes), materiasMismoBloque: pares });
  const guardarDeportes = (d: DeporteDraft[]) =>
    save.mutate({ reunionesSeccion: reuniones, deportes: expandeDeportes(d), materiasMismoBloque: pares });
  const guardarPares = (p: ParDraft[]) =>
    save.mutate({ reunionesSeccion: reuniones, deportes: expandeDeportes(deportes), materiasMismoBloque: p });

  const expandeDeportes = (d: DeporteDraft[]): DeporteFila[] =>
    d.flatMap((dep) =>
      dep.diaSemanaIds.map((dia) => ({ seccionId: dep.seccionId, diaSemanaId: dia, numeroPeriodo: dep.numeroPeriodo }))
    );

  const periodosDeSeccion = (seccionId: number): string[] => {
    if (!seccionId) return [];
    const set = new Set<string>();
    for (const b of bloques) {
      if (b.seccionId === seccionId && b.esAcademico) set.add(b.numeroPeriodo);
    }
    return Array.from(set);
  };

  const colDe = (departamentoId: number) => colaborativas.find((c) => c.departamentoId === departamentoId);

  const openNuevaReunion = () => {
    setReunionIdx(null);
    setRDraft({
      diaSemanaId: dias[0]?.id ?? 0,
      horaInicio: "12:00",
      horaFin: "13:00",
      seccionIds: secciones.length ? [secciones[0].id] : [],
    });
    setReunionOpen(true);
  };

  const openEditarReunion = (i: number) => {
    setReunionIdx(i);
    setRDraft({ ...reuniones[i] });
    setReunionOpen(true);
  };

  const guardarReunion = () => {
    const drafts = [...reuniones];
    if (reunionIdx === null) drafts.push(rDraft);
    else drafts[reunionIdx] = rDraft;
    setReuniones(drafts);
    guardarReuniones(drafts);
    setReunionOpen(false);
  };

  const openNuevoDeporte = () => openNuevoDeporteSeccion(secciones[0]?.id ?? 0);

  const openNuevoDeporteSeccion = (seccionId: number) => {
    setDeporteIdx(null);
    const periodos = periodosDeSeccion(seccionId);
    setDDraft({ seccionId, diaSemanaIds: dias[0]?.id ? [dias[0].id] : [], numeroPeriodo: periodos[0] ?? "" });
    setDeporteOpen(true);
  };

  const openEditarDeporte = (i: number) => {
    setDeporteIdx(i);
    setDDraft({ ...deportes[i] });
    setDeporteOpen(true);
  };

  const guardarDeporte = () => {
    const drafts = [...deportes];
    if (deporteIdx === null) drafts.push(dDraft);
    else drafts[deporteIdx] = dDraft;
    setDeportes(drafts);
    guardarDeportes(drafts);
    setDeporteOpen(false);
  };

  const periodoEditable = periodosDeSeccion(dDraft.seccionId);

  const nombreMateria = (id: number) => materias.find((m) => m.id === id)?.nombre ?? "?";

  const openNuevoPar = () => {
    setParIdx(null);
    setPDraft({ materiaAId: materias[0]?.id ?? 0, materiaBId: materias[1]?.id ?? 0 });
    setParOpen(true);
  };

  const openEditarPar = (i: number) => {
    setParIdx(i);
    setPDraft({ ...pares[i] });
    setParOpen(true);
  };

  const guardarPar = () => {
    if (!pDraft.materiaAId || !pDraft.materiaBId || pDraft.materiaAId === pDraft.materiaBId) return;
    if (
      parIdx === null &&
      pares.some(
        (p) => parNormalizado(p.materiaAId, p.materiaBId) === parNormalizado(pDraft.materiaAId, pDraft.materiaBId)
      )
    )
      return;
    const drafts = [...pares];
    if (parIdx === null) drafts.push(pDraft);
    else drafts[parIdx] = pDraft;
    setPares(drafts);
    guardarPares(drafts);
    setParOpen(false);
  };

  const eliminarPar = (i: number) => {
    const drafts = pares.filter((_, j) => j !== i);
    setPares(drafts);
    guardarPares(drafts);
  };

  const parValido =
    !!pDraft.materiaAId && !!pDraft.materiaBId && pDraft.materiaAId !== pDraft.materiaBId && !save.isPending;

  const nombreDia = (id: number) => {
    const dd = dias.find((d) => d.id === id);
    return dd ? DIAS[dd.numeroDia - 1] : "?";
  };

  const cortoDia = (id: number) => {
    const nd = dias.find((d) => d.id === id)?.numeroDia;
    return nd ? DIAS_CORTOS[nd - 1] : "?";
  };

  useEffect(() => {
    if (!dias.length) return;
    setRDraft((prev) =>
      dias.some((d) => d.id === prev.diaSemanaId) ? prev : { ...prev, diaSemanaId: dias[0].id }
    );
    setDDraft((prev) => {
      const validos = prev.diaSemanaIds.filter((id) => dias.some((d) => d.id === id));
      return validos.length ? { ...prev, diaSemanaIds: validos } : { ...prev, diaSemanaIds: [dias[0].id] };
    });
  }, [dias]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Reuniones, deportes y materias compartidas</h1>
          <p className="text-sm text-slate-500">
            Los cambios se guardan automáticamente. Los bloques reservados se bloquean como restricciones duras al generar el horario.
          </p>
        </div>
        {save.isPending && (
          <span className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-600" />
            Guardando...
          </span>
        )}
      </header>

      {save.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {save.error instanceof Error ? save.error.message : "Error al guardar"}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-600" />
            <h2 className="font-semibold text-slate-800">Reuniones de sección</h2>
          </div>
          <button
            onClick={openNuevaReunion}
            disabled={save.isPending}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Agregar
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {reuniones.length === 0 && (
            <p className="px-5 py-6 text-sm text-slate-400">
              Sin reuniones de sección configuradas. Los docentes de las secciones asistentes quedan libres en la franja.
            </p>
          )}
          {reuniones.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-4 px-5 py-3">
              <div>
                <p className="font-medium text-slate-800">
                  {nombreDia(r.diaSemanaId)} {r.horaInicio}–{r.horaFin}
                </p>
                <p className="text-xs text-purple-700">
                  {r.seccionIds.map((id) => secciones.find((s) => s.id === id)?.nombre ?? "?").join(" · ") || "sin secciones"}
                </p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEditarReunion(i)} className="rounded p-1 text-slate-400 hover:bg-purple-50 hover:text-purple-600">
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    const drafts = reuniones.filter((_, j) => j !== i);
                    setReuniones(drafts);
                    guardarReuniones(drafts);
                  }}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Dumbbell className="h-5 w-5 text-emerald-600" />
            <h2 className="font-semibold text-slate-800">Días de deportes</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSeccionesAbiertas(Object.fromEntries(secciones.map((s) => [s.id, true])))}
              disabled={secciones.length === 0}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            >
              Expandir todo
            </button>
            <button
              onClick={() => setSeccionesAbiertas(Object.fromEntries(secciones.map((s) => [s.id, false])))}
              disabled={secciones.length === 0}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            >
              Cerrar todo
            </button>
            <button
              onClick={openNuevoDeporte}
              disabled={save.isPending}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Agregar
            </button>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {secciones.length === 0 && (
            <p className="px-5 py-6 text-sm text-slate-400">
              Sin secciones registradas. Ese bloque no recibirá clases de la sección seleccionada.
            </p>
          )}
          {secciones.map((sec) => {
            const entradas = deportes
              .map((d, i) => ({ d, i }))
              .filter((x) => x.d.seccionId === sec.id)
              .sort((a, b) => a.d.numeroPeriodo.localeCompare(b.d.numeroPeriodo, undefined, { numeric: true }));
            const abierta = seccionesAbiertas[sec.id] ?? true;
            return (
              <div key={sec.id}>
                <button
                  onClick={() =>
                    setSeccionesAbiertas((prev) => ({ ...prev, [sec.id]: !(prev[sec.id] ?? true) }))
                  }
                  className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-slate-50"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${abierta ? "" : "-rotate-90"}`}
                    />
                    <span className="font-medium text-slate-800">{sec.nombre}</span>
                    {entradas.length > 0 && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        {entradas.length} franja{entradas.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  {entradas.length > 0 && !abierta && (
                    <span className="hidden truncate text-xs text-slate-400 md:block">
                      {entradas
                        .map(({ d }) => `P${d.numeroPeriodo} · ${d.diaSemanaIds.map(cortoDia).join(", ")}`)
                        .join(" — ")}
                    </span>
                  )}
                </button>
                {abierta && (
                  <div className="border-t border-slate-100">
                    {entradas.length === 0 ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                        <p className="text-sm text-slate-400">Sin días de deportes configurados en esta sección.</p>
                        <button
                          onClick={() => openNuevoDeporteSeccion(sec.id)}
                          disabled={save.isPending}
                          className="flex items-center gap-1.5 rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          <Plus className="h-3.5 w-3.5" /> Agregar en {sec.nombre}
                        </button>
                      </div>
                    ) : (
                      <>
                        {entradas.map(({ d, i }) => (
                          <div key={`${d.seccionId}_${d.numeroPeriodo}`} className="flex items-center justify-between gap-4 px-5 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-slate-800">Período {d.numeroPeriodo}</span>
                              <div className="flex gap-1">
                                {d.diaSemanaIds.map((id) => (
                                  <span
                                    key={id}
                                    className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700"
                                  >
                                    {cortoDia(id)}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => openEditarDeporte(i)} className="rounded p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600">
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => {
                                  const drafts = deportes.filter((_, j) => j !== i);
                                  setDeportes(drafts);
                                  guardarDeportes(drafts);
                                }}
                                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-end border-t border-slate-100 px-5 py-2">
                          <button
                            onClick={() => openNuevoDeporteSeccion(sec.id)}
                            disabled={save.isPending}
                            className="flex items-center gap-1.5 rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                          >
                            <Plus className="h-3.5 w-3.5" /> Agregar deporte
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Shuffle className="h-5 w-5 text-teal-600" />
            <h2 className="font-semibold text-slate-800">Materias en el mismo bloque</h2>
          </div>
          <button
            onClick={openNuevoPar}
            disabled={save.isPending}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Agregar
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {pares.length === 0 && (
            <p className="px-5 py-6 text-sm text-slate-400">
              Sin pares configurados. Las materias de un par se programan en los mismos bloques de cada curso para que los estudiantes elijan a cuál asistir.
            </p>
          )}
          {pares.map((p, i) => (
            <div key={i} className="flex items-center justify-between gap-4 px-5 py-3">
              <div>
                <p className="font-medium text-slate-800">
                  <span className="text-violet-700">{nombreMateria(p.materiaAId)}</span>
                  <Shuffle className="mx-1.5 inline h-3.5 w-3.5 text-slate-400" />
                  <span className="text-teal-700">{nombreMateria(p.materiaBId)}</span>
                </p>
                <p className="text-xs text-slate-500">Comparten el mismo bloque en cada curso (los estudiantes eligen).</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEditarPar(i)} className="rounded p-1 text-slate-400 hover:bg-teal-50 hover:text-teal-600">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => eliminarPar(i)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <Handshake className="h-5 w-5 text-amber-600" />
          <h2 className="font-semibold text-slate-800">Colaborativas de departamento</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {departamentos.length === 0 && (
            <p className="px-5 py-6 text-sm text-slate-400">Sin departamentos registrados.</p>
          )}
          {departamentos.map((d) => {
            const col = colDe(d.id);
            return (
              <div key={d.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div>
                  <p className="font-medium text-slate-800">{d.nombre}</p>
                  <p className="text-xs text-slate-500">
                    {col
                      ? `Hueco detectado (última generación): ${nombreDia(col.diaSemanaId)} ${col.horaInicio}–${col.horaFin}`
                      : d.reunionActiva
                        ? "Activa: el solucionador buscará el hueco común al generar."
                        : "Inactiva: no se garantiza reunión semanal."}
                  </p>
                </div>
                <button
                  onClick={() => toggle.mutate({ id: d.id, reunionActiva: !d.reunionActiva })}
                  disabled={toggle.isPending}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    d.reunionActiva ? "bg-amber-500" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      d.reunionActiva ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <Modal
        open={reunionOpen}
        title={reunionIdx === null ? "Nueva reunión de sección" : "Editar reunión de sección"}
        onClose={() => setReunionOpen(false)}
      >
        <div className="space-y-4">
          <SelectField
            label="Día de la semana *"
            value={rDraft.diaSemanaId}
            emptyLabel=""
            onChange={(e) => setRDraft({ ...rDraft, diaSemanaId: Number(e.target.value) })}
          >
            {dias.map((d) => (
              <option key={d.id} value={d.id}>
                Día {d.numeroDia} · {DIAS[d.numeroDia - 1]}
              </option>
            ))}
          </SelectField>
          <div className="flex gap-3">
            <TextField
              label="Hora inicio *"
              type="time"
              value={rDraft.horaInicio}
              onChange={(e) => setRDraft({ ...rDraft, horaInicio: e.target.value })}
            />
            <TextField
              label="Hora fin *"
              type="time"
              value={rDraft.horaFin}
              onChange={(e) => setRDraft({ ...rDraft, horaFin: e.target.value })}
            />
          </div>
          <div>
            <p className="mb-1 block text-xs font-medium text-slate-600">Secciones que asisten *</p>
            <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {secciones.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={rDraft.seccionIds.includes(s.id)}
                    onChange={() =>
                      setRDraft((prev) => ({
                        ...prev,
                        seccionIds: prev.seccionIds.includes(s.id)
                          ? prev.seccionIds.filter((id) => id !== s.id)
                          : [...prev.seccionIds, s.id],
                      }))
                    }
                  />
                  <span className="text-slate-700">{s.nombre}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setReunionOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button
              onClick={guardarReunion}
              disabled={!rDraft.seccionIds.length || !dias.some((d) => d.id === rDraft.diaSemanaId) || !rDraft.horaInicio || !rDraft.horaFin || rDraft.horaFin <= rDraft.horaInicio || save.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deporteOpen}
        title={deporteIdx === null ? "Nuevo día de deportes" : "Editar día de deportes"}
        onClose={() => setDeporteOpen(false)}
      >
        <div className="space-y-4">
          <SelectField
            label="Sección *"
            value={dDraft.seccionId}
            emptyLabel="Selecciona una sección..."
            onChange={(e) => {
              const seccionId = Number(e.target.value);
              const periodos = periodosDeSeccion(seccionId);
              setDDraft({ ...dDraft, seccionId, numeroPeriodo: periodos[0] ?? "" });
            }}
          >
            {secciones.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </SelectField>
          <div>
            <p className="mb-1 block text-xs font-medium text-slate-600">
              Días de la semana (puedes marcar varios) *
            </p>
            <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {dias.map((d) => (
                <label key={d.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={dDraft.diaSemanaIds.includes(d.id)}
                    onChange={() =>
                      setDDraft((prev) => ({
                        ...prev,
                        diaSemanaIds: prev.diaSemanaIds.includes(d.id)
                          ? prev.diaSemanaIds.filter((id) => id !== d.id)
                          : [...prev.diaSemanaIds, d.id],
                      }))
                    }
                  />
                  <span className="text-slate-700">
                    Día {d.numeroDia} · {DIAS[d.numeroDia - 1]}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              El bloque (período) se reserva en todos los días marcados.
            </p>
          </div>
          <SelectField
            label="Período *"
            value={dDraft.numeroPeriodo}
            emptyLabel="Selecciona un período académico..."
            onChange={(e) => setDDraft({ ...dDraft, numeroPeriodo: e.target.value })}
          >
            {periodoEditable.map((p) => (
              <option key={p} value={p}>
                Período {p}
              </option>
            ))}
          </SelectField>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setDeporteOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button
              onClick={guardarDeporte}
              disabled={!dDraft.seccionId || dDraft.diaSemanaIds.length === 0 || !dDraft.numeroPeriodo || save.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={parOpen}
        title={parIdx === null ? "Nuevo par de materias" : "Editar par de materias"}
        onClose={() => setParOpen(false)}
      >
        <div className="space-y-4">
          <SelectField
            label="Materia A *"
            value={pDraft.materiaAId}
            emptyLabel="Selecciona una materia..."
            onChange={(e) => setPDraft({ ...pDraft, materiaAId: Number(e.target.value) })}
          >
            {materias.map((m) => (
              <option key={m.id} value={m.id} disabled={pDraft.materiaBId === m.id}>
                {m.nombre}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Materia B *"
            value={pDraft.materiaBId}
            emptyLabel="Selecciona una materia..."
            onChange={(e) => setPDraft({ ...pDraft, materiaBId: Number(e.target.value) })}
          >
            {materias.map((m) => (
              <option key={m.id} value={m.id} disabled={pDraft.materiaAId === m.id}>
                {m.nombre}
              </option>
            ))}
          </SelectField>
          <p className="text-xs text-slate-400">
            En cada curso donde ambas materias estén asignadas, ocuparán exactamente los mismos bloques semanales, de modo que el estudiante elija a cuál asistir.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setParOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button
              onClick={guardarPar}
              disabled={
                !parValido ||
                (parIdx === null &&
                  pares.some(
                    (p) =>
                      parNormalizado(p.materiaAId, p.materiaBId) ===
                      parNormalizado(pDraft.materiaAId, pDraft.materiaBId)
                  ))
              }
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}