import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, FilterX } from "lucide-react";
import { api } from "../lib/api";
import { usePaginatedQuery } from "../lib/queries";
import { TextField, SelectField } from "../components/fields";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import Pagination from "../components/Pagination";
import TableSkeleton from "../components/TableSkeleton";
import FilaVacia from "../components/FilaVacia";
import Button from "../components/Button";
import Page from "../components/Page";
import type { Departamento, Materia } from "../lib/types";

export default function Materias() {
  const qc = useQueryClient();
  const [fq, setFq] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: pageData, isLoading } = usePaginatedQuery<Materia>("materias-list", "/materias", { q: fq }, page, pageSize);
  const materias = pageData?.items ?? [];
  const total = pageData?.total ?? 0;
  const { data: departamentos = [] } = useQuery({
    queryKey: ["departamentos"],
    queryFn: () => api.get<Departamento[]>("/departamentos"),
  });

  const [editing, setEditing] = useState<Materia | null>(null);
  const [nombre, setNombre] = useState("");
  const [esEducacionFisica, setEsEducacionFisica] = useState(false);
  const [departamentoId, setDepartamentoId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Materia | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["materias-list"] });

  const create = useMutation({
    mutationFn: (data: { nombre: string; esEducacionFisica: boolean; departamentoId: number | null }) => api.post("/materias", data),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      setNombre("");
      setEsEducacionFisica(false);
      setDepartamentoId("");
    },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { nombre: string; esEducacionFisica: boolean; departamentoId: number | null } }) =>
      api.patch(`/materias/${id}`, data),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      setNombre("");
      setEsEducacionFisica(false);
      setDepartamentoId("");
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
    setEsEducacionFisica(false);
    setDepartamentoId("");
    setFormOpen(true);
  }

  function openEdit(m: Materia) {
    setEditing(m);
    setNombre(m.nombre);
    setEsEducacionFisica(m.esEducacionFisica ?? false);
    setDepartamentoId(m.departamentoId ? String(m.departamentoId) : "");
    setFormOpen(true);
  }

  function openDelete(m: Materia) {
    remove.reset();
    setToDelete(m);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      nombre: nombre.trim(),
      esEducacionFisica,
      departamentoId: departamentoId ? Number(departamentoId) : null,
    };
    if (editing) update.mutate({ id: editing.id, data });
    else create.mutate(data);
  }

  return (
    <Page titulo="Materias" descripcion="Asignaturas que se dictan en el colegio.">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-borde bg-superficie p-4">
        <TextField
          label="Buscar por nombre"
          value={fq}
          onChange={(e) => { setFq(e.target.value); setPage(1); }}
          placeholder="Matemática, Lengua..."
          wrapper="min-w-56 flex-1"
        />
        <button type="button"
          onClick={() => { setFq(""); setPage(1); }}
          disabled={!fq}
          className="flex h-9 items-center gap-2 rounded-lg border border-borde-fuerte px-3 text-sm font-medium text-tinta-suave hover:bg-papel disabled:opacity-40"
        >
          <FilterX className="h-4 w-4" aria-hidden="true" />
          Limpiar
        </button>
        <button type="button"
          onClick={openCreate}
          className="flex h-9 items-center gap-2 rounded-lg bg-pizarra px-4 text-sm font-medium text-chalk hover:bg-pizarra-hondo"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nueva materia
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
        <table className="min-w-[640px] divide-y divide-borde text-sm">
          <thead className="bg-papel">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium text-tinta-suave">Materia</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-tinta-suave">Departamento</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-tinta-suave">N° cargas</th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-tinta-suave">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {isLoading && <TableSkeleton cols={4} />}
            {!isLoading &&
              materias.length === 0 &&
              (fq ? (
                <FilaVacia
                  colSpan={4}
                  mensaje="Sin resultados para los filtros aplicados."
                  accion={
                    <Button
                      tamano="sm"
                      onClick={() => {
                        setFq("");
                        setPage(1);
                      }}
                    >
                      Limpiar filtros
                    </Button>
                  }
                />
              ) : (
                <FilaVacia
                  colSpan={4}
                  mensaje="Todavía no hay materias cargadas."
                  accion={
                    <Button variant="primario" tamano="sm" onClick={openCreate}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Nueva materia
                    </Button>
                  }
                />
              ))}
            {materias.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 font-medium text-tinta">
                  <div className="flex items-center gap-2">
                    {m.nombre}
                    {m.esEducacionFisica && (
                      <span className="rounded-full bg-verde-suave px-2 py-0.5 text-xs font-medium text-verde">
                        Educ. física
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {m.departamento ? (
                    <span className="rounded-full bg-pizarra/10 px-2 py-0.5 text-xs font-medium text-pizarra">
                      {m.departamento.nombre}
                    </span>
                  ) : (
                    <span className="text-xs text-apagado">Sin departamento</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-papel-hondo px-2 py-0.5 text-xs font-medium text-tinta-suave">
                    {m._count?.cargas ?? 0}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button type="button"
                      onClick={() => openEdit(m)}
                      aria-label={`Editar ${m.nombre}`}
                      className="rounded p-1 text-apagado hover:bg-pizarra/10 hover:text-pizarra"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button"
                      onClick={() => openDelete(m)}
                      aria-label={`Eliminar ${m.nombre}`}
                      className="rounded p-1 text-apagado hover:bg-tiza-suave hover:text-tiza"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-borde bg-superficie">
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
          <SelectField
            label="Departamento"
            value={departamentoId}
            onChange={(e) => setDepartamentoId(e.target.value)}
            emptyLabel="Sin departamento"
          >
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </SelectField>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-borde px-3 py-2.5 text-sm text-tinta-suave hover:bg-papel">
            <input
              type="checkbox"
              checked={esEducacionFisica}
              onChange={(e) => setEsEducacionFisica(e.target.checked)}
              className="h-4 w-4 rounded border-borde-fuerte text-pizarra focus:ring-pizarra"
            />
            Educación física
          </label>
          {(create.error || update.error) && (
            <p className="text-sm text-tiza">
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
              className="rounded-lg border border-borde-fuerte px-4 py-2 text-sm font-medium text-tinta-suave hover:bg-papel"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!nombre.trim() || create.isPending || update.isPending}
              className="rounded-lg bg-pizarra px-4 py-2 text-sm font-medium text-chalk hover:bg-pizarra-hondo disabled:opacity-50"
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
    </Page>
  );
}
