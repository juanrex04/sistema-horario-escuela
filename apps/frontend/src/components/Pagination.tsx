import { ChevronLeft, ChevronRight } from "lucide-react";

type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
};

const PAGE_SIZES = [10, 25, 50, 100];

export default function Pagination({ page, pageSize, total, onPage, onPageSize }: PaginationProps) {
  if (total === 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const pages: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    const window = [page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages);
    if (window[0] > 1) pages.push(1, window[0] > 2 ? "…" : 2);
    pages.push(...window);
    if (window[window.length - 1] < totalPages)
      pages.push(window[window.length - 1] < totalPages - 1 ? "…" : totalPages - 1, totalPages);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm">
      <span className="text-slate-500">
        Mostrando {start}–{end} de {total}
      </span>
      <div className="flex items-center gap-2">
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-600 focus:border-indigo-500 focus:outline-none"
          aria-label="Filas por página"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s} / página
            </option>
          ))}
        </select>
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="flex h-8 items-center gap-1 rounded-lg border border-slate-300 px-2.5 font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </button>
        <div className="flex items-center gap-1">
          {pages.map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} className="px-1 text-slate-400">
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onPage(p)}
                className={`h-8 min-w-8 rounded-lg px-2 text-sm font-medium ${
                  p === page ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {p}
              </button>
            )
          )}
        </div>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="flex h-8 items-center gap-1 rounded-lg border border-slate-300 px-2.5 font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          Siguiente
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}