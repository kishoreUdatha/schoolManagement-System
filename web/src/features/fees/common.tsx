"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { Loading } from "@/components/ui/states";
import { session } from "@/lib/session";
import { useHydrated } from "@/lib/useSession";
import type { PickedStudent } from "./types";

/** Payment modes the backend books money under (MoneyMode). */
export const MODES: [string, string][] = [
  ["cash", "Cash"],
  ["upi", "UPI"],
  ["bank_transfer", "Bank transfer"],
  ["card", "Card"],
  ["cheque", "Cheque"],
  ["online", "Online"],
  ["other", "Other"],
];

export const modeLabel = (m: string | null | undefined) => MODES.find(([k]) => k === m)?.[1] ?? (m ? m.replace(/_/g, " ") : "—");

/** Today and the first of this month, as the date inputs want them. */
export function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const monthStart = () => isoToday().slice(0, 8) + "01";

/** Sum of decimal strings or numbers, for lists the server returned whole. */
export const sum = (xs: (string | number | null | undefined)[]) => xs.reduce<number>((s, x) => s + (Number(x) || 0), 0);

/** "2026-09" -> "Sep 2026". */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
}

/** A labelled form control in the mock's `.field` markup. */
export function Field({ label: text, required = false, full = false, children }: { label: string; required?: boolean; full?: boolean; children: ReactNode }) {
  return (
    <label className={`field ${full ? "full" : ""}`}>
      <span>
        {text}
        {required ? <span className="req">*</span> : null}
      </span>
      {children}
    </label>
  );
}

/** The mock's modal, driven by React instead of the preview script. */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="modal-backdrop show" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** A success line after a save, in the mock's tip. */
export function Notice({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="tip" role="status" style={{ marginBottom: 16 }}>
      <Icon name="check" className="sm" />
      <span>{children}</span>
    </div>
  );
}

/**
 * Type-ahead over the school's active students
 * (GET /api/v1/school/directory/students?search=), as the old frontend did.
 * Matches show from the first letter; arrow keys and Enter pick one, and a
 * search with no match says so rather than showing nothing.
 */
export function StudentPicker({ value, onChange, label: text = "Student", required = true }: { value: PickedStudent | null; onChange: (s: PickedStudent | null) => void; label?: string; required?: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PickedStudent[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setHits([]);
      setSearched("");
      setBusy(false);
      return;
    }
    let live = true;
    setBusy(true);
    const t = setTimeout(() => {
      api
        .get<PickedStudent[]>("/api/v1/school/directory/students", { search: term })
        .then((r) => live && setHits(r))
        .catch(() => live && setHits([]))
        .finally(() => {
          if (!live) return;
          setBusy(false);
          setSearched(term);
          setActive(0);
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  const pick = (s: PickedStudent) => {
    onChange(s);
    setQ("");
    setOpen(false);
  };

  if (value) {
    return (
      <Field label={text} required={required}>
        <div className="spread" style={{ gap: 8 }}>
          <input readOnly value={`${value.full_name} · ${value.admission_no}${value.section_label ? ` · ${value.section_label}` : ""}`} />
          <button type="button" className="btn" onClick={() => onChange(null)}>
            Change
          </button>
        </div>
      </Field>
    );
  }
  const term = q.trim();
  const showList = open && term.length > 0;
  return (
    <Field label={text} required={required}>
      <div style={{ position: "relative" }}>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && hits.length) {
              e.preventDefault();
              setOpen(true);
              setActive((active + 1) % hits.length);
            } else if (e.key === "ArrowUp" && hits.length) {
              e.preventDefault();
              setActive((active - 1 + hits.length) % hits.length);
            } else if (e.key === "Enter" && showList && hits[active]) {
              e.preventDefault();
              pick(hits[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Type a name or admission number…"
          aria-label={`Search ${text.toLowerCase()}`}
          aria-autocomplete="list"
          aria-expanded={showList}
          autoComplete="off"
          required={required}
        />
        {showList ? (
          <div className="search-results open picker-results" role="listbox" style={{ top: 44, right: 0 }}>
            {hits.map((s, i) => (
              <a
                key={s.id}
                href="#"
                role="option"
                aria-selected={i === active}
                className={i === active ? "active" : ""}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
              >
                <Highlight text={s.full_name} term={term} />
                <small>
                  <Highlight text={s.admission_no} term={term} />
                  {s.section_label ? ` · ${s.section_label}` : ""}
                </small>
              </a>
            ))}
            {!hits.length ? (
              <div className="picker-empty">{busy || searched !== term ? "Searching…" : `No student matches “${term}”. Try part of the name or the admission number.`}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Field>
  );
}

/** The text with the searched part in bold. */
function Highlight({ text, term }: { text: string; term: string }) {
  const i = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <strong>{text.slice(i, i + term.length)}</strong>
      {text.slice(i + term.length)}
    </>
  );
}

/**
 * Fetch a file the API only gives to a signed-in user (PDF, CSV) and hand it
 * to the browser. Plain links cannot carry the bearer token.
 */
export async function downloadAuthed(path: string, filename: string, open = false): Promise<void> {
  const token = session.get()?.access;
  const res = await fetch(path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    let msg = `The file could not be fetched (${res.status}).`;
    try {
      const b = await res.json();
      if (typeof b?.detail === "string") msg = b.detail;
    } catch {
      /* not JSON */
    }
    if (res.status === 401) msg = "Your session has expired. Reload the page to sign in again.";
    throw new Error(msg);
  }
  const url = URL.createObjectURL(await res.blob());
  if (open) {
    window.open(url, "_blank", "noopener");
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** A page-head button that downloads a server-made file. */
export function DownloadButton({ path, filename, children, primary = false }: { path: string; filename: string; children: ReactNode; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`btn ${primary ? "primary" : ""}`}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadAuthed(path, filename);
        } catch (e) {
          notify(errorText(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Icon name="download" className="sm" />
      {busy ? "Preparing…" : children}
    </button>
  );
}

/** Values 0–100 for the mock's chart, scaled to the largest amount. */
export function scaled(values: number[]): number[] {
  const max = Math.max(0, ...values);
  return values.map((v) => (max > 0 ? Math.round((v / max) * 100) : 0));
}

/** The last six calendar months ending this month, as "YYYY-MM". */
export function lastSixMonths(): string[] {
  const d = new Date();
  const out: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/**
 * Render only in the browser. Screens that default to "today" (date ranges,
 * payment dates) would otherwise prerender the build day into the page.
 */
export function ClientOnly({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  return hydrated ? <>{children}</> : <Loading />;
}
