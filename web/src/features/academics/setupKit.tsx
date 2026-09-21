"use client";

/*
 * Small helpers shared by the Academics setup screens (SCR-092 to SCR-100):
 * page-head buttons that talk to the live component below them, the mock's
 * modal for forms, CSV export, the year picker and per-row student counts.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ErrorNote } from "@/components/ui/states";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { AcademicYear } from "./types";

const EVENT = "academics:page-action";

/** A page-head button. The page is a server component, so the button
 *  announces itself and the live component on the page answers. */
export function PageAction({ name, icon, primary = false, children }: { name: string; icon: IconName; primary?: boolean; children: string }) {
  return (
    <button type="button" className={`btn ${primary ? "primary" : ""}`} onClick={() => window.dispatchEvent(new CustomEvent(EVENT, { detail: name }))}>
      <Icon name={icon} className="sm" />
      {children}
    </button>
  );
}

/** Run `fn` when the page-head button called `name` is pressed. */
export function usePageAction(name: string, fn: () => void) {
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent).detail === name) fn();
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [name, fn]);
}

/** The mock's modal, holding a real form or a record's actions. */
export function Dialog({ title, onClose, children, error }: { title: string; onClose: () => void; children: ReactNode; error?: string | null }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div
      className="modal-backdrop show"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxHeight: "90vh", overflow: "auto" }}>
        <h2>{title}</h2>
        <ErrorNote>{error}</ErrorNote>
        {children}
      </section>
    </div>
  );
}

/** Form buttons at the foot of a dialog. */
export function DialogActions({ onCancel, saving, submit = "Save", children }: { onCancel: () => void; saving?: boolean; submit?: string | null; children?: ReactNode }) {
  return (
    <div className="actions" style={{ marginTop: 22, justifyContent: "flex-end" }}>
      {children}
      <button type="button" className="btn" onClick={onCancel}>
        {submit ? "Cancel" : "Close"}
      </button>
      {submit ? (
        <button type="submit" className="btn primary" disabled={saving}>
          <Icon name="check" className="sm" />
          {saving ? "Saving…" : submit}
        </button>
      ) : null}
    </div>
  );
}

export function Field({ label, children, required = false, full = false }: { label: string; children: ReactNode; required?: boolean; full?: boolean }) {
  return (
    <label className={`field ${full ? "full" : ""}`}>
      <span>
        {label}
        {required ? <span className="req">*</span> : null}
      </span>
      {children}
    </label>
  );
}

export function Kv({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Save what the table shows as a CSV file. */
export function downloadCsv(filename: string, columns: string[], rows: string[][]) {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const text = [columns, ...rows].map((r) => r.map(cell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** The school's years, defaulting to the current one. */
export function useYears() {
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const [yearId, setYearId] = useState<number | null>(null);
  useEffect(() => {
    if (yearId === null && years.data?.length) setYearId((years.data.find((y) => y.is_current) ?? years.data[0]).id);
  }, [years.data, yearId]);
  const year = years.data?.find((y) => y.id === yearId) ?? null;
  return { years: years.data ?? [], error: years.error, yearId, setYearId, year };
}

/** Year picker for the filter bar. */
export function YearSelect({ years, yearId, onChange }: { years: AcademicYear[]; yearId: number | null; onChange: (id: number) => void }) {
  return (
    <select aria-label="Academic year" value={yearId ?? ""} onChange={(e) => onChange(Number(e.target.value))}>
      {years.map((y) => (
        <option key={y.id} value={y.id}>
          {`${y.name}${y.is_current ? " (current)" : ""}`}
        </option>
      ))}
    </select>
  );
}

/**
 * How many students each class or section holds: one count per row, read
 * from the students list with page_size=1 (the API has no count endpoint).
 */
export function useStudentCounts(by: "class_id" | "section_id", ids: number[], yearId: number | null, version = 0) {
  const [counts, setCounts] = useState<Map<number, number>>(new Map());
  const key = ids.join(",");
  useEffect(() => {
    if (!yearId || !ids.length) {
      setCounts(new Map());
      return;
    }
    let live = true;
    Promise.all(
      ids.map((id) =>
        api
          .get<{ total: number }>("/api/v1/school/students", { academic_year_id: yearId, [by]: id, status: "active", page_size: 1 })
          .then((r) => [id, r.total] as const)
          .catch(() => null),
      ),
    ).then((all) => {
      if (live) setCounts(new Map(all.filter((x): x is readonly [number, number] => x !== null)));
    });
    return () => {
      live = false;
    };
    // key stands for ids
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [by, key, yearId, version]);
  return counts;
}

/** Filter rows by a search box, as the mock's table search does. */
export function useSearch<T>(items: T[], text: (t: T) => string) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((t) => text(t).toLowerCase().includes(s)) : items;
    // text is a stable projection per screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q]);
  return { q, setQ, shown };
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="searchbox">
      <Icon name="search" className="sm" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label="Search records" />
    </div>
  );
}
