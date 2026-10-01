import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, FilterX, Tag } from "lucide-react";
import { api } from "../lib/api";
import { qs, usePaginatedQuery } from "../lib/queries";
import { TextField } from "../components/fields";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import Pagination from "../components/Pagination";
import TableSkeleton from "../components/TableSkeleton";
import FilaVacia from "../components/FilaVacia";
import Button from "../components/Button";
import Page from "../components/Page";
import type { Departamento, Materia } from "../lib/types";

export default function Departamentos() {
  const qc = useQueryClient();
  const [fq, setFq] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: pageData, isLoading } = usePaginatedQuery<Departamento>(
    "departamentos-list",
    "/departamentos",
    { q: fq },
    page,
    pageSize
  );
  const departamentos = pageData?.items ?? [];
  const total = pageData?.total ?? 0;
  const { data: materias = [] } = useQuery({
    queryKey: ["materias-select"],
    queryFn: () => api.get<Materia[]>(`/materias${qs({})}`),
  });

  const [editing, setEditing] = useState<Departamento | null>(null);
  const [nombre, setNombre] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Departamento | null>(null);

  const [materiasOpen, setMateriasOpen] = useState<Departamento | null>(null);
  const [materiaIds, setMateriaIds] = useState<number[]>([]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["departamentos-list"] });

  const create = useMutation({
    mutationFn: (data: { nombre: string }) => api.post("/departamentos", data),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      setNombre("");
    },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { nombre: string } }) => api.patch(`/departamentos/${id}`, data),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      setNombre("");
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, reunionActiva }: { id: number; reunionActiva: boolean }) =>
      api.patch(`/departamentos/${id}`, { reunionActiva }),
    onSuccess: () => invalidate(),
  });

  const saveMaterias = useMutation({
    mutationFn: ({ id, materiaIds }: { id: number; materiaIds: number[] }) =>
      api.patch(`/departamentos/${id}/materias`, { materiaIds }),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["materias-list"] });
      setMateriasOpen(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/departamentos/${id}`),
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

  function openEdit(d: Departamento) {
    setEditing(d);
    setNombre(d.nombre);
    setFormOpen(true);
  }

  function openMaterias(d: Departamento) {
    setMateriasOpen(d);
    setMateriaIds((d.materias ?? []).map((m) => m.id));
    saveMaterias.reset();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) update.mutate({ id: editing.id, data: { nombre: nombre.trim() } });
    else create.mutate({ nombre: nombre.trim() });
  }

  return (
    <Page
      titulo="Departamentos"
      descripcion="Agrupan materias. Si activas la reunión colaborativa, el solucionador garantiza un hueco común semanal para sus docentes."
    >
      <div className="flex flex-wrap items-end gap-3 border border-borde bg-superficie p-4">
        <TextField
          label="Buscar por nombre"
          value={fq}
          onChange={(e) => { setFq(e.target.value); setPage(1); }}
          placeholder="Ciencia, Lenguaje..."
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
          Nuevo departamento
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
        <table className="min-w-[640px] divide-y divide-borde text-sm">
          <thead className="bg-papel">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium text-tinta-suave">Departamento</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-tinta-suave">Reunión colaborativa</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-tinta-suave">Materias</th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-tinta-suave">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {isLoading && <TableSkeleton cols={4} />}
            {!isLoading &&
              departamentos.length === 0 &&
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
                  mensaje="Todavía no hay departamentos cargados."
                  accion={
                    <Button variant="primario" tamano="sm" onClick={openCreate}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Nuevo departamento
                    </Button>
                  }
                />
              ))}
            {departamentos.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-3 font-medium text-tinta">{d.nombre}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={d.reunionActiva}
                    aria-label={`Reunión colaborativa de ${d.nombre}`}
                    onClick={() => toggle.mutate({ id: d.id, reunionActiva: !d.reunionActiva })}
                    disabled={toggle.isPending}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      d.reunionActiva ? "bg-verde" : "bg-borde-fuerte"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-superficie transition-transform ${
                        d.reunionActiva ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-papel-hondo px-2 py-0.5 text-xs font-medium text-tinta-suave">
                    {d._count?.materias ?? 0}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button type="button"
                      onClick={() => openMaterias(d)}
                      title="Asignar materias"
                      aria-label={`Asignar materias de ${d.nombre}`}
                      className="rounded p-1 text-apagado hover:bg-papel-hondo hover:text-tinta-suave"
                    >
                      <Tag className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button"
                      onClick={() => openEdit(d)}
                      aria-label={`Editar ${d.nombre}`}
                      className="rounded p-1 text-apagado hover:bg-pizarra/10 hover:text-pizarra"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button"
                      onClick={() => {
                        remove.reset();
                        setToDelete(d);
                      }}
                      aria-label={`Eliminar ${d.nombre}`}
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
        title={editing ? "Editar departamento" : "Nuevo departamento"}
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
            placeholder="Ciencia"
          />
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

      <Modal
        open={materiasOpen !== null}
        title={`Materias de ${materiasOpen?.nombre ?? "..."}`}
        onClose={() => setMateriasOpen(null)}
      >
        <div className="space-y-4">
          <p className="text-sm text-apagado">
            Marca las materias que pertenecen al departamento. Los docentes que las dictan deben poder coincidir en la colaborativa.
          </p>
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-borde p-2">
            {materias.map((m) => {
              const checked = materiaIds.includes(m.id);
              return (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-papel"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setMateriaIds((prev) =>
                        checked ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                      )
                    }
                  />
                  <span className="text-tinta-suave">{m.nombre}</span>
                </label>
              );
            })}
          </div>
          {saveMaterias.error && (
            <p className="text-sm text-tiza">{saveMaterias.error instanceof Error ? saveMaterias.error.message : "Error"}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button"
              onClick={() => setMateriasOpen(null)}
              className="rounded-lg border border-borde-fuerte px-4 py-2 text-sm font-medium text-tinta-suave hover:bg-papel"
            >
              Cancelar
            </button>
            <button type="button"
              onClick={() => materiasOpen && saveMaterias.mutate({ id: materiasOpen.id, materiaIds })}
              disabled={saveMaterias.isPending}
              className="rounded-lg bg-pizarra px-4 py-2 text-sm font-medium text-chalk hover:bg-pizarra-hondo disabled:opacity-50"
            >
              {saveMaterias.isPending ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar departamento"
        message={`¿Eliminar el departamento "${toDelete?.nombre}"? Los departamentos con materias asignadas no se pueden eliminar.`}
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
