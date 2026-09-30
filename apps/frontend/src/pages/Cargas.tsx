import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Pin, Plus, Search, Trash2, FilterX, X } from "lucide-react";
import { api } from "../lib/api";
import { SelectField, TextField } from "../components/fields";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import type { BloqueHorario, CargaAcademica, Curso, DiaSemana, Materia, Profesor, Seccion } from "../lib/types";

type FormState = {
  cursoId: string;
  seccionId: string;
  cursoIds: number[];
  materiaIds: number[];
  materiaId: string;
  profesorId: string;
  bloques: string;
};

const EMPTY: FormState = { cursoId: "", seccionId: "", cursoIds: [], materiaIds: [], materiaId: "", profesorId: "", bloques: "" };

export default function Cargas() {
  const qc = useQueryClient();

  const [fSeccion, setFSeccion] = useState("");
  const [fCurso, setFCurso] = useState("");
  const [fMateria, setFMateria] = useState("");
  const [fProfesor, setFProfesor] = useState("");
  const [fMin, setFMin] = useState("");
  const [fMax, setFMax] = useState("");
  const [fq, setFq] = useState("");

  const { data: cargas = [], isLoading } = useQuery({
    queryKey: ["cargas"],
    queryFn: () => api.get<CargaAcademica[]>("/cargas"),
  });

  const { data: secciones = [] } = useQuery({ queryKey: ["secciones"], queryFn: () => api.get<Seccion[]>("/secciones") });
  const { data: cursos = [] } = useQuery({ queryKey: ["cursos"], queryFn: () => api.get<Curso[]>("/cursos") });
  const { data: materias = [] } = useQuery({ queryKey: ["materias"], queryFn: () => api.get<Materia[]>("/materias") });
  const { data: profesores = [] } = useQuery({ queryKey: ["profesores"], queryFn: () => api.get<Profesor[]>("/profesores") });

  const cursosFiltrados = fSeccion ? cursos.filter((c) => c.seccionId === Number(fSeccion)) : cursos;

  const [editing, setEditing] = useState<CargaAcademica | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formOpen, setFormOpen] = useState(false);
  const [bulkAviso, setBulkAviso] = useState<string | null>(null);
  const [mostrarTodasMaterias, setMostrarTodasMaterias] = useState(false);
  const [toDelete, setToDelete] = useState<CargaAcademica | null>(null);
  const [pinCarga, setPinCarga] = useState<CargaAcademica | null>(null);
  const [pinSel, setPinSel] = useState<number[]>([]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["cargas"] });
  };

  const pinSeccionId = pinCarga?.curso?.seccionId ?? null;

  const { data: dias = [] } = useQuery({
    queryKey: ["dias"],
    queryFn: () => api.get<DiaSemana[]>("/dias"),
  });

  // Solo se piden los bloques de la sección del curso: son los únicos fijables.
  const { data: bloquesPin = [] } = useQuery({
    queryKey: ["bloques-pin", pinSeccionId],
    queryFn: () =>
      api.get<BloqueHorario[]>(`/bloques?paginado=false&seccionId=${pinSeccionId}&esAcademico=true`),
    enabled: pinSeccionId !== null,
  });

  const { data: fijosActuales } = useQuery({
    queryKey: ["carga-bloques-fijos", pinCarga?.id],
    queryFn: () =>
      api.get<{ cargaId: number; bloquesSemanalesRequeridos: number; bloqueHorarioIds: number[] }>(
        `/cargas/${pinCarga!.id}/bloques-fijos`
      ),
    enabled: pinCarga !== null,
  });

  const guardarFijos = useMutation({
    mutationFn: (ids: number[]) => api.put(`/cargas/${pinCarga!.id}/bloques-fijos`, { bloqueHorarioIds: ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["carga-bloques-fijos"] });
      setPinCarga(null);
      setPinSel([]);
    },
  });

  function abrirFijos(c: CargaAcademica) {
    setPinCarga(c);
    setPinSel([]);
  }

  function toggleFijo(id: number) {
    setPinSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const bloquesPorDia = dias
    .map((d) => ({ dia: d, bloques: bloquesPin.filter((b) => b.diaSemanaId === d.id) }))
    .filter((g) => g.bloques.length > 0);
  const requeridos = pinCarga?.bloquesSemanalesRequeridos ?? 0;
  const pinValido = pinSel.length === 0 || pinSel.length === requeridos;

  const createMasivas = useMutation({
    mutationFn: (data: {
      cursoIds: number[];
      materiaIds: number[];
      profesorId: number;
      bloquesSemanalesRequeridos: number;
    }) =>
      api.post<{ creadas: CargaAcademica[]; omitidas: { cursoId: number; materiaId: number }[] }>(
        "/cargas/masivas",
        data
      ),
    onSuccess: (data) => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY);
      setBulkAviso(
        data.omitidas.length > 0
          ? `Se crearon ${data.creadas.length} carga(s) y se omitieron ${data.omitidas.length} combinación(es) que ya tenían la materia/profesor.`
          : null
      );
    },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CargaAcademica> }) => api.patch(`/cargas/${id}`, data),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/cargas/${id}`),
    onSuccess: () => {
      invalidate();
      setToDelete(null);
      remove.reset();
    },
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setMostrarTodasMaterias(false);
    setBulkAviso(null);
    setFormOpen(true);
  }

  function openAsignar(curso: Curso) {
    setEditing(null);
    setForm({ ...EMPTY, seccionId: String(curso.seccionId), cursoIds: [curso.id] });
    setMostrarTodasMaterias(false);
    setBulkAviso(null);
    setFormOpen(true);
  }

  function openEdit(c: CargaAcademica) {
    setEditing(c);
    setForm({
      cursoId: String(c.cursoId),
      seccionId: "",
      cursoIds: [],
      materiaIds: [c.materiaId],
      materiaId: String(c.materiaId),
      profesorId: String(c.profesorId),
      bloques: String(c.bloquesSemanalesRequeridos),
    });
    setBulkAviso(null);
    setMostrarTodasMaterias(false);
    setFormOpen(true);
  }

  function openDelete(c: CargaAcademica) {
    remove.reset();
    setToDelete(c);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) {
      update.mutate({
        id: editing.id,
        data: {
          cursoId: Number(form.cursoId),
          materiaId: Number(form.materiaId),
          profesorId: Number(form.profesorId),
          bloquesSemanalesRequeridos: Number(form.bloques),
        },
      });
      return;
    }
    createMasivas.mutate({
      cursoIds: form.cursoIds,
      materiaIds: form.materiaIds,
      profesorId: Number(form.profesorId),
      bloquesSemanalesRequeridos: Number(form.bloques),
    });
  }

  const cursosDeSeccion = form.seccionId
    ? cursos.filter((c) => c.seccionId === Number(form.seccionId)).sort((a, b) => a.nombre.localeCompare(b.nombre))
    : [];

  const profesoresOrdenados = [...profesores].sort(
    (a, b) => a.seccionBaseId - b.seccionBaseId || a.nombre.localeCompare(b.nombre)
  );

  const profesorSel = profesores.find((p) => p.id === Number(form.profesorId));
  const materiasVisible = mostrarTodasMaterias
    ? materias
    : profesorSel?.departamentoId
      ? materias.filter((m) => m.departamentoId === profesorSel.departamentoId)
      : materias.filter((m) => m.departamentoId == null);

  const bloqueMatch = (b: number) =>
    (fMin === "" || b >= Number(fMin)) && (fMax === "" || b <= Number(fMax));

  const cargasFiltradas = cargas.filter(
    (c) =>
      (fSeccion === "" || String(c.curso?.seccionId) === fSeccion) &&
      (fCurso === "" || String(c.cursoId) === fCurso) &&
      (fMateria === "" || String(c.materiaId) === fMateria) &&
      (fProfesor === "" || String(c.profesorId) === fProfesor) &&
      bloqueMatch(c.bloquesSemanalesRequeridos) &&
      (fq === "" ||
        (c.curso?.nombre ?? "").toLowerCase().includes(fq.toLowerCase()) ||
        (c.materia?.nombre ?? "").toLowerCase().includes(fq.toLowerCase()) ||
        (c.profesor?.nombre ?? "").toLowerCase().includes(fq.toLowerCase()))
  );

  const gruposPorCurso = Array.from(
    cargasFiltradas.reduce((map, c) => {
      const curso = c.curso;
      if (!curso) return map;
      const g = map.get(curso.id) ?? { curso, cargas: [] as CargaAcademica[] };
      g.cargas.push(c);
      map.set(curso.id, g);
      return map;
    }, new Map<number, { curso: Curso; cargas: CargaAcademica[] }>())
  )
    .map(([, g]) => ({
      ...g,
      nMaterias: new Set(g.cargas.map((c) => c.materiaId)).size,
      nProfesores: new Set(g.cargas.map((c) => c.profesorId)).size,
      totalBloques: g.cargas.reduce((s, c) => s + c.bloquesSemanalesRequeridos, 0),
    }))
    .sort(
      (a, b) =>
        (a.curso.seccion?.nombre ?? "").localeCompare(b.curso.seccion?.nombre ?? "") ||
        a.curso.nombre.localeCompare(b.curso.nombre)
    );

  const nDocentes = new Set(cargasFiltradas.map((c) => c.profesorId)).size;
  const nCursos = gruposPorCurso.length;

  const deptoDelProfesor = (id: number) => profesores.find((p) => p.id === id)?.departamento?.nombre;
  const deptoDeMateria = (id: number) => materias.find((m) => m.id === id)?.departamento?.nombre;

  function toggleCurso(id: number) {
    setForm((f) => ({
      ...f,
      cursoIds: f.cursoIds.includes(id) ? f.cursoIds.filter((x) => x !== id) : [...f.cursoIds, id],
    }));
  }

  function toggleMateria(id: number) {
    setForm((f) => ({
      ...f,
      materiaIds: f.materiaIds.includes(id) ? f.materiaIds.filter((x) => x !== id) : [...f.materiaIds, id],
    }));
  }

  function clearFilters() {
    setFSeccion("");
    setFCurso("");
    setFMateria("");
    setFProfesor("");
    setFMin("");
    setFMax("");
    setFq("");
  }

  const filtersActive = fSeccion || fCurso || fMateria || fProfesor || fMin || fMax || fq;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-800">Cargas Académicas</h1>
        <p className="text-sm text-slate-500">
          Asigna materia + profesor a cada curso con los bloques semanales requeridos.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <SelectField
          label="Sección"
          emptyLabel="Todas"
          value={fSeccion}
          onChange={(e) => {
            setFSeccion(e.target.value);
            setFCurso("");
          }}
          wrapper="w-44"
        >
          {secciones.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Curso"
          emptyLabel="Todos"
          value={fCurso}
          onChange={(e) => { setFCurso(e.target.value); }}
          wrapper="w-44"
        >
          {cursosFiltrados.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </SelectField>
        <SelectField label="Materia" emptyLabel="Todas" value={fMateria} onChange={(e) => { setFMateria(e.target.value); }} wrapper="w-40">
          {materias.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </SelectField>
        <SelectField label="Profesor" emptyLabel="Todos" value={fProfesor} onChange={(e) => { setFProfesor(e.target.value); }} wrapper="w-44">
          {profesores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Bloques: mínimo"
          type="number"
          min={1}
          value={fMin}
          onChange={(e) => { setFMin(e.target.value); }}
          wrapper="w-36"
        />
        <TextField
          label="Bloques: máximo"
          type="number"
          min={1}
          value={fMax}
          onChange={(e) => { setFMax(e.target.value); }}
          wrapper="w-36"
        />
        <TextField
          label="Buscar (curso, materia o profesor)"
          value={fq}
          onChange={(e) => { setFq(e.target.value); }}
          wrapper="min-w-56 flex-1"
        />
        <button
          onClick={clearFilters}
          disabled={!filtersActive}
          className="flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          <FilterX className="h-4 w-4" />
          Limpiar
        </button>
        <button
          onClick={openCreate}
          className="flex h-9 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Nueva carga
        </button>
      </div>

      {bulkAviso && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>{bulkAviso}</span>
          <button
            onClick={() => setBulkAviso(null)}
            className="ml-auto rounded px-1.5 text-amber-500 hover:text-amber-700"
            aria-label="Cerrar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {isLoading
            ? "Cargando cargas académicas..."
            : `${cargasFiltradas.length} carga(s) · ${nCursos} curso(s) · ${nDocentes} docente(s)`}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
          ))}
        </div>
      ) : gruposPorCurso.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-10 text-center text-slate-400">
          <Search className="mx-auto mb-2 h-5 w-5" />
          Sin resultados para los filtros aplicados.
        </div>
      ) : (
        <div className="space-y-4">
          {gruposPorCurso.map((g) => (
            <div key={g.curso.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <h3 className="font-semibold text-slate-800">
                    {g.curso.seccion?.nombre} - {g.curso.nombre}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {g.nMaterias} materia(s) · {g.nProfesores} docente(s) · {g.totalBloques} bloques/sem
                  </p>
                </div>
                <button
                  onClick={() => openAsignar(g.curso)}
                  className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Asignar
                </button>
              </div>
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2">Materia</th>
                    <th className="px-4 py-2">Profesor</th>
                    <th className="px-4 py-2 text-right">Bloques/sem</th>
                    <th className="px-4 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {g.cargas
                    .slice()
                    .sort((a, b) => (a.materia?.nombre ?? "").localeCompare(b.materia?.nombre ?? ""))
                    .map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-slate-700">
                          {c.materia?.nombre}
                          {deptoDeMateria(c.materiaId) && (
                            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                              {deptoDeMateria(c.materiaId)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {c.profesor?.nombre}
                          {deptoDelProfesor(c.profesorId) && (
                            <span className="ml-2 inline-block rounded bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-600">
                              {deptoDelProfesor(c.profesorId)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-slate-700">
                          {c.bloquesSemanalesRequeridos}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="inline-flex gap-1">
                            <button
                              onClick={() => abrirFijos(c)}
                              title="Fijar bloques"
                              className="rounded p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                            >
                              <Pin className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openEdit(c)}
                              className="rounded p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openDelete(c)}
                              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        title={editing ? "Editar carga académica" : "Nueva carga académica"}
        maxWidth="max-w-2xl"
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setForm(EMPTY);
          setMostrarTodasMaterias(false);
        }}
      >
        <form onSubmit={submit}>
          <div className="space-y-4 overflow-y-auto pr-1">
            {editing ? (
            <>
              <SelectField
                label="Profesor *"
                required
                value={form.profesorId}
                onChange={(e) => setForm({ ...form, profesorId: e.target.value })}
              >
                {profesoresOrdenados.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · {p.seccionBase?.nombre ?? "Sin sección"}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Materia *"
                required
                value={form.materiaId}
                onChange={(e) => setForm({ ...form, materiaId: e.target.value, materiaIds: [Number(e.target.value)] })}
              >
                {materias.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Curso *"
                required
                value={form.cursoId}
                onChange={(e) => setForm({ ...form, cursoId: e.target.value })}
              >
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.seccion?.nombre} - {c.nombre}
                  </option>
                ))}
              </SelectField>
            </>
          ) : (
            <>
              <SelectField
                label="1 · Sección *"
                required
                value={form.seccionId}
                onChange={(e) => setForm({ ...form, seccionId: e.target.value, cursoIds: [] })}
              >
                {secciones.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </SelectField>
              {form.seccionId && (
                <SelectField
                  label="2 · Docente *"
                  required
                  value={form.profesorId}
                  onChange={(e) => setForm({ ...form, profesorId: e.target.value })}
                >
                  {profesoresOrdenados.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} · {p.seccionBase?.nombre ?? "Sin sección"}
                    </option>
                  ))}
                </SelectField>
              )}
              {form.seccionId && form.profesorId && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      3 · Materias * ({form.materiaIds.length} seleccionada{form.materiaIds.length === 1 ? "" : "s"})
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, materiaIds: materiasVisible.map((m) => m.id) })}
                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Todas
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, materiaIds: [] })}
                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Ninguno
                      </button>
                    </div>
                  </div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={mostrarTodasMaterias}
                        onChange={(e) => setMostrarTodasMaterias(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      Mostrar todas las materias
                    </label>
                    {!mostrarTodasMaterias && (
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600">
                        {profesorSel?.departamentoId
                          ? `Departamento: ${profesorSel.departamento?.nombre ?? "—"}`
                          : "Materias sin departamento"}
                      </span>
                    )}
                  </div>
                  {materiasVisible.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      {profesorSel?.departamentoId && !mostrarTodasMaterias
                        ? `El departamento ${profesorSel.departamento?.nombre ?? ""} no tiene materias asignadas.`
                        : "No hay materias registradas."}
                    </p>
                  ) : (
                    <div className="grid max-h-64 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                      {materiasVisible.map((m) => {
                        const checked = form.materiaIds.includes(m.id);
                        return (
                          <label
                            key={m.id}
                            className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors ${
                              checked
                                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleMateria(m.id)}
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            {m.nombre}
                            {m.departamento && <span className="text-xs text-slate-400">· {m.departamento.nombre}</span>}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {form.seccionId && form.profesorId && form.materiaIds.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      4 · Cursos * ({form.cursoIds.length} seleccionado{form.cursoIds.length === 1 ? "" : "s"})
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, cursoIds: cursosDeSeccion.map((c) => c.id) })}
                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, cursoIds: [] })}
                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Ninguno
                      </button>
                    </div>
                  </div>
                  {cursosDeSeccion.length === 0 ? (
                    <p className="text-sm text-slate-400">La sección no tiene cursos.</p>
                  ) : (
                    <div className="grid max-h-64 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                      {cursosDeSeccion.map((c) => {
                        const checked = form.cursoIds.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors ${
                              checked
                                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCurso(c.id)}
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            {c.seccion?.nombre} - {c.nombre}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          </div>
          <div className="sticky bottom-0 -mx-5 -mb-4 mt-4 flex items-end justify-between gap-4 border-t border-slate-200 bg-white px-5 pb-4 pt-3">
            <div className="w-44 shrink-0">
              <TextField
                label="Bloques semanales requeridos *"
                type="number"
                min={1}
                required
                value={form.bloques}
                onChange={(e) => setForm({ ...form, bloques: e.target.value })}
              />
            </div>
            <div className="flex flex-col items-end gap-1">
              {(createMasivas.error || update.error) && (
                <p className="text-right text-sm text-red-600">
                  {(createMasivas.error ?? update.error) instanceof Error
                    ? (createMasivas.error ?? update.error)?.message
                    : "Error"}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFormOpen(false);
                    setEditing(null);
                    setForm(EMPTY);
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    (!editing && (!form.seccionId || form.cursoIds.length === 0)) ||
                    (editing && !form.cursoId) ||
                    (!editing && form.materiaIds.length === 0) ||
                    (editing && !form.materiaId) ||
                    !form.profesorId ||
                    !form.bloques ||
                    createMasivas.isPending ||
                    update.isPending
                  }
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {createMasivas.isPending || update.isPending ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={pinCarga !== null}
        title="Fijar bloques de la carga"
        onClose={() => {
          setPinCarga(null);
          setPinSel([]);
        }}
        maxWidth="max-w-3xl"
      >
        <p className="text-sm text-slate-600">
          {pinCarga?.materia?.nombre} en {pinCarga?.curso?.nombre} · {pinCarga?.profesor?.nombre}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Esta carga requiere {requeridos} bloque(s) por semana. Si eliges bloques, la carga solo
          podrá dictarse en esos horarios; déjalos todos desmarcados para que el solver elija.
        </p>

        {!fijosActuales && (
          <p className="mt-3 text-sm text-slate-400">Cargando bloques fijos actuales...</p>
        )}
        {fijosActuales && fijosActuales.bloqueHorarioIds.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Hay {fijosActuales.bloqueHorarioIds.length} bloque(s) fijado(s) guardados. Si no
            seleccionas ninguno al guardar, se eliminan y la carga vuelve a ser libre.
          </div>
        )}

        <div className="mt-4 space-y-4">
          {bloquesPorDia.map(({ dia, bloques }) => (
            <div key={dia.id}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Día {dia.numeroDia}
              </h3>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {bloques
                  .slice()
                  .sort((a, b) => a.numeroPeriodo.localeCompare(b.numeroPeriodo))
                  .map((b) => {
                    const marcado = pinSel.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => toggleFijo(b.id)}
                        className={`rounded-lg border px-2 py-1.5 text-left text-xs transition-colors ${
                          marcado
                            ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <span className="block font-medium">P{b.numeroPeriodo}</span>
                        <span className="block text-[11px] text-slate-500">
                          {b.horaInicio}-{b.horaFin}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
          {bloquesPorDia.length === 0 && (
            <p className="text-sm text-slate-400">No hay bloques académicos para esta sección.</p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span
            className={`text-xs ${pinSel.length === requeridos ? "text-emerald-600" : "text-slate-500"}`}
          >
            {pinSel.length} de {requeridos} seleccionados
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setPinCarga(null);
                setPinSel([]);
              }}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!pinValido || guardarFijos.isPending}
              onClick={() => guardarFijos.mutate(pinSel)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {guardarFijos.isPending ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
        {guardarFijos.isError && (
          <p className="mt-2 text-sm text-red-600">{guardarFijos.error.message}</p>
        )}
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar carga académica"
        message={`¿Eliminar la carga de ${toDelete?.materia?.nombre} en ${toDelete?.curso?.nombre} (${toDelete?.profesor?.nombre})?`}
        loading={remove.isPending}
        error={remove.isError ? remove.error.message : null}
        onCancel={() => {
          setToDelete(null);
          remove.reset();
        }}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </div>
  );
}