import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2, FilterX } from "lucide-react";
import { api } from "../lib/api";
import { useCatalogQuery } from "../lib/queries";
import { SelectField, TextField } from "../components/fields";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import type { Curso, Seccion } from "../lib/types";

type FormState = { seccionId: string; nombre: string };
const EMPTY: FormState = { seccionId: "", nombre: "" };

export default function Cursos() {
  const qc = useQueryClient();
  const [fSeccion, setFSeccion] = useState("");
  const [fq, setFq] = useState("");

  const { data: cursos = [], isLoading } = useCatalogQuery<Curso[]>("cursos-list", "/cursos", {
    seccionId: fSeccion,
    q: fq,
  });
  const { data: secciones = [] } = useQuery({ queryKey: ["secciones"], queryFn: () => api.get<Seccion[]>("/secciones") });

  const [editing, setEditing] = useState<Curso | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Curso | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["cursos-list"] });

  const create = useMutation({
    mutationFn: (data: { seccionId: number; nombre: string }) => api.post("/cursos", data),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY);
    },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Curso> }) => api.patch(`/cursos/${id}`, data),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/cursos/${id}`),
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

  function openEdit(c: Curso) {
    setEditing(c);
    setForm({ seccionId: String(c.seccionId), nombre: c.nombre });
    setFormOpen(true);
  }

  function openDelete(c: Curso) {
    remove.reset();
    setToDelete(c);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = { seccionId: Number(form.seccionId), nombre: form.nombre.trim() };
    if (editing) update.mutate({ id: editing.id, data });
    else create.mutate(data);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-800">Cursos</h1>
        <p className="text-sm text-slate-500">Grupos de estudiantes organizados por sección.</p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <SelectField label="Sección" emptyLabel="Todas" value={fSeccion} onChange={(e) => setFSeccion(e.target.value)} wrapper="w-44">
          {secciones.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Buscar por nombre"
          value={fq}
          onChange={(e) => setFq(e.target.value)}
          placeholder="1A, 2B..."
          wrapper="min-w-56 flex-1"
        />
        <button
          onClick={() => {
            setFSeccion("");
            setFq("");
          }}
          disabled={!fSeccion && !fq}
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
          Nuevo curso
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Curso</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Sección</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">N° cargas</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Cargando...
                </td>
              </tr>
            )}
            {!isLoading && cursos.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  <Search className="mx-auto mb-2 h-5 w-5" />
                  Sin resultados para los filtros aplicados.
                </td>
              </tr>
            )}
            {cursos.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{c.nombre}</td>
                <td className="px-4 py-3 text-slate-600">{c.seccion?.nombre}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {c._count?.cargas ?? 0}
                  </span>
                </td>
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
        title={editing ? "Editar curso" : "Nuevo curso"}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setForm(EMPTY);
        }}
      >
        <form onSubmit={submit} className="space-y-4">
          <SelectField label="Sección *" required value={form.seccionId} onChange={(e) => setForm({ ...form, seccionId: e.target.value })} emptyLabel="Selecciona sección...">
            {secciones.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </SelectField>
          <TextField label="Nombre del curso *" required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="1A" />
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
              disabled={!form.seccionId || !form.nombre.trim() || create.isPending || update.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {create.isPending || update.isPending ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar curso"
        message={`¿Eliminar el curso "${toDelete?.nombre}" (${toDelete?.seccion?.nombre})? Los cursos con cargas asignadas no se pueden eliminar.`}
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