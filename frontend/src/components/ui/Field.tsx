"use client";

import { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const fieldClass =
  "min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300";

export function Select({
  label,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="flex flex-col gap-1">
      {label && <span className="text-[12px] font-bold text-ink-muted">{label}</span>}
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
      {label && <span className="text-[12px] font-bold text-ink-muted">{label}</span>}
      <textarea rows={2} className={cn(fieldClass, className)} {...rest} />
    </label>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">
      {children}
    </div>
  );
}

export function NoticeBox({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-lg bg-[#E9F7F0] px-4 py-3 text-[13px] font-medium text-[#07845E] dark:bg-emerald-500/15 dark:text-emerald-200">
      {children}
    </div>
  );
}

/** For something that wants attention but is not an error: a bus over its
 *  seats, stock about to run out, money that has been owed too long. Amber
 *  rather than NoticeBox's green, because a warning in the colour of good
 *  news is read as good news. */
export function WarnBox({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-lg bg-[#FFF3D8] px-4 py-3 text-[13px] font-medium text-[#8E5C05] dark:bg-amber-500/15 dark:text-amber-200">
      {children}
    </div>
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
        <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[13px] text-ink-muted">{subtitle}</p>}
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
      <table className="min-w-full divide-y divide-surface-border text-[13px]">
        <thead className="text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-4 py-3 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {children}
          {empty && (
            <tr>
              <td colSpan={colSpan ?? head.length} className="px-4 py-10 text-center text-ink-muted">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export const td = "px-4 py-3 text-ink-muted";
export const tdStrong = "px-4 py-3 font-bold text-ink";

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
