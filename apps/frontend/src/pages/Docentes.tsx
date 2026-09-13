import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2, FilterX } from "lucide-react";
import { api } from "../lib/api";
import { useCatalogQuery, usePaginatedQuery } from "../lib/queries";
import { SelectField, TextField } from "../components/fields";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import Pagination from "../components/Pagination";
import TableSkeleton from "../components/TableSkeleton";
import type { Departamento, Profesor, Seccion } from "../lib/types";

type FormState = { nombre: string; departamentoId: string; seccionBaseId: string; prefiereGruposConsecutivos: boolean };

const EMPTY: FormState = { nombre: "", departamentoId: "", seccionBaseId: "", prefiereGruposConsecutivos: false };

export default function Docentes() {
  const qc = useQueryClient();
  const [fq, setFq] = useState("");
  const [fDepto, setFDepto] = useState("");
  const [tieneCargas, setTieneCargas] = useState("");
  const [fSeccionBase, setFSeccionBase] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: pageData, isLoading } = usePaginatedQuery<Profesor>("profesores", "/profesores", {
    q: fq,
    departamentoId: fDepto,
    tieneCargas,
    seccionBaseId: fSeccionBase,
  }, page, pageSize);
  const profesores = pageData?.items ?? [];
  const total = pageData?.total ?? 0;
  const { data: secciones = [] } = useCatalogQuery<Seccion[]>("secciones", "/secciones");
  const { data: departamentos = [] } = useCatalogQuery<Departamento[]>("departamentos", "/departamentos");

  const [editing, setEditing] = useState<Profesor | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Profesor | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["profesores"] });

  const create = useMutation({
    mutationFn: (data: { nombre: string; departamentoId?: number | null; prefiereGruposConsecutivos?: boolean }) =>
      api.post("/profesores", data),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY);
    },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Profesor> }) => api.patch(`/profesores/${id}`, data),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/profesores/${id}`),
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

  function openEdit(p: Profesor) {
    setEditing(p);
    setForm({ nombre: p.nombre, departamentoId: p.departamentoId ? String(p.departamentoId) : "", seccionBaseId: String(p.seccionBaseId), prefiereGruposConsecutivos: p.prefiereGruposConsecutivos ?? false });
    setFormOpen(true);
  }

  function openDelete(p: Profesor) {
    remove.reset();
    setToDelete(p);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      nombre: form.nombre.trim(),
      departamentoId: form.departamentoId ? Number(form.departamentoId) : null,
      seccionBaseId: Number(form.seccionBaseId),
      prefiereGruposConsecutivos: form.prefiereGruposConsecutivos,
    };
    if (editing) update.mutate({ id: editing.id, data });
    else create.mutate(data);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-800">Docentes</h1>
        <p className="text-sm text-slate-500">Gestión del cuerpo docente y su adscripción.</p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <TextField
          label="Buscar por nombre"
          placeholder="María, Juan..."
          value={fq}
          onChange={(e) => { setFq(e.target.value); setPage(1); }}
          wrapper="min-w-64 flex-1"
        />
        <SelectField
          label="Departamento"
          emptyLabel="Todos"
          value={fDepto}
          onChange={(e) => { setFDepto(e.target.value); setPage(1); }}
          wrapper="w-44"
        >
          {departamentos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Con carga asignada"
          emptyLabel="Todas"
          value={tieneCargas}
          onChange={(e) => { setTieneCargas(e.target.value); setPage(1); }}
          wrapper="w-44"
        >
          <option value="true">Con carga</option>
          <option value="false">Sin carga</option>
        </SelectField>
        <SelectField
          label="Sección de adscripción"
          emptyLabel="Todas"
          value={fSeccionBase}
          onChange={(e) => { setFSeccionBase(e.target.value); setPage(1); }}
          wrapper="w-52"
        >
          {secciones.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </SelectField>
        <button
          onClick={() => {
            setFq("");
            setFDepto("");
            setTieneCargas("");
            setFSeccionBase("");
            setPage(1);
          }}
          disabled={!fq && !fDepto && !tieneCargas && !fSeccionBase}
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
          Nuevo docente
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Nombre</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Sección de adscripción</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Departamento</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">N° cargas</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && <TableSkeleton cols={5} />}
            {!isLoading && profesores.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  <Search className="mx-auto mb-2 h-5 w-5" />
                  Sin resultados para los filtros aplicados.
                </td>
              </tr>
            )}
            {profesores.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {p.nombre}
                  {p.prefiereGruposConsecutivos && (
                    <span
                      className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                      title="Prefiere clases consecutivas entre grupos del mismo grado (misma materia y sección)"
                    >
                      Consecutivos
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">
                    {p.seccionBase?.nombre ?? "-"}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{p.departamento?.nombre ?? "-"}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {p._count?.cargas ?? 0}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button
                      onClick={() => openEdit(p)}
                      className="rounded p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => openDelete(p)}
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
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPage={setPage}
          onPageSize={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </div>

      <Modal
        open={formOpen}
        title={editing ? "Editar docente" : "Nuevo docente"}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setForm(EMPTY);
        }}
      >
        <form onSubmit={submit} className="space-y-4">
          <TextField
            label="Nombre *"
            required
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Prof. Nombre"
            wrapper=""
          />
          <SelectField
            label="Sección de adscripción *"
            required
            value={form.seccionBaseId}
            onChange={(e) => setForm({ ...form, seccionBaseId: e.target.value })}
            wrapper=""
          >
            {secciones.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Departamento"
            value={form.departamentoId}
            onChange={(e) => setForm({ ...form, departamentoId: e.target.value })}
            wrapper=""
          >
            <option value="">Sin departamento</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </SelectField>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <input
              type="checkbox"
              checked={form.prefiereGruposConsecutivos}
              onChange={(e) => setForm({ ...form, prefiereGruposConsecutivos: e.target.checked })}
              className="mt-0.5"
            />
            <span className="text-sm leading-snug text-slate-700">
              Prefiere clases consecutivas entre grupos del mismo grado
              <span className="block text-xs text-slate-500">
                (misma materia y sección, p. ej. 2A y 2B).
              </span>
            </span>
          </label>
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
              disabled={!form.nombre.trim() || !form.seccionBaseId || create.isPending || update.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {create.isPending || update.isPending ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar docente"
        message={`¿Eliminar a "${toDelete?.nombre}"? Esta acción no se puede deshacer.`}
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