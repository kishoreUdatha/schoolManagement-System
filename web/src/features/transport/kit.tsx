"use client";

/*
 * Small pieces the operations screens (transport, library, hostel, health,
 * campus security) share. They only use the mock's existing classes.
 */

import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { api, type Paginated } from "@/lib/api";

/** Today as YYYY-MM-DD in the viewer's time zone (not UTC). */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Add days to a YYYY-MM-DD date. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

/** "07:10:00" -> "07:10 AM". Empty -> "—". */
export function time12(v: string | null | undefined): string {
  if (!v) return "—";
  const [h, m] = v.split(":").map(Number);
  if (Number.isNaN(h)) return v;
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Whole minutes since an ISO timestamp, or null. */
export function minutesSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60_000));
}

export function ago(mins: number): string {
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} day(s) ago`;
}

/** A value that settles a moment after the last change (search boxes). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="searchbox">
      <Icon name="search" className="sm" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder.replace(/…$/, "")} />
    </div>
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

export function Tip({ children, warn = false }: { children: ReactNode; warn?: boolean }) {
  return (
    <div className={`tip ${warn ? "warn" : ""}`}>
      <Icon name={warn ? "bell" : "shield"} className="sm" />
      <span>{children}</span>
    </div>
  );
}

/** A form field in the mock's `.field` style. */
export function Field({ label, required = false, full = false, children }: { label: string; required?: boolean; full?: boolean; children: ReactNode }) {
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

/** The mock's dialog (`.modal-backdrop` / `.modal`), for quick forms. */
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-backdrop show" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={wide ? { maxWidth: 720 } : undefined}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Save / cancel row at the bottom of a modal form. */
export function ModalActions({ onClose, saving, label }: { onClose: () => void; saving: boolean; label: string }) {
  return (
    <div className="actions row">
      <button type="button" className="btn" onClick={onClose}>
        Cancel
      </button>
      <button type="submit" className="btn primary" disabled={saving}>
        <Icon name="check" className="sm" />
        {saving ? "Saving…" : label}
      </button>
    </div>
  );
}

/** Read a FormData text field: trimmed, or null when blank. */
export const formText = (f: FormData, k: string) => String(f.get(k) ?? "").trim() || null;
/** Read a FormData number field, or null when blank. */
export const formNum = (f: FormData, k: string) => {
  const v = formText(f, k);
  return v === null ? null : Number(v);
};

export type PickedStudent = { id: number; full_name: string; admission_no: string };

/** Type-ahead over the school's active students (GET /api/v1/school/students?search=). */
export function StudentPicker({ value, onChange, label = "Student", required = false }: { value: PickedStudent | null; onChange: (s: PickedStudent | null) => void; label?: string; required?: boolean }) {
  const [q, setQ] = useState("");
  const typed = useDebounced(q.trim(), 250);
  const [results, setResults] = useState<PickedStudent[]>([]);
  useEffect(() => {
    if (typed.length < 2) {
      setResults([]);
      return;
    }
    let live = true;
    api
      .get<Paginated<PickedStudent>>("/api/v1/school/students", { search: typed, status: "active", page_size: 8 })
      .then((r) => live && setResults(r.items))
      .catch(() => live && setResults([]));
    return () => {
      live = false;
    };
  }, [typed]);

  return (
    <Field label={label} required={required}>
      {value ? (
        <div className="spread">
          <span>{`${value.full_name} · ${value.admission_no}`}</span>
          <button type="button" className="btn" onClick={() => onChange(null)}>
            Change
          </button>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name or admission no." required={required} />
          <div className={`search-results ${results.length ? "open" : ""}`} style={{ top: 40, right: 0 }}>
            {results.map((s) => (
              <a
                key={s.id}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  onChange(s);
                  setQ("");
                  setResults([]);
                }}
              >
                {s.full_name}
                <small>{s.admission_no}</small>
              </a>
            ))}
          </div>
        </div>
      )}
    </Field>
  );
}

export const n = (v: number | undefined | null) => (v === undefined || v === null ? "…" : v.toLocaleString("en-IN"));
