import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { Paginated } from "./types";

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

export function qs(params: QueryParams = {}): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export function useCatalogQuery<T>(key: string, path: string, params: QueryParams = {}) {
  const q = qs(params);
  return useQuery<T>({ queryKey: [key, q], queryFn: () => api.get<T>(`${path}${q}`) });
}

export function usePaginatedQuery<T>(
  key: string,
  path: string,
  params: QueryParams,
  page: number,
  pageSize: number
) {
  const q = qs({ ...params, page, pageSize });
  return useQuery<Paginated<T>>({ queryKey: [key, q], queryFn: () => api.get<Paginated<T>>(`${path}${q}`) });
}