"use client";

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { api } from "@/lib/api";
import { auth } from "@/lib/auth";

export type AcademicYear = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_archived: boolean;
};

type AcademicYearState = {
  /** Live years, newest first. Archived ones are not offered. */
  years: AcademicYear[];
  /** The chosen year, or null until the list arrives. */
  year: AcademicYear | null;
  yearId: number | null;
  setYearId: (id: number) => void;
  loading: boolean;
};

const AcademicYearContext = createContext<AcademicYearState | null>(null);

/** Which year the workspace is looking at.
 *
 *  Before this, every page fetched the list and picked `is_current` for
 *  itself, so there was no way to look at last year: you would have had to
 *  change which year was current, for everybody, to read one report.
 *
 *  Only school admins can read /school/academic-years — every route under it
 *  is theirs — so this provider is mounted on that portal alone and yields
 *  null elsewhere. `useAcademicYear` returning null is the normal case for
 *  seven of the eight portals, not an error.
 */
const STORAGE_KEY = "sms.academic-year";

export function AcademicYearProvider({ children }: { children: ReactNode }) {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearIdState] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Keyed by school: a remembered id from one school means nothing in
  // another, and silently filtering by it would be worse than forgetting it.
  const storageKey = useMemo(() => {
    const school = auth.getUser()?.school_id;
    return school ? `${STORAGE_KEY}.${school}` : null;
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .get<AcademicYear[]>("/api/v1/school/academic-years")
      .then((r) => {
        if (!alive) return;
        const live = r.data.filter((y) => !y.is_archived);
        setYears(live);

        // A remembered choice, but only if it is still one of the options —
        // a year can be archived or deleted between visits.
        let pick: number | null = null;
        if (storageKey) {
          const saved = Number(window.localStorage.getItem(storageKey));
          if (saved && live.some((y) => y.id === saved)) pick = saved;
        }
        setYearIdState(pick ?? live.find((y) => y.is_current)?.id ?? live[0]?.id ?? null);
      })
      .catch(() => {
        if (alive) setYears([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [storageKey]);

  const setYearId = useCallback(
    (id: number) => {
      setYearIdState(id);
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, String(id));
        } catch {
          // Private windows and blocked site data. The choice still holds for
          // this session; it just will not be remembered for the next one.
        }
      }
    },
    [storageKey]
  );

  const value = useMemo<AcademicYearState>(
    () => ({
      years,
      yearId,
      year: years.find((y) => y.id === yearId) ?? null,
      setYearId,
      loading,
    }),
    [years, yearId, setYearId, loading]
  );

  return (
    <AcademicYearContext.Provider value={value}>{children}</AcademicYearContext.Provider>
  );
}

/** The chosen year, or null on a portal that has no year picker. */
export function useAcademicYear(): AcademicYearState | null {
  return useContext(AcademicYearContext);
}
