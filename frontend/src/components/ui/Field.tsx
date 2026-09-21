"use client";

import { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const fieldClass =
  "min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink placeholder:text-ink-subtle transition-colors hover:border-brand-200 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-subtle";

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

/** The same props as Input, because a form should not care which of the two
 *  a field happens to be — hint and error were Input-only, so writing one on
 *  a Textarea was a type error rather than a note under the box. */
export function Textarea({
  label,
  hint,
  error,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  error?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      {label && <span className="text-[12px] font-bold text-ink-muted">{label}</span>}
      <textarea
        rows={2}
        className={cn(fieldClass, error && "border-danger/60 focus:border-danger focus:ring-danger/25", className)}
        {...rest}
      />
      {error ? (
        <span className="text-[11px] font-medium text-danger">{error}</span>
      ) : hint ? (
        <span className="text-[11px] text-ink-subtle">{hint}</span>
      ) : null}
    </label>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger">
      {children}
    </div>
  );
}

export function NoticeBox({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success">
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
    <div className="rounded-lg bg-warning-bg px-4 py-3 text-[13px] font-medium text-warning">
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
        {/* The mock tints the header row rather than relying on a rule, and
            its ink is the muted tone: the subtle one is a hint colour and
            falls under 3:1 at this size. */}
        <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-muted">
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
