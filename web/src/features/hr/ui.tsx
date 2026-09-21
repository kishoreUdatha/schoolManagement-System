"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote } from "@/components/ui/states";
import { session } from "@/lib/session";

/*
 * Small pieces the HR screens share. Kept in this folder rather than in
 * src/components, which other modules own.
 */

/** A form in the shell's modal styling (.modal-backdrop / .modal). */
export function Dialog({
  title,
  onClose,
  onSubmit,
  submit,
  busy = false,
  error,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  submit?: string;
  busy?: boolean;
  error?: string | null;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="modal-backdrop show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth: wide ? 720 : 560, maxHeight: "90vh", overflow: "auto" }}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.(e);
        }}
      >
        <h2>{title}</h2>
        <ErrorNote>{error}</ErrorNote>
        {children}
        <div className="actions row">
          <button type="button" className="btn" onClick={onClose}>
            {submit ? "Cancel" : "Close"}
          </button>
          {submit ? (
            <button type="submit" className="btn primary" disabled={busy}>
              <Icon name="check" className="sm" />
              {busy ? "Saving…" : submit}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

/**
 * A dialog opened from the page head. The page stays a server component, so
 * its button is a link to `?new=1`; the screen reads the flag and opens the
 * form, and closing it drops the flag again.
 */
export function useNewFlag(): [boolean, () => void] {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const open = params.get("new") === "1";
  const close = useCallback(() => {
    const q = new URLSearchParams(params.toString());
    q.delete("new");
    const qs = q.toString();
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
  }, [params, router, path]);
  return [open, close];
}

/** The page-head button that opens a screen's dialog, keeping ?id= and the rest. */
export function NewLink({ icon = "plus", children }: { icon?: "plus" | "check" | "arrow" | "calendar"; children: ReactNode }) {
  const params = useSearchParams();
  const q = new URLSearchParams(params.toString());
  q.set("new", "1");
  return (
    <Link href={`?${q.toString()}`} scroll={false} className="btn primary">
      <Icon name={icon} className="sm" />
      {children}
    </Link>
  );
}

/** NewLink for a server page: it reads the query, so it needs a Suspense. */
export function PageAction(props: { icon?: "plus" | "check" | "arrow" | "calendar"; children: ReactNode }) {
  return (
    <Suspense fallback={<span className="btn primary">{props.children}</span>}>
      <NewLink {...props} />
    </Suspense>
  );
}

/** The mock's labelled form control. */
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

/** Label/value rows in the mock's `.kv` list. */
export function KV({ rows }: { rows: [string, ReactNode][] }) {
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

export const AVATAR_TONES = ["mint", "", "peach", "lilac"];

/** Today as YYYY-MM-DD in the viewer's time zone (not UTC). */
export function today(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "2026-08" -> "August 2026". */
export function monthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/** A time of day from an ISO timestamp: "08:42 AM". */
export function clock(v: string | null | undefined): string {
  if (!v) return "—";
  const t = new Date(v);
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
}

/**
 * Save a file the backend streams behind the bearer token (payslip PDF, bank
 * file). A plain link cannot carry the token, so fetch it and hand the blob
 * to the browser.
 */
export async function downloadAuthed(path: string, filename: string): Promise<void> {
  const token = session.get()?.access;
  const res = await fetch(path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    let msg = `The download failed (${res.status}).`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") msg = body.detail;
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
