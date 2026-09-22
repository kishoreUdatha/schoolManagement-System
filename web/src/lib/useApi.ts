"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText } from "./api";

type Params = Record<string, string | number | boolean | null | undefined>;

/**
 * GET a resource and keep it fresh when its params change.
 * `path` null means "not yet" (e.g. waiting for the current year).
 */
export function useApi<T>(path: string | null, params?: Params) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const key = path ? path + JSON.stringify(params ?? {}) : null;
  const seq = useRef(0);
  const lastKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!path) return;
    const mine = ++seq.current;
    // A different resource (another child, another record): never show the old one meanwhile.
    if (lastKey.current !== key) {
      lastKey.current = key;
      setData(null);
      setError(null);
    }
    setLoading(true);
    try {
      const d = await api.get<T>(path, params);
      if (mine === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (mine === seq.current) setError(errorText(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
    // key captures path and params
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, loading, reload: load };
}
