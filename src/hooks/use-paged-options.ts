import { useCallback, useEffect, useRef, useState } from "react";
import type { PageResponse } from "../services/api/types";

export function mergeOptionsById<T>(previous: readonly T[], incoming: readonly T[], getId: (item: T) => string): T[] {
  const merged = new Map(previous.map((item) => [getId(item), item]));
  for (const item of incoming) merged.set(getId(item), item);
  return [...merged.values()];
}

export function usePagedOptions<T>({ enabled, scopeKey, fetchPage, getId, pageSize = 20 }: {
  enabled: boolean;
  scopeKey: string;
  fetchPage: (query: string, page: number, pageSize: number) => Promise<PageResponse<T>>;
  getId: (item: T) => string;
  pageSize?: number;
}) {
  const [query, setQueryState] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef<number | null>(null);
  const pageRef = useRef(0);
  const mounted = useRef(true);
  const scope = `${enabled}:${scopeKey}`;
  const currentScope = useRef(scope);
  const currentQuery = useRef(query);
  currentQuery.current = query;
  if (currentScope.current !== scope) {
    currentScope.current = scope;
    generation.current++;
    inFlight.current = null;
  }

  const invalidate = useCallback(() => {
    generation.current++;
    inFlight.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; invalidate(); };
  }, [invalidate]);

  useEffect(() => { setQueryState(""); }, [scopeKey]);

  const load = useCallback(async (nextPage: number, version: number, expectedScope: string, keyword: string) => {
    if (!enabled || generation.current !== version || currentScope.current !== expectedScope || inFlight.current === version) return;
    inFlight.current = version;
    setLoading(true);
    setError("");
    const isCurrent = () => mounted.current && generation.current === version && currentScope.current === expectedScope && currentQuery.current === keyword;
    try {
      const result = await fetchPage(keyword.trim(), nextPage, pageSize);
      if (!isCurrent()) return;
      setItems((previous) => mergeOptionsById(nextPage === 1 ? [] : previous, result.items || [], getId));
      setTotal(result.pagination.total);
      pageRef.current = nextPage;
      setPage(nextPage);
      setLoaded(true);
    } catch (err: unknown) {
      if (isCurrent()) setError(err instanceof Error ? err.message : "加载失败，请重试");
    } finally {
      if (inFlight.current === version) inFlight.current = null;
      if (isCurrent()) setLoading(false);
    }
  }, [enabled, fetchPage, getId, pageSize]);

  const previousQuery = useRef("");
  useEffect(() => {
    invalidate();
    const version = generation.current;
    pageRef.current = 0;
    setItems([]);
    setPage(0);
    setTotal(0);
    setError("");
    setLoaded(false);
    setLoading(enabled);
    const delay = previousQuery.current !== query ? 300 : 0;
    previousQuery.current = query;
    if (!enabled) return;
    const timer = window.setTimeout(() => { void load(1, version, scope, query); }, delay);
    return () => { window.clearTimeout(timer); invalidate(); };
  }, [enabled, scope, query, invalidate, load]);

  const setQuery = (value: string) => {
    if (value === query) return;
    invalidate();
    setQueryState(value);
  };
  const loadMore = () => { void load(pageRef.current + 1, generation.current, scope, query); };
  const upsert = (item: T) => {
    setItems((previous) => mergeOptionsById(previous, [item], getId));
    setTotal((value) => value + (items.some((existing) => getId(existing) === getId(item)) ? 0 : 1));
  };

  return { query, setQuery, items, page, total, loading, error, loaded, hasMore: page > 0 && page * pageSize < total, loadMore, retry: loadMore, invalidate, upsert };
}
