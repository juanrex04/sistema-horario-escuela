import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2, FilterX } from "lucide-react";
import { api } from "../lib/api";
import { useCatalogQuery } from "../lib/queries";
import { SelectField, TextField } from "../components/fields";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import type { CargaAcademica, Curso, Materia, Profesor, Seccion } from "../lib/types";

type FormState = {
  cursoId: string;
  materiaId: string;
  profesorId: string;
  bloques: string;
};

const EMPTY: FormState = { cursoId: "", materiaId: "", profesorId: "", bloques: "" };

export default function Cargas() {
  const qc = useQueryClient();

  const [fSeccion, setFSeccion] = useState("");
  const [fCurso, setFCurso] = useState("");
  const [fMateria, setFMateria] = useState("");
  const [fProfesor, setFProfesor] = useState("");
  const [fMin, setFMin] = useState("");
  const [fMax, setFMax] = useState("");
  const [fq, setFq] = useState("");

  const { data: cargas = [], isLoading } = useCatalogQuery<CargaAcademica[]>("cargas", "/cargas", {
    seccionId: fSeccion,
    cursoId: fCurso,
    materiaId: fMateria,
    profesorId: fProfesor,
    minBloques: fMin,
    maxBloques: fMax,
    q: fq,
  });

  const { data: secciones = [] } = useQuery({ queryKey: ["secciones"], queryFn: () => api.get<Seccion[]>("/secciones") });
  const { data: cursos = [] } = useQuery({ queryKey: ["cursos"], queryFn: () => api.get<Curso[]>("/cursos") });
  const { data: materias = [] } = useQuery({ queryKey: ["materias"], queryFn: () => api.get<Materia[]>("/materias") });
  const { data: profesores = [] } = useQuery({ queryKey: ["profesores"], queryFn: () => api.get<Profesor[]>("/profesores") });

  const cursosFiltrados = fSeccion ? cursos.filter((c) => c.seccionId === Number(fSeccion)) : cursos;

  const [editing, setEditing] = useState<CargaAcademica | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<CargaAcademica | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["cargas"] });

  const create = useMutation({
    mutationFn: (data: Omit<CargaAcademica, "id">) => api.post("/cargas", data),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY);
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
    setFormOpen(true);
  }

  function openEdit(c: CargaAcademica) {
    setEditing(c);
    setForm({
      cursoId: String(c.cursoId),
      materiaId: String(c.materiaId),
      profesorId: String(c.profesorId),
      bloques: String(c.bloquesSemanalesRequeridos),
    });
    setFormOpen(true);
  }

  function openDelete(c: CargaAcademica) {
    remove.reset();
    setToDelete(c);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      cursoId: Number(form.cursoId),
      materiaId: Number(form.materiaId),
      profesorId: Number(form.profesorId),
      bloquesSemanalesRequeridos: Number(form.bloques),
    };
    if (editing) update.mutate({ id: editing.id, data });
    else create.mutate(data);
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
          onChange={(e) => setFCurso(e.target.value)}
          wrapper="w-44"
        >
          {cursosFiltrados.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </SelectField>
        <SelectField label="Materia" emptyLabel="Todas" value={fMateria} onChange={(e) => setFMateria(e.target.value)} wrapper="w-40">
          {materias.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </SelectField>
        <SelectField label="Profesor" emptyLabel="Todos" value={fProfesor} onChange={(e) => setFProfesor(e.target.value)} wrapper="w-44">
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
          onChange={(e) => setFMin(e.target.value)}
          wrapper="w-36"
        />
        <TextField
          label="Bloques: máximo"
          type="number"
          min={1}
          value={fMax}
          onChange={(e) => setFMax(e.target.value)}
          wrapper="w-36"
        />
        <TextField
          label="Buscar (curso, materia o profesor)"
          value={fq}
          onChange={(e) => setFq(e.target.value)}
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

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Curso</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Materia</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Profesor</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Bloques/sem</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Cargando...
                </td>
              </tr>
            )}
            {!isLoading && cargas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  <Search className="mx-auto mb-2 h-5 w-5" />
                  Sin resultados para los filtros aplicados.
                </td>
              </tr>
            )}
            {cargas.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {c.curso?.seccion?.nombre} - {c.curso?.nombre}
                </td>
                <td className="px-4 py-3 text-slate-600">{c.materia?.nombre}</td>
                <td className="px-4 py-3 text-slate-600">{c.profesor?.nombre}</td>
                <td className="px-4 py-3 text-slate-600">{c.bloquesSemanalesRequeridos}</td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
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

      <Modal
        open={formOpen}
        title={editing ? "Editar carga académica" : "Nueva carga académica"}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setForm(EMPTY);
        }}
      >
        <form onSubmit={submit} className="space-y-4">
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
          <SelectField
            label="Materia *"
            required
            value={form.materiaId}
            onChange={(e) => setForm({ ...form, materiaId: e.target.value })}
          >
            {materias.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Profesor *"
            required
            value={form.profesorId}
            onChange={(e) => setForm({ ...form, profesorId: e.target.value })}
          >
            {profesores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Bloques semanales requeridos *"
            type="number"
            min={1}
            required
            value={form.bloques}
            onChange={(e) => setForm({ ...form, bloques: e.target.value })}
          />
          {(create.error || update.error) && (
            <p className="text-sm text-red-600">
              {(create.error ?? update.error) instanceof Error ? (create.error ?? update.error)?.message : "Error"}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
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
              disabled={!form.cursoId || !form.materiaId || !form.profesorId || !form.bloques || create.isPending || update.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {create.isPending || update.isPending ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
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