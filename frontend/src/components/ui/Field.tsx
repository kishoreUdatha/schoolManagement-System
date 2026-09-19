"use client";

import { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const fieldClass =
  "rounded-lg border border-surface-border bg-surface-subtle px-3 py-2 text-sm text-ink shadow-sm focus:border-brand-500/60 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

export function Select({
  label,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="flex flex-col gap-1">
      {label && <span className="text-xs font-medium text-ink-muted">{label}</span>}
      <select className={cn(fieldClass, className)} {...rest}>
        {children}
      </select>
    </label>
  );
}

export function Textarea({
  label,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="flex flex-col gap-1">
      {label && <span className="text-xs font-medium text-ink-muted">{label}</span>}
      <textarea rows={2} className={cn(fieldClass, className)} {...rest} />
    </label>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{children}</div>;
}

export function NoticeBox({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{children}</div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Simple data table: header labels + rows, with an empty-state row. */
export function Table({
  head,
  children,
  empty,
  colSpan,
}: {
  head: ReactNode[];
  children: ReactNode;
  empty?: string | false;
  colSpan?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-surface-border text-sm">
        <thead className="text-left text-xs uppercase text-ink-subtle">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {children}
          {empty && (
            <tr>
              <td colSpan={colSpan ?? head.length} className="px-3 py-8 text-center text-ink-muted">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export const td = "px-3 py-2 text-ink-muted";
export const tdStrong = "px-3 py-2 font-medium text-ink";

export function humanize(v: string | null | undefined): string {
  if (!v) return "—";
  return v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function inr(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  return `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** Turn "" into null for optional form fields before sending. */
export function blanksToNull<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) out[k] = v === "" ? null : v;
  return out as T;
}
