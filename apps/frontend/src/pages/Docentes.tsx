import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, FilterX } from "lucide-react";
import { api } from "../lib/api";
import { useCatalogQuery, usePaginatedQuery } from "../lib/queries";
import { SelectField, TextField } from "../components/fields";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import Pagination from "../components/Pagination";
import TableSkeleton from "../components/TableSkeleton";
import FilaVacia from "../components/FilaVacia";
import Button from "../components/Button";
import Page from "../components/Page";
import type { Departamento, DiaSemana, Profesor, Seccion } from "../lib/types";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

type FormState = {
  nombre: string;
  departamentoId: string;
  seccionBaseId: string;
  prefiereGruposConsecutivos: boolean;
  esTiempoCompleto: boolean;
  peParesMismoDia: boolean;
  jornada: { diaSemanaId: number; horaFin: string }[];
};

const EMPTY: FormState = {
  nombre: "",
  departamentoId: "",
  seccionBaseId: "",
  prefiereGruposConsecutivos: false,
  esTiempoCompleto: true,
  peParesMismoDia: false,
  jornada: [],
};

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
  const { data: dias = [] } = useQuery({ queryKey: ["dias"], queryFn: () => api.get<DiaSemana[]>("/dias") });

  const nombreDia = (id: number) => {
    const d = dias.find((x) => x.id === id);
    return d ? DIAS[d.numeroDia - 1] ?? `Día ${d.numeroDia}` : "?";
  };

  const jornadaCompleta = () => dias.map((d) => ({ diaSemanaId: d.id, horaFin: "16:00" }));

  const [editing, setEditing] = useState<Profesor | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Profesor | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["profesores"] });

  const create = useMutation({
    mutationFn: (data: {
      nombre: string;
      departamentoId?: number | null;
      seccionBaseId: number;
      prefiereGruposConsecutivos?: boolean;
      esTiempoCompleto?: boolean;
      peParesMismoDia?: boolean;
      jornadaParcial?: { diaSemanaId: number; horaFin: string }[] | null;
    }) => api.post("/profesores", data),
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
    setForm({
      nombre: p.nombre,
      departamentoId: p.departamentoId ? String(p.departamentoId) : "",
      seccionBaseId: String(p.seccionBaseId),
      prefiereGruposConsecutivos: p.prefiereGruposConsecutivos ?? false,
      esTiempoCompleto: p.esTiempoCompleto ?? true,
      peParesMismoDia: p.peParesMismoDia ?? false,
      jornada: (p.jornadaParcial ?? []).map((j) => ({ diaSemanaId: j.diaSemanaId, horaFin: j.horaFin })),
    });
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
      esTiempoCompleto: form.esTiempoCompleto,
      peParesMismoDia: form.peParesMismoDia,
      jornadaParcial: form.esTiempoCompleto ? null : form.jornada,
    };
    if (editing) update.mutate({ id: editing.id, data });
    else create.mutate(data);
  }

  return (
    <Page titulo="Docentes" descripcion="Gestión del cuerpo docente y su adscripción.">
      <div className="flex flex-wrap items-end gap-3 border border-borde bg-superficie p-4">
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
        <button type="button"
          onClick={() => {
            setFq("");
            setFDepto("");
            setTieneCargas("");
            setFSeccionBase("");
            setPage(1);
          }}
          disabled={!fq && !fDepto && !tieneCargas && !fSeccionBase}
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
          Nuevo docente
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
        <table className="min-w-[840px] divide-y divide-borde text-sm">
          <thead className="bg-papel">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium text-tinta-suave">Nombre</th>
              <th scope="col" className="px-4 py-3 text-center font-medium text-tinta-suave">Sección base</th>
              <th scope="col" className="px-4 py-3 text-center font-medium text-tinta-suave">Jornada</th>
              <th scope="col" className="px-4 py-3 text-center font-medium text-tinta-suave">Depto.</th>
              <th scope="col" className="px-4 py-3 text-center font-medium text-tinta-suave">Carga</th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-tinta-suave">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {isLoading && <TableSkeleton cols={6} />}
            {!isLoading &&
              profesores.length === 0 &&
              (fq || fDepto || tieneCargas || fSeccionBase ? (
                <FilaVacia
                  colSpan={6}
                  mensaje="Sin resultados para los filtros aplicados."
                  accion={
                    <Button
                      tamano="sm"
                      onClick={() => {
                        setFq("");
                        setFDepto("");
                        setTieneCargas("");
                        setFSeccionBase("");
                        setPage(1);
                      }}
                    >
                      Limpiar filtros
                    </Button>
                  }
                />
              ) : (
                <FilaVacia
                  colSpan={6}
                  mensaje="Todavía no hay docentes cargados."
                  accion={
                    <Button variant="primario" tamano="sm" onClick={openCreate}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Nuevo docente
                    </Button>
                  }
                />
              ))}
            {profesores.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-medium text-tinta">
                  {p.nombre}
                  {p.prefiereGruposConsecutivos && (
                    <span
                      className="ml-2 rounded-full bg-ambar-suave px-2 py-0.5 text-xs font-medium text-ambar"
                      title="Prefiere clases consecutivas entre grupos del mismo grado (misma materia y sección)"
                      aria-label="Prefiere clases consecutivas entre grupos del mismo grado (misma materia y sección)"
                    >
                      Consecutivos
                    </span>
                  )}
                  {p.peParesMismoDia && (
                    <span
                      className="ml-2 rounded-full bg-verde-suave px-2 py-0.5 text-xs font-medium text-verde"
                      title="Empareja sus grupos de P.E. del mismo grado para que se dicten el mismo día"
                      aria-label="Empareja sus grupos de P.E. del mismo grado para que se dicten el mismo día"
                    >
                      P.E. pareada
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-tinta-suave">
                  <span className="rounded-full bg-pizarra/10 px-2 py-0.5 text-xs font-medium text-pizarra">
                    {p.seccionBase?.nombre ?? "-"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {p.esTiempoCompleto !== false ? (
                    <span className="rounded-full bg-verde-suave px-2 py-0.5 text-xs font-medium text-verde">
                      Tiempo completo
                    </span>
                  ) : (
                    <span
                      className="rounded-full bg-pizarra/10 px-2 py-0.5 text-xs font-medium text-pizarra"
                      title={(p.jornadaParcial ?? [])
                        .map((j) => `${nombreDia(j.diaSemanaId)} hasta ${j.horaFin}`)
                        .join(", ")}
                      aria-label={`Jornada parcial: ${(p.jornadaParcial ?? [])
                        .map((j) => `${nombreDia(j.diaSemanaId)} hasta ${j.horaFin}`)
                        .join(", ")}`}
                    >
                      Parcial · {(p.jornadaParcial ?? []).length} día(s)
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-tinta-suave">{p.departamento?.nombre ?? "-"}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-papel-hondo px-2 py-0.5 text-xs font-medium text-tinta-suave">
                    {p._count?.cargas ?? 0}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button type="button"
                      onClick={() => openEdit(p)}
                      aria-label={`Editar ${p.nombre}`}
                      className="rounded p-1 text-apagado hover:bg-pizarra/10 hover:text-pizarra"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button"
                      onClick={() => openDelete(p)}
                      aria-label={`Eliminar ${p.nombre}`}
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
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-borde bg-papel px-3 py-2.5">
            <input
              type="checkbox"
              checked={form.prefiereGruposConsecutivos}
              onChange={(e) => setForm({ ...form, prefiereGruposConsecutivos: e.target.checked })}
              className="mt-0.5"
            />
            <span className="text-sm leading-snug text-tinta-suave">
              Prefiere clases consecutivas entre grupos del mismo grado
              <span className="block text-xs text-apagado">
                (misma materia y sección, p. ej. 2A y 2B).
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-borde bg-papel px-3 py-2.5">
            <input
              type="checkbox"
              checked={form.peParesMismoDia}
              onChange={(e) => setForm({ ...form, peParesMismoDia: e.target.checked })}
              className="mt-0.5"
            />
            <span className="text-sm leading-snug text-tinta-suave">
              Empareja sus grupos de P.E. del mismo grado
              <span className="block text-xs text-apagado">
                Los dos grupos de un grado (p. ej. 7A y 7B) se programan el mismo día.
                Solo aplica entre grupos de la misma sección que él dicta.
              </span>
            </span>
          </label>
          <fieldset className="rounded border border-borde bg-papel p-3">
            <legend className="px-1 text-sm font-medium text-tinta-suave">Jornada</legend>
            <div className="flex flex-wrap gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-tinta-suave">
                <input
                  type="radio"
                  name="jornada"
                  checked={form.esTiempoCompleto}
                  onChange={() => setForm({ ...form, esTiempoCompleto: true })}
                />
                Tiempo completo
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-tinta-suave">
                <input
                  type="radio"
                  name="jornada"
                  checked={!form.esTiempoCompleto}
                  onChange={() => setForm({ ...form, esTiempoCompleto: false, jornada: jornadaCompleta() })}
                />
                Tiempo parcial
              </label>
            </div>
            {form.esTiempoCompleto ? (
              <p className="mt-2 text-xs text-apagado">Lun–Vie · 06:45–16:00</p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {dias.map((d) => {
                  const dia = form.jornada.find((j) => j.diaSemanaId === d.id);
                  const marcado = dia !== undefined;
                  return (
                    <div
                      key={d.id}
                      className="flex items-center gap-3 rounded-lg border border-borde bg-superficie px-2 py-1.5"
                    >
                      <input
                        type="checkbox"
                        aria-label={`Trabaja el ${DIAS[d.numeroDia - 1] ?? `día ${d.numeroDia}`}`}
                        checked={marcado}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setForm((prev) => ({
                            ...prev,
                            jornada: on
                              ? [...prev.jornada, { diaSemanaId: d.id, horaFin: "16:00" }]
                              : prev.jornada.filter((j) => j.diaSemanaId !== d.id),
                          }));
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-tinta-suave">{DIAS[d.numeroDia - 1] ?? `Día ${d.numeroDia}`}</span>
                      <input
                        type="time"
                        aria-label={`Hora de fin del ${DIAS[d.numeroDia - 1] ?? `día ${d.numeroDia}`}`}
                        value={marcado ? dia.horaFin : ""}
                        disabled={!marcado}
                        onChange={(e) => {
                          const hora = e.target.value;
                          setForm((prev) => ({
                            ...prev,
                            jornada: prev.jornada.map((j) =>
                              j.diaSemanaId === d.id ? { ...j, horaFin: hora } : j
                            ),
                          }));
                        }}
                        className="w-28 shrink-0 rounded border border-borde-fuerte px-2 py-1 text-sm text-tinta-suave disabled:opacity-40"
                      />
                    </div>
                  );
                })}
                {form.jornada.length === 0 && (
                  <p role="alert" className="text-xs text-ambar">Marca al menos un día de trabajo.</p>
                )}
              </div>
            )}
          </fieldset>
          {(create.error || update.error) && (
            <p role="alert" className="text-sm text-tiza">
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
              disabled={
                !form.nombre.trim() ||
                !form.seccionBaseId ||
                (form.esTiempoCompleto === false && form.jornada.length === 0) ||
                create.isPending ||
                update.isPending
              }
              className="rounded-lg bg-pizarra px-4 py-2 text-sm font-medium text-chalk hover:bg-pizarra-hondo disabled:opacity-50"
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
    </Page>
  );
}
