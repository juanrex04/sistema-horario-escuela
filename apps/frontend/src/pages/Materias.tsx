import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2, FilterX } from "lucide-react";
import { api } from "../lib/api";
import { useCatalogQuery } from "../lib/queries";
import { TextField } from "../components/fields";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import type { Materia } from "../lib/types";

export default function Materias() {
  const qc = useQueryClient();
  const [fq, setFq] = useState("");

  const { data: materias = [], isLoading } = useCatalogQuery<Materia[]>("materias-list", "/materias", { q: fq });

  const [editing, setEditing] = useState<Materia | null>(null);
  const [nombre, setNombre] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Materia | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["materias-list"] });

  const create = useMutation({
    mutationFn: (data: { nombre: string }) => api.post("/materias", data),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      setNombre("");
    },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { nombre: string } }) => api.patch(`/materias/${id}`, data),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      setNombre("");
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/materias/${id}`),
    onSuccess: () => {
      invalidate();
      setToDelete(null);
      remove.reset();
    },
  });

  function openCreate() {
    setEditing(null);
    setNombre("");
    setFormOpen(true);
  }

  function openEdit(m: Materia) {
    setEditing(m);
    setNombre(m.nombre);
    setFormOpen(true);
  }

  function openDelete(m: Materia) {
    remove.reset();
    setToDelete(m);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) update.mutate({ id: editing.id, data: { nombre: nombre.trim() } });
    else create.mutate({ nombre: nombre.trim() });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-800">Materias</h1>
        <p className="text-sm text-slate-500">Asignaturas que se dictan en el colegio.</p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <TextField
          label="Buscar por nombre"
          value={fq}
          onChange={(e) => setFq(e.target.value)}
          placeholder="Matemática, Lengua..."
          wrapper="min-w-56 flex-1"
        />
        <button
          onClick={() => setFq("")}
          disabled={!fq}
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
          Nueva materia
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Materia</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">N° cargas</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  Cargando...
                </td>
              </tr>
            )}
            {!isLoading && materias.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  <Search className="mx-auto mb-2 h-5 w-5" />
                  Sin resultados para los filtros aplicados.
                </td>
              </tr>
            )}
            {materias.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{m.nombre}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {m._count?.cargas ?? 0}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button
                      onClick={() => openEdit(m)}
                      className="rounded p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => openDelete(m)}
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
        title={editing ? "Editar materia" : "Nueva materia"}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setNombre("");
        }}
      >
        <form onSubmit={submit} className="space-y-4">
          <TextField
            label="Nombre *"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Matemática"
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
                setNombre("");
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!nombre.trim() || create.isPending || update.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {create.isPending || update.isPending ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar materia"
        message={`¿Eliminar la materia "${toDelete?.nombre}"? Las materias con cargas asignadas no se pueden eliminar.`}
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