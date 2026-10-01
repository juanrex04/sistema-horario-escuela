import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, FilterX, DoorOpen } from "lucide-react";
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
import type { Espacio, Materia, Seccion } from "../lib/types";

type Vinculo = { materiaId: number | null; seccionId: number | null };

export default function Espacios() {
  const qc = useQueryClient();
  const [fq, setFq] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: pageData, isLoading } = usePaginatedQuery<Espacio>("espacios-list", "/espacios", { q: fq }, page, pageSize);
  const espacios = pageData?.items ?? [];
  const total = pageData?.total ?? 0;

  const { data: materias = [] } = useQuery({
    queryKey: ["materias"],
    queryFn: () => api.get<Materia[]>("/materias"),
  });
  const { data: secciones = [] } = useQuery({
    queryKey: ["secciones"],
    queryFn: () => api.get<Seccion[]>("/secciones"),
  });

  const [editing, setEditing] = useState<Espacio | null>(null);
  const [nombre, setNombre] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Espacio | null>(null);

  const [asignOpen, setAsignOpen] = useState(false);
  const [asignEspacio, setAsignEspacio] = useState<Espacio | null>(null);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["espacios-list"] });

  const create = useMutation({
    mutationFn: (data: { nombre: string }) => api.post("/espacios", data),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setNombre("");
    },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { nombre: string } }) => api.patch(`/espacios/${id}`, data),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      setNombre("");
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/espacios/${id}`),
    onSuccess: () => {
      invalidate();
      setToDelete(null);
      remove.reset();
    },
  });

  const saveVinculos = useMutation({
    mutationFn: ({ id, vinculos: lista }: { id: number; vinculos: Vinculo[] }) =>
      api.patch(`/espacios/${id}/materias`, {
        vinculos: lista
          .filter((v) => v.materiaId !== null)
          .map((v) => ({ materiaId: v.materiaId, seccionId: v.seccionId ?? null })),
      }),
    onSuccess: () => {
      invalidate();
      setAsignOpen(false);
      setVinculos([]);
      saveVinculos.reset();
    },
  });

  function openCreate() {
    setEditing(null);
    setNombre("");
    setFormOpen(true);
  }

  function openEdit(e: Espacio) {
    setEditing(e);
    setNombre(e.nombre);
    setFormOpen(true);
  }

  function openDelete(e: Espacio) {
    remove.reset();
    setToDelete(e);
  }

  function openAsignaciones(e: Espacio) {
    saveVinculos.reset();
    setAsignEspacio(e);
    setVinculos(
      (e.materias ?? []).map((m) => ({ materiaId: m.materiaId, seccionId: m.seccionId ?? null }))
    );
    setAsignOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = { nombre: nombre.trim() };
    if (editing) update.mutate({ id: editing.id, data });
    else create.mutate(data);
  }

  function setVinculo(idx: number, key: keyof Vinculo, value: number | null) {
    setVinculos((prev) => prev.map((v, i) => (i === idx ? { ...v, [key]: value } : v)));
  }

  return (
    <Page
      titulo="Espacios y Salas"
      descripcion="Recursos físicos compartidos (laboratorios, salas, canchas). Las materias que usan un mismo espacio no pueden coincidir en el tiempo."
    >
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-borde bg-superficie p-4">
        <TextField
          label="Buscar por nombre"
          value={fq}
          onChange={(e) => { setFq(e.target.value); setPage(1); }}
          placeholder="Laboratorio de cómputo..."
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
          Nuevo espacio
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
        <table className="min-w-[520px] divide-y divide-borde text-sm">
          <thead className="bg-papel">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium text-tinta-suave">Espacio</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-tinta-suave">Materias asignadas</th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-tinta-suave">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {isLoading && <TableSkeleton cols={3} />}
            {!isLoading && espacios.length === 0 &&
              (fq ? (
                <FilaVacia
                  colSpan={3}
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
                  colSpan={3}
                  mensaje="Todavía no hay espacios cargados."
                  accion={
                    <Button variant="primario" tamano="sm" onClick={openCreate}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Nuevo espacio
                    </Button>
                  }
                />
              ))}
            {espacios.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-3 font-medium text-tinta">{e.nombre}</td>
                <td className="px-4 py-3">
                  {(e.materias ?? []).length === 0 ? (
                    <span className="text-xs text-apagado">Sin materias asignadas</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {(e.materias ?? []).map((m) => (
                        <span
                          key={m.id}
                          className="rounded-full bg-pizarra/10 px-2 py-0.5 text-xs font-medium text-pizarra"
                        >
                          {m.materia?.nombre}
                          {m.seccion && (
                            <span className="ml-1 text-tenue">· {m.seccion.nombre}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button type="button"
                      onClick={() => openAsignaciones(e)}
                      title="Asignar materias"
                      aria-label={`Asignar materias a ${e.nombre}`}
                      className="rounded p-1 text-apagado hover:bg-pizarra/10 hover:text-pizarra"
                    >
                      <DoorOpen className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button"
                      onClick={() => openEdit(e)}
                      aria-label={`Editar ${e.nombre}`}
                      className="rounded p-1 text-apagado hover:bg-pizarra/10 hover:text-pizarra"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button"
                      onClick={() => openDelete(e)}
                      aria-label={`Eliminar ${e.nombre}`}
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
        title={editing ? "Editar espacio" : "Nuevo espacio"}
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
            placeholder="Laboratorio de cómputo"
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
        open={asignOpen}
        title="Asignar materias al espacio"
        onClose={() => {
          setAsignOpen(false);
          setAsignEspacio(null);
          setVinculos([]);
          saveVinculos.reset();
        }}
      >
        <div className="space-y-4">
          <p className="text-sm text-apagado">
            Cada materia que use este espacio no podrá coincidir en el tiempo con otra asignación del
            mismo espacio. Deja la sección en "Todas" para aplicar a todas las secciones.
          </p>
          <div className="space-y-2">
            {vinculos.map((v, idx) => (
              <div key={idx} className="flex items-center gap-2 rounded-lg border border-borde p-2">
                <SelectField
                  label="Materia"
                  value={v.materiaId ?? ""}
                  onChange={(e) => setVinculo(idx, "materiaId", e.target.value ? Number(e.target.value) : null)}
                  emptyLabel="Selecciona..."
                  wrapper="flex-1"
                >
                  {materias.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Sección"
                  value={v.seccionId ?? ""}
                  onChange={(e) => setVinculo(idx, "seccionId", e.target.value ? Number(e.target.value) : null)}
                  emptyLabel="Todas"
                  wrapper="flex-1"
                >
                  {secciones.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </SelectField>
                <button
                  type="button"
                  onClick={() => setVinculos((prev) => prev.filter((_, i) => i !== idx))}
                  aria-label="Quitar materia"
                  className="mt-6 rounded p-1 text-apagado hover:bg-tiza-suave hover:text-tiza"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setVinculos((prev) => [...prev, { materiaId: null, seccionId: null }])}
            className="flex items-center gap-2 rounded-lg border border-borde-fuerte px-3 py-2 text-sm font-medium text-tinta-suave hover:bg-papel"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Añadir materia
          </button>
          {saveVinculos.error && (
            <p className="text-sm text-tiza">
              {saveVinculos.error instanceof Error ? saveVinculos.error.message : "Error"}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setAsignOpen(false);
                setAsignEspacio(null);
                setVinculos([]);
                saveVinculos.reset();
              }}
              className="rounded-lg border border-borde-fuerte px-4 py-2 text-sm font-medium text-tinta-suave hover:bg-papel"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saveVinculos.isPending}
              onClick={() => {
                if (asignEspacio) saveVinculos.mutate({ id: asignEspacio.id, vinculos });
              }}
              className="rounded-lg bg-pizarra px-4 py-2 text-sm font-medium text-chalk hover:bg-pizarra-hondo disabled:opacity-50"
            >
              {saveVinculos.isPending ? "Guardando..." : "Guardar asignaciones"}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar espacio"
        message={`¿Eliminar el espacio "${toDelete?.nombre}"? Los espacios con materias asignadas no se pueden eliminar.`}
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
