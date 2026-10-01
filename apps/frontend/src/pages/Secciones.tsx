import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, FilterX } from "lucide-react";
import { api } from "../lib/api";
import { usePaginatedQuery } from "../lib/queries";
import { TextField } from "../components/fields";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import Pagination from "../components/Pagination";
import TableSkeleton from "../components/TableSkeleton";
import FilaVacia from "../components/FilaVacia";
import Button from "../components/Button";
import Page from "../components/Page";
import type { Seccion } from "../lib/types";

export default function Secciones() {
  const qc = useQueryClient();
  const [fq, setFq] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: pageData, isLoading } = usePaginatedQuery<Seccion>("secciones-list", "/secciones", { q: fq }, page, pageSize);
  const secciones = pageData?.items ?? [];
  const total = pageData?.total ?? 0;

  const [editing, setEditing] = useState<Seccion | null>(null);
  const [nombre, setNombre] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Seccion | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["secciones-list"] });
    qc.invalidateQueries({ queryKey: ["secciones"] });
  };

  const create = useMutation({
    mutationFn: (data: { nombre: string }) => api.post("/secciones", data),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      setNombre("");
    },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { nombre: string } }) => api.patch(`/secciones/${id}`, data),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      setNombre("");
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/secciones/${id}`),
    onSuccess: () => {
      invalidate();
      setToDelete(null);
      remove.reset();
    },
  });

  function openCreate() {
    create.reset();
    setEditing(null);
    setNombre("");
    setFormOpen(true);
  }

  function openEdit(s: Seccion) {
    update.reset();
    setEditing(s);
    setNombre(s.nombre);
    setFormOpen(true);
  }

  function openDelete(s: Seccion) {
    remove.reset();
    setToDelete(s);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) update.mutate({ id: editing.id, data: { nombre: nombre.trim() } });
    else create.mutate({ nombre: nombre.trim() });
  }

  return (
    <Page
      titulo="Secciones"
      descripcion="Niveles del colegio. Agrupan cursos, bloques de horario y docentes adscritos."
    >
      <div className="flex flex-wrap items-end gap-3 border border-borde bg-superficie p-4">
        <TextField
          label="Buscar por nombre"
          value={fq}
          onChange={(e) => { setFq(e.target.value); setPage(1); }}
          placeholder="Primaria, Middle..."
          wrapper="min-w-56 flex-1"
        />
        <button type="button"
          onClick={() => { setFq(""); setPage(1); }}
          disabled={!fq}
          className="flex h-9 items-center gap-2 rounded-lg border border-borde-fuerte px-3 text-sm font-medium text-tinta-suave hover:bg-papel disabled:opacity-40"
        >
          <FilterX className="h-4 w-4" />
          Limpiar
        </button>
        <button type="button"
          onClick={openCreate}
          className="flex h-9 items-center gap-2 rounded-lg bg-pizarra px-4 text-sm font-medium text-chalk hover:bg-pizarra-hondo"
        >
          <Plus className="h-4 w-4" />
          Nueva sección
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
        <table className="min-w-[720px] divide-y divide-borde text-sm">
          <thead className="bg-papel">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium text-tinta-suave">Sección</th>
              <th scope="col" className="px-4 py-3 text-center font-medium text-tinta-suave">Cursos</th>
              <th scope="col" className="px-4 py-3 text-center font-medium text-tinta-suave">Bloques</th>
              <th scope="col" className="px-4 py-3 text-center font-medium text-tinta-suave">Docentes adscritos</th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-tinta-suave">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {isLoading && <TableSkeleton cols={5} />}
            {!isLoading &&
              secciones.length === 0 &&
              (fq ? (
                <FilaVacia
                  colSpan={5}
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
                  colSpan={5}
                  mensaje="Todavía no hay secciones cargadas."
                  accion={
                    <Button variant="primario" tamano="sm" onClick={openCreate}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Nueva sección
                    </Button>
                  }
                />
              ))}
            {secciones.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 font-medium text-tinta">{s.nombre}</td>
                <td className="px-4 py-3 text-center">
                  <span className="rounded-full bg-papel-hondo px-2 py-0.5 text-xs font-medium text-tinta-suave">{s._count?.cursos ?? 0}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="rounded-full bg-papel-hondo px-2 py-0.5 text-xs font-medium text-tinta-suave">{s._count?.bloques ?? 0}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="rounded-full bg-pizarra/10 px-2 py-0.5 text-xs font-medium text-pizarra">{s._count?.profesoresAdscritos ?? 0}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button type="button"
                      onClick={() => openEdit(s)}
                      aria-label={`Editar ${s.nombre}`}
                      className="rounded p-1 text-apagado hover:bg-pizarra/10 hover:text-pizarra"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button"
                      onClick={() => openDelete(s)}
                      aria-label={`Eliminar ${s.nombre}`}
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
        title={editing ? "Editar sección" : "Nueva sección"}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setNombre("");
        }}
      >
        <form onSubmit={submit} className="space-y-4">
          <TextField label="Nombre *" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Primaria" />
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
        title="Eliminar sección"
        message={`¿Eliminar la sección "${toDelete?.nombre}"? Solo se puede borrar si no tiene docentes adscritos, cursos ni bloques.`}
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
