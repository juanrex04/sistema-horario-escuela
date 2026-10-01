import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, FilterX } from "lucide-react";
import { api } from "../lib/api";
import { usePaginatedQuery } from "../lib/queries";
import { SelectField, TextField } from "../components/fields";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import Pagination from "../components/Pagination";
import TableSkeleton from "../components/TableSkeleton";
import FilaVacia from "../components/FilaVacia";
import Button from "../components/Button";
import Page from "../components/Page";
import type { Curso, Seccion } from "../lib/types";

type FormState = { seccionId: string; nombre: string };
const EMPTY: FormState = { seccionId: "", nombre: "" };

export default function Cursos() {
  const qc = useQueryClient();
  const [fSeccion, setFSeccion] = useState("");
  const [fq, setFq] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: pageData, isLoading } = usePaginatedQuery<Curso>("cursos-list", "/cursos", {
    seccionId: fSeccion,
    q: fq,
  }, page, pageSize);
  const cursos = pageData?.items ?? [];
  const total = pageData?.total ?? 0;
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
    <Page titulo="Cursos" descripcion="Grupos de estudiantes organizados por sección.">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-borde bg-superficie p-4">
        <SelectField label="Sección" emptyLabel="Todas" value={fSeccion} onChange={(e) => { setFSeccion(e.target.value); setPage(1); }} wrapper="w-44">
          {secciones.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Buscar por nombre"
          value={fq}
          onChange={(e) => { setFq(e.target.value); setPage(1); }}
          placeholder="1A, 2B..."
          wrapper="min-w-56 flex-1"
        />
        <button type="button"
          onClick={() => {
            setFSeccion("");
            setFq("");
            setPage(1);
          }}
          disabled={!fSeccion && !fq}
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
          Nuevo curso
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
        <table className="min-w-[640px] divide-y divide-borde text-sm">
          <thead className="bg-papel">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium text-tinta-suave">Curso</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-tinta-suave">Sección</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-tinta-suave">N° cargas</th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-tinta-suave">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {isLoading && <TableSkeleton cols={4} />}
            {!isLoading &&
              cursos.length === 0 &&
              (fSeccion || fq ? (
                <FilaVacia
                  colSpan={4}
                  mensaje="Sin resultados para los filtros aplicados."
                  accion={
                    <Button
                      tamano="sm"
                      onClick={() => {
                        setFSeccion("");
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
                  mensaje="Todavía no hay cursos cargados."
                  accion={
                    <Button variant="primario" tamano="sm" onClick={openCreate}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Nuevo curso
                    </Button>
                  }
                />
              ))}
            {cursos.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-medium text-tinta">{c.nombre}</td>
                <td className="px-4 py-3 text-tinta-suave">{c.seccion?.nombre}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-papel-hondo px-2 py-0.5 text-xs font-medium text-tinta-suave">
                    {c._count?.cargas ?? 0}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button type="button"
                      onClick={() => openEdit(c)}
                      aria-label={`Editar ${c.nombre}`}
                      className="rounded p-1 text-apagado hover:bg-pizarra/10 hover:text-pizarra"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button"
                      onClick={() => openDelete(c)}
                      aria-label={`Eliminar ${c.nombre}`}
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
                setForm(EMPTY);
              }}
              className="rounded-lg border border-borde-fuerte px-4 py-2 text-sm font-medium text-tinta-suave hover:bg-papel"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!form.seccionId || !form.nombre.trim() || create.isPending || update.isPending}
              className="rounded-lg bg-pizarra px-4 py-2 text-sm font-medium text-chalk hover:bg-pizarra-hondo disabled:opacity-50"
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
    </Page>
  );
}
