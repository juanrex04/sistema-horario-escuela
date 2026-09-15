import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2, FilterX, CalendarClock, Download, FileUp } from "lucide-react";
import { api, getToken, API_URL } from "../lib/api";
import { useCatalogQuery, usePaginatedQuery } from "../lib/queries";
import { SelectField, TextField } from "../components/fields";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import Pagination from "../components/Pagination";
import TableSkeleton from "../components/TableSkeleton";
import CabeceraGrilla, { columnasGrilla } from "../components/CabeceraGrilla";
import type { BloqueHorario, DiaSemana, Reglas, Seccion } from "../lib/types";

type FormState = { seccionId: string; dias: number[]; numeroPeriodo: string; horaInicio: string; horaFin: string; esAcademico: boolean };

type FilaImportar = { seccion: string; dia: string; numeroPeriodo: string; horaInicio: string; horaFin: string; esAcademico?: boolean };

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

const EMPTY: FormState = { seccionId: "", dias: [], numeroPeriodo: "", horaInicio: "", horaFin: "", esAcademico: true };

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export default function Bloques() {
  const qc = useQueryClient();
  const [fSeccion, setFSeccion] = useState("");
  const [fDia, setFDia] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const filtros = {
    seccionId: fSeccion,
    diaSemanaId: fDia,
    esAcademico: fTipo || undefined,
  };

  const { data: bloques = [] } = useCatalogQuery<BloqueHorario[]>("bloques", "/bloques", filtros);

  const { data: pageData, isLoading: isLoadingTabla } = usePaginatedQuery<BloqueHorario>("bloques-list", "/bloques", filtros, page, pageSize);
  const bloquesList = pageData?.items ?? [];
  const total = pageData?.total ?? 0;

  const { data: secciones = [] } = useQuery({ queryKey: ["secciones"], queryFn: () => api.get<Seccion[]>("/secciones") });
  const { data: dias = [] } = useQuery({ queryKey: ["dias"], queryFn: () => api.get<DiaSemana[]>("/dias") });
  const { data: bloquesTodos = [] } = useQuery({ queryKey: ["bloques-form"], queryFn: () => api.get<BloqueHorario[]>("/bloques") });
  const { data: reglas } = useQuery({ queryKey: ["reglas"], queryFn: () => api.get<Reglas>("/reglas") });

  const diasPorNumero = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const d of dias) m.set(d.numeroDia, d.esHorarioEspecial);
    return m;
  }, [dias]);
  const diasIdToNum = useMemo(() => {
    const m = new Map<number, number>();
    for (const d of dias) m.set(d.id, d.numeroDia);
    return m;
  }, [dias]);

  const seccionId = fSeccion ? Number(fSeccion) : null;
  const seccionActual = useMemo(() => secciones.find((s) => s.id === seccionId), [secciones, seccionId]);

  const grid = useMemo(() => {
    if (!seccionId) return null;
    const secBloques = bloques.filter((b) => b.seccionId === seccionId);
    const ordenKey = new Map<string, number>();
    const ordenFb = new Map<string, number>();
    for (const b of secBloques) {
      const nd = diasIdToNum.get(b.diaSemanaId) ?? b.diaSemanaId;
      const t = toMinutes(b.horaInicio);
      if (!(diasPorNumero.get(nd) ?? false) && !ordenKey.has(b.numeroPeriodo)) ordenKey.set(b.numeroPeriodo, t);
      if (!ordenFb.has(b.numeroPeriodo)) ordenFb.set(b.numeroPeriodo, t);
    }
    const clave = (p: string) => ordenKey.get(p) ?? ordenFb.get(p) ?? 0;
    const periods = Array.from(new Map(secBloques.map((b) => [b.numeroPeriodo, b])).values()).sort(
      (a, b) => clave(a.numeroPeriodo) - clave(b.numeroPeriodo)
    );
    const cells: Record<string, BloqueHorario | undefined> = {};
    for (const b of secBloques) cells[`${diasIdToNum.get(b.diaSemanaId) ?? b.diaSemanaId}-${b.numeroPeriodo}`] = b;
    return { periods, cells };
  }, [seccionId, bloques, diasPorNumero, diasIdToNum]);

  const resumenFranjas = useMemo(() => {
    if (!seccionId) return null;
    const secAcad = bloques.filter((b) => b.seccionId === seccionId && b.esAcademico);
    const numDe = (b: BloqueHorario) => diasIdToNum.get(b.diaSemanaId) ?? b.diaSemanaId;
    const esEsp = (b: BloqueHorario) => diasPorNumero.get(numDe(b)) ?? false;
    const resumen = (pred: (b: BloqueHorario) => boolean) => {
      const arr = secAcad.filter(pred);
      if (arr.length === 0) return null;
      const inicios = arr.map((b) => toMinutes(b.horaInicio));
      const fines = arr.map((b) => toMinutes(b.horaFin));
      const nds = Array.from(new Set(arr.map(numDe))).sort((a, b) => a - b);
      return { n: arr.length, inicio: hhmm(Math.min(...inicios)), fin: hhmm(Math.max(...fines)), nds };
    };
    const regular = resumen((b) => !esEsp(b));
    const viernes = resumen((b) => esEsp(b));
    const reservados = secAcad.filter((b) => {
      if (reglas?.deportes.some((d) => d.seccionId === seccionId && d.diaSemanaId === b.diaSemanaId && d.numeroPeriodo === b.numeroPeriodo)) return true;
      if (
        reglas?.reunionesSeccion.some(
          (r) =>
            r.secciones.some((s) => s.id === seccionId) &&
            toMinutes(b.horaInicio) < toMinutes(r.horaFin) &&
            toMinutes(r.horaInicio) < toMinutes(b.horaFin),
        )
      ) {
        return true;
      }
      return false;
    }).length;
    return { regular, viernes, reservados };
  }, [seccionId, bloques, reglas, diasIdToNum, diasPorNumero]);

  const [editing, setEditing] = useState<BloqueHorario | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<BloqueHorario | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [plantillaLoading, setPlantillaLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ creados: number; actualizados: number; errores: { fila: number; motivo: string }[] } | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["bloques"] });
    qc.invalidateQueries({ queryKey: ["bloques-list"] });
  };

  const create = useMutation({
    mutationFn: (data: {
      seccionId: number;
      diaSemanaIds: number[];
      numeroPeriodo: string;
      horaInicio: string;
      horaFin: string;
      esAcademico: boolean;
    }) => api.post("/bloques", data),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["bloques-form"] });
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

  const importar = useMutation({
    mutationFn: (data: { bloques: FilaImportar[] }) =>
      api.post<{ creados: number; actualizados: number; errores: { fila: number; motivo: string }[] }>("/bloques/importar", data),
    onSuccess: (res) => {
      setImportResult(res);
      invalidate();
      qc.invalidateQueries({ queryKey: ["bloques-form"] });
    },
    onError: (err) => setImportError(err instanceof Error ? err.message : "Error al importar"),
  });

  const diasLunJue = dias.filter((d) => d.numeroDia >= 1 && d.numeroDia <= 4).map((d) => d.id);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY, dias: diasLunJue });
    setFormOpen(true);
  }

  function openEdit(b: BloqueHorario) {
    setEditing(b);
    setForm({
      seccionId: String(b.seccionId),
      dias: [b.diaSemanaId],
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
      diaSemanaIds: form.dias,
      numeroPeriodo: form.numeroPeriodo.trim(),
      horaInicio: form.horaInicio,
      horaFin: form.horaFin,
      esAcademico: form.esAcademico,
    };
    if (editing) update.mutate({ id: editing.id, data });
    else create.mutate(data);
  }

  const timeInvalid = form.horaInicio && form.horaFin && form.horaFin <= form.horaInicio;

  const conflicto = useMemo(() => {
    if (!form.seccionId || !form.numeroPeriodo.trim() || form.dias.length === 0) return [];
    const sid = Number(form.seccionId);
    const per = form.numeroPeriodo.trim().toUpperCase();
    return bloquesTodos.filter((b) => b.seccionId === sid && b.numeroPeriodo.toUpperCase() === per && form.dias.includes(b.diaSemanaId));
  }, [form.seccionId, form.numeroPeriodo, form.dias, bloquesTodos]);

  function toggleDia(id: number) {
    if (editing) return;
    setForm((prev) => ({
      ...prev,
      dias: prev.dias.includes(id) ? prev.dias.filter((d) => d !== id) : [...prev.dias, id],
    }));
  }

  const nombreDia = (id: number) => {
    const nd = dias.find((d) => d.id === id)?.numeroDia;
    return nd ? DIAS[nd - 1] : `Día ${id}`;
  };

  async function descargarPlantilla() {
    setPlantillaLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/bloques/plantilla`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        let message = `Error ${res.status}`;
        try {
          const body = await res.json();
          if (body.error) message = body.error;
        } catch {
          /* noop */
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "plantilla_bloques.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "No se pudo descargar la plantilla.");
    } finally {
      setPlantillaLoading(false);
    }
  }

  function aHhmm(v: unknown): string {
    if (v instanceof Date) {
      return `${String(v.getHours()).padStart(2, "0")}:${String(v.getMinutes()).padStart(2, "0")}`;
    }
    if (typeof v === "number") {
      if (!Number.isFinite(v) || v < 0 || v >= 1) return "";
      const total = Math.round(v * 1440) % 1440;
      return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    }
    if (typeof v === "string") {
      const m = /^(\d{1,2}):(\d{1,2})$/.exec(v.trim());
      if (!m) return "";
      const hh = Number(m[1]);
      const mm = Number(m[2]);
      if (hh > 23 || mm > 59) return "";
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
    return "";
  }

  async function procesarArchivo(file: File) {
    setImportError(null);
    setImportResult(null);
    if (file.size > 5 * 1024 * 1024) {
      setImportError("El archivo supera 5 MB.");
      return;
    }
    const XLSX = await import("xlsx");
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) {
      setImportError("El archivo no contiene una hoja de cálculo válida.");
      return;
    }
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    if (rows.length === 0 || rows.length > 5000) {
      setImportError(
        rows.length === 0
          ? "La hoja no contiene filas de datos."
          : `El archivo tiene ${rows.length} filas; el máximo es 5000.`
      );
      return;
    }
    const bloques: FilaImportar[] = rows
      .filter((r) => String(r["Sección"] ?? "").trim() !== "")
      .map((r) => {
        const academico = String(r["¿Académico?"] ?? "").trim();
        return {
          seccion: String(r["Sección"]).trim(),
          dia: String(r["Día"]).trim(),
          numeroPeriodo: String(r["Período"]).trim(),
          horaInicio: aHhmm(r["Hora inicio"]),
          horaFin: aHhmm(r["Hora fin"]),
          esAcademico: /^(si|sí|1|true)$/i.test(academico)
            ? true
            : /^(no|0|false)$/i.test(academico)
              ? false
              : undefined,
        };
      });
    if (bloques.length === 0) {
      setImportError("Ninguna fila tiene valor en la columna Sección.");
      return;
    }
    importar.mutate({ bloques });
  }

  function clearFilters() {
    setFSeccion("");
    setFDia("");
    setFTipo("");
    setPage(1);
  }

  const filtersActive = fSeccion || fDia || fTipo;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-800">Configuración de Bloques</h1>
        <p className="text-sm text-slate-500">Define la estructura horaria (períodos) por sección y día.</p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <SelectField label="Sección" emptyLabel="Todas" value={fSeccion} onChange={(e) => { setFSeccion(e.target.value); setPage(1); }} wrapper="w-44">
          {secciones.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </SelectField>
        <SelectField label="Día" emptyLabel="Todos" value={fDia} onChange={(e) => { setFDia(e.target.value); setPage(1); }} wrapper="w-36">
          {dias.map((d) => (
            <option key={d.id} value={d.id}>
              Día {d.numeroDia}
            </option>
          ))}
        </SelectField>
        <SelectField label="Tipo" emptyLabel="Todos" value={fTipo} onChange={(e) => { setFTipo(e.target.value); setPage(1); }} wrapper="w-36">
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
        <button
          onClick={() => {
            setImportOpen(true);
            setArchivo(null);
            setImportError(null);
            setImportResult(null);
          }}
          className="flex h-9 items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
        >
          <FileUp className="h-4 w-4" />
          Cargar desde Excel
        </button>
      </div>

      {fSeccion ? (
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <h2 className="text-base font-semibold text-slate-800">Distribución de bloques</h2>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
              Sección: {seccionActual?.nombre}
            </span>
          </div>
          {resumenFranjas && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
              {resumenFranjas.regular && (
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-indigo-400" />
                  <span className="font-medium text-slate-800">Lun–Jue:</span>
                  {resumenFranjas.regular.n} períodos ({resumenFranjas.regular.inicio}–{resumenFranjas.regular.fin})
                </span>
              )}
              {resumenFranjas.viernes && (
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
                  <span className="font-medium text-slate-800">Viernes (especial):</span>
                  {resumenFranjas.viernes.n} períodos ({resumenFranjas.viernes.inicio}–{resumenFranjas.viernes.fin})
                </span>
              )}
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-slate-400" />
                <span className="font-medium text-slate-800">Reservados:</span>
                {resumenFranjas.reservados} bloques (deportes y reunión de sección)
              </span>
            </div>
          )}
          {grid && grid.periods.length > 0 ? (
            <div className="overflow-x-auto p-4">
              <table className="w-full text-sm">
                <thead>
                  <CabeceraGrilla labelColumna="Período" columnas={columnasGrilla(diasPorNumero, DIAS)} />
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {grid.periods.map((p) => (
                    <tr key={p.numeroPeriodo}>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className="font-medium text-slate-800">{p.numeroPeriodo}</span>
                      </td>
                        {DIAS.map((_, i2) => {
                          const idx = i2 + 1;
                          const cell = grid.cells[`${idx}-${p.numeroPeriodo}`];
                          const esEspecialDia = diasPorNumero.get(idx) ?? false;
                          return (
                            <td key={idx} className={`px-3 py-2 ${esEspecialDia ? "border-l-2 border-dashed border-amber-300" : ""}`}>
                              {cell ? (
                                cell.esAcademico ? (
                                  <div className="rounded-lg bg-indigo-50 px-3 py-2">
                                    <p className="font-semibold text-indigo-800">{cell.numeroPeriodo}</p>
                                    <p className="text-xs text-indigo-600">
                                      {cell.horaInicio}-{cell.horaFin} · Académico
                                    </p>
                                  </div>
                                ) : (
                                  <div className="rounded-lg bg-amber-50 px-3 py-2">
                                    <p className="font-semibold text-amber-700">{cell.numeroPeriodo}</p>
                                    <p className="text-xs text-amber-600">
                                      {cell.horaInicio}-{cell.horaFin} · Recreo
                                    </p>
                                  </div>
                                )
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              Esta sección aún no tiene bloques definidos.
            </p>
          )}
        </section>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
          <CalendarClock className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">
            Hasta que no selecciones una sección no se mostrará la distribución de los bloques.
          </p>
          <p className="mt-1 text-xs text-slate-400">Usa el filtro de sección de arriba para visualizar la grilla.</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800">Listado y gestión de bloques</h2>
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
            {isLoadingTabla && <TableSkeleton cols={8} />}
            {!isLoadingTabla && bloquesList.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                  <Search className="mx-auto mb-2 h-5 w-5" />
                  Sin resultados para los filtros aplicados.
                </td>
              </tr>
            )}
            {bloquesList.map((b) => (
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
          {editing ? (
            <p className="text-sm text-slate-700">
              Día: <span className="font-medium">{nombreDia(editing.diaSemanaId)}</span>
            </p>
          ) : (
            <div>
              <span className="mb-2 block text-sm font-medium text-slate-700">
                Días a los que aplica este período *
              </span>
              <div className="flex gap-2 pb-2">
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, dias: diasLunJue }))}
                  className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                >
                  Lun–Jue
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const v = dias.find((d) => d.numeroDia === 5);
                    if (v) setForm((prev) => ({ ...prev, dias: [v.id] }));
                  }}
                  className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                >
                  Viernes
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {dias.map((d) => (
                  <label
                    key={d.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                      form.dias.includes(d.id) ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-600"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form.dias.includes(d.id)}
                      onChange={() => toggleDia(d.id)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    {nombreDia(d.id)}
                  </label>
                ))}
              </div>
              {form.dias.length === 0 && <p className="mt-1 text-sm text-red-600">Selecciona al menos un día.</p>}
              {conflicto.length > 0 && (
                <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Ya existe bloque para esta sección y período en{" "}
                  {conflicto.map((b) => nombreDia(b.diaSemanaId)).join(", ")} (hora actual {conflicto[0].horaInicio}–{conflicto[0].horaFin}).
                  Se sobrescribirá con el nuevo horario en esos días.
                </p>
              )}
            </div>
          )}
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
              disabled={!form.seccionId || form.dias.length === 0 || !form.numeroPeriodo.trim() || !form.horaInicio || !form.horaFin || timeInvalid || create.isPending || update.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {create.isPending || update.isPending ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={importOpen}
        title="Cargar bloques desde Excel"
        onClose={() => {
          setImportOpen(false);
          importar.reset();
        }}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Descarga la plantilla, llénala con los períodos de cada sección (usa los desplegables de
            Sección, Día y ¿Académico?) y súbela para crear o actualizar los bloques de una sola vez.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={descargarPlantilla}
              disabled={plantillaLoading}
              className="flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {plantillaLoading ? "Preparando..." : "Descargar plantilla"}
            </button>
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
              <FileUp className="h-4 w-4" />
              <span className="max-w-56 truncate">{archivo ? archivo.name : "Seleccionar archivo .xlsx"}</span>
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setArchivo(f);
                    setImportError(null);
                    setImportResult(null);
                    importar.reset();
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {archivo && (
            <button
              type="button"
              onClick={() => procesarArchivo(archivo)}
              disabled={importar.isPending}
              className="flex h-9 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {importar.isPending ? "Procesando..." : "Procesar cargue"}
            </button>
          )}
          {importar.error && !importError && (
            <p className="text-sm text-red-600">{importar.error instanceof Error ? importar.error.message : "Error al importar"}</p>
          )}
          {importError && <p className="text-sm text-red-600">{importError}</p>}
          {importResult && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm text-slate-700">
                Se crearon <span className="font-semibold">{importResult.creados}</span> bloque(s), se
                actualizaron <span className="font-semibold">{importResult.actualizados}</span> y se
                reportaron <span className="font-semibold">{importResult.errores.length}</span> error(es).
              </p>
              {importResult.errores.length > 0 && (
                <div className="mt-3 overflow-x-auto rounded-lg border border-red-200 bg-white">
                  <table className="min-w-full divide-y divide-slate-100 text-sm">
                    <thead className="bg-red-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-red-700">Fila</th>
                        <th className="px-3 py-2 text-left font-medium text-red-700">Motivo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importResult.errores.map((e) => (
                        <tr key={e.fila}>
                          <td className="px-3 py-2 text-slate-600">{e.fila}</td>
                          <td className="px-3 py-2 text-slate-700">{e.motivo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => {
                setImportOpen(false);
                importar.reset();
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cerrar
            </button>
          </div>
        </div>
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