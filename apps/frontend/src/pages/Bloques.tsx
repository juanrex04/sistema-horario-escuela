import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2, FilterX } from "lucide-react";
import { api } from "../lib/api";
import { useCatalogQuery } from "../lib/queries";
import { SelectField, TextField } from "../components/fields";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import type { BloqueHorario, DiaSemana, Seccion } from "../lib/types";

type FormState = { seccionId: string; diaSemanaId: string; numeroPeriodo: string; horaInicio: string; horaFin: string; esAcademico: boolean };

const EMPTY: FormState = { seccionId: "", diaSemanaId: "", numeroPeriodo: "", horaInicio: "", horaFin: "", esAcademico: true };

export default function Bloques() {
  const qc = useQueryClient();
  const [fSeccion, setFSeccion] = useState("");
  const [fDia, setFDia] = useState("");
  const [fTipo, setFTipo] = useState("");

  const { data: bloques = [], isLoading } = useCatalogQuery<BloqueHorario[]>("bloques", "/bloques", {
    seccionId: fSeccion,
    diaSemanaId: fDia,
    esAcademico: fTipo || undefined,
  });

  const { data: secciones = [] } = useQuery({ queryKey: ["secciones"], queryFn: () => api.get<Seccion[]>("/secciones") });
  const { data: dias = [] } = useQuery({ queryKey: ["dias"], queryFn: () => api.get<DiaSemana[]>("/dias") });

  const [editing, setEditing] = useState<BloqueHorario | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<BloqueHorario | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["bloques"] });

  const create = useMutation({
    mutationFn: (data: Omit<BloqueHorario, "id">) => api.post("/bloques", data),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY);
    },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<BloqueHorario> }) => api.patch(`/bloques/${id}`, data),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/bloques/${id}`),
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

  function openEdit(b: BloqueHorario) {
    setEditing(b);
    setForm({
      seccionId: String(b.seccionId),
      diaSemanaId: String(b.diaSemanaId),
      numeroPeriodo: b.numeroPeriodo,
      horaInicio: b.horaInicio.slice(0, 5),
      horaFin: b.horaFin.slice(0, 5),
      esAcademico: b.esAcademico,
    });
    setFormOpen(true);
  }

  function openDelete(b: BloqueHorario) {
    remove.reset();
    setToDelete(b);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      seccionId: Number(form.seccionId),
      diaSemanaId: Number(form.diaSemanaId),
      numeroPeriodo: form.numeroPeriodo.trim(),
      horaInicio: form.horaInicio,
      horaFin: form.horaFin,
      esAcademico: form.esAcademico,
    };
    if (editing) update.mutate({ id: editing.id, data });
    else create.mutate(data);
  }

  const timeInvalid = form.horaInicio && form.horaFin && form.horaFin <= form.horaInicio;

  function clearFilters() {
    setFSeccion("");
    setFDia("");
    setFTipo("");
  }

  const filtersActive = fSeccion || fDia || fTipo;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-800">Configuración de Bloques</h1>
        <p className="text-sm text-slate-500">Define la estructura horaria (períodos) por sección y día.</p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <SelectField label="Sección" emptyLabel="Todas" value={fSeccion} onChange={(e) => setFSeccion(e.target.value)} wrapper="w-44">
          {secciones.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </SelectField>
        <SelectField label="Día" emptyLabel="Todos" value={fDia} onChange={(e) => setFDia(e.target.value)} wrapper="w-36">
          {dias.map((d) => (
            <option key={d.id} value={d.id}>
              Día {d.numeroDia}
            </option>
          ))}
        </SelectField>
        <SelectField label="Tipo" emptyLabel="Todos" value={fTipo} onChange={(e) => setFTipo(e.target.value)} wrapper="w-36">
          <option value="true">Académico</option>
          <option value="false">No académico</option>
        </SelectField>
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
          Nuevo bloque
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Sección</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Día</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Período</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Inicio</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Fin</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Tipo</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Usado</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                  Cargando...
                </td>
              </tr>
            )}
            {!isLoading && bloques.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                  <Search className="mx-auto mb-2 h-5 w-5" />
                  Sin resultados para los filtros aplicados.
                </td>
              </tr>
            )}
            {bloques.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{b.seccion?.nombre}</td>
                <td className="px-4 py-3 text-slate-600">Día {b.diaSemana?.numeroDia}</td>
                <td className="px-4 py-3 text-slate-600">{b.numeroPeriodo}</td>
                <td className="px-4 py-3 text-slate-600">{b.horaInicio}</td>
                <td className="px-4 py-3 text-slate-600">{b.horaFin}</td>
                <td className="px-4 py-3">
                  {b.esAcademico ? (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">Académico</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Recreo</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {b._count?.asignaciones ?? 0}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button
                      onClick={() => openEdit(b)}
                      className="rounded p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => openDelete(b)}
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
        title={editing ? "Editar bloque" : "Nuevo bloque"}
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
          <SelectField label="Día *" required value={form.diaSemanaId} onChange={(e) => setForm({ ...form, diaSemanaId: e.target.value })} emptyLabel="Selecciona día...">
            {dias.map((d) => (
              <option key={d.id} value={d.id}>
                Día {d.numeroDia}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Período *"
            required
            value={form.numeroPeriodo}
            onChange={(e) => setForm({ ...form, numeroPeriodo: e.target.value })}
            placeholder="1, 2, 3..."
          />
          <div className="flex gap-3">
            <TextField label="Hora inicio *" type="time" required value={form.horaInicio} onChange={(e) => setForm({ ...form, horaInicio: e.target.value })} />
            <TextField label="Hora fin *" type="time" required value={form.horaFin} onChange={(e) => setForm({ ...form, horaFin: e.target.value })} />
          </div>
          {timeInvalid && <p className="text-sm text-red-600">La hora de fin debe ser posterior a la de inicio.</p>}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.esAcademico}
              onChange={(e) => setForm({ ...form, esAcademico: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Período académico (no es recreo)
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
              disabled={!form.seccionId || !form.diaSemanaId || !form.numeroPeriodo.trim() || !form.horaInicio || !form.horaFin || timeInvalid || create.isPending || update.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {create.isPending || update.isPending ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar bloque"
        message={`¿Eliminar el período "${toDelete?.numeroPeriodo}" (${toDelete?.horaInicio}-${toDelete?.horaFin}) de ${toDelete?.seccion?.nombre}?`}
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