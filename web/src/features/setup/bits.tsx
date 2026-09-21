"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { routeOf } from "@/lib/screens";

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

/** The mock's `dl.kv` from label/value pairs. */
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

/** The numbered title at the top of each form section. */
export function SectionTitle({ n, children }: { n: string; children: string }) {
  return (
    <div className="form-section-title">
      <span className="number">{n}</span>
      <h3>{children}</h3>
    </div>
  );
}

/** A page-head submit button for a form elsewhere on the page (HTML `form=`). */
export function SubmitFor({ form, children }: { form: string; children: string }) {
  return (
    <button type="submit" form={form} className="btn primary">
      <Icon name="check" className="sm" />
      {children}
    </button>
  );
}

/** A page-head link that carries the current ?id= on to another screen. */
export function WithIdLink({ screen, icon = "arrow", fallback, children }: { screen: number; icon?: IconName; fallback?: number; children: string }) {
  const id = useSearchParams().get("id");
  const href = id ? `${routeOf(screen)}?id=${id}` : routeOf(fallback ?? screen);
  return (
    <Link href={href} className="btn primary">
      <Icon name={icon} className="sm" />
      {children}
    </Link>
  );
}

/** Blank strings become null, as the API expects for optional fields. */
export const orNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

export const count = (v: number | undefined | null) => (v === undefined || v === null ? "…" : v.toLocaleString("en-IN"));
