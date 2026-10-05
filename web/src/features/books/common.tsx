"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { isoToday } from "@/features/fees/common";
import type { Account, Kind } from "./types";

export const BOOKS = "/api/v1/school/books";

export const KIND_LABEL: Record<Kind, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Capital and funds",
  income: "Income",
  expense: "Expenditure",
};
export const KINDS: Kind[] = ["asset", "liability", "equity", "income", "expense"];
const DEBIT_NORMAL = new Set<Kind>(["asset", "expense"]);

/** Indian financial year: 1 April to 31 March. */
export function fyStart(iso: string = isoToday()): string {
  const [y, m] = iso.split("-").map(Number);
  return `${m >= 4 ? y : y - 1}-04-01`;
}

const shift = (iso: string, years: number) => `${Number(iso.slice(0, 4)) + years}${iso.slice(4)}`;

/** Presets an accountant reaches for, then the dates themselves. */
export function Period({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const today = isoToday();
  const fy = fyStart(today);
  const presets: [string, string, string][] = [
    ["This year", fy, today],
    ["Last year", shift(fy, -1), `${fy.slice(0, 4)}-03-31`],
    ["This month", today.slice(0, 8) + "01", today],
  ];
  const current = presets.find(([, f, t]) => f === from && t === to)?.[0] ?? "";
  return (
    <>
      <select
        aria-label="Period"
        value={current}
        onChange={(e) => {
          const p = presets.find(([l]) => l === e.target.value);
          if (p) onChange(p[1], p[2]);
        }}
      >
        {!current ? <option value="">Custom dates</option> : null}
        {presets.map(([l]) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
      <input type="date" aria-label="From date" value={from} max={to} onChange={(e) => e.target.value && onChange(e.target.value, to)} />
      <input type="date" aria-label="To date" value={to} min={from} onChange={(e) => e.target.value && onChange(from, e.target.value)} />
    </>
  );
}

/** An amount for a statement column: blank for zero, minus sign kept. */
export function amt(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  return n ? money(n) : "";
}

/** A balance the way ledgers print it: the amount, then Dr or Cr. */
export function drCr(v: string | number, kind: Kind): string {
  const n = Number(v);
  if (!n) return "₹0";
  const debit = DEBIT_NORMAL.has(kind) ? n > 0 : n < 0;
  return `${money(Math.abs(n))} ${debit ? "Dr" : "Cr"}`;
}

/** Account picker grouped by kind; switched-off accounts are left out. */
export function AccountSelect({
  accounts,
  value,
  onChange,
  label = "Account",
  allowEmpty = false,
  required = false,
}: {
  accounts: Account[];
  value: number | "";
  onChange: (id: number | "") => void;
  label?: string;
  allowEmpty?: boolean;
  required?: boolean;
}) {
  return (
    <select aria-label={label} value={value} required={required} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}>
      {allowEmpty || value === "" ? <option value="">Choose an account</option> : null}
      {KINDS.map((k) => {
        const list = accounts.filter((a) => a.kind === k && (a.is_active || a.id === value));
        return list.length ? (
          <optgroup key={k} label={KIND_LABEL[k]}>
            {list.map((a) => (
              <option key={a.id} value={a.id}>
                {`${a.code} · ${a.name}`}
              </option>
            ))}
          </optgroup>
        ) : null;
      })}
    </select>
  );
}

/** Link from a statement line to that account's ledger for the same dates. */
export function LedgerLink({ id, from, to, children }: { id: number; from: string; to: string; children: ReactNode }) {
  return <Link href={`${routeOf(1054)}?account=${id}&from=${from}&to=${to}`}>{children}</Link>;
}

/** Where an automatic posting came from, when that record has a screen. */
export function sourceHref(source: string, id: number | null): string | null {
  if (id == null) return null;
  if (source === "fee_receipt") return `${routeOf(160)}?receipt=${id}`;
  if (source === "journal") return `${routeOf(1052)}?id=${id}`;
  return null;
}

/** Every table on the page as one CSV: what the accountant sees, as printed. */
export function exportTables(filename: string) {
  const cell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines: string[] = [];
  document.querySelectorAll<HTMLTableElement>("main table.data-table, .content table.data-table").forEach((t, i) => {
    if (i) lines.push("");
    const caption = t.dataset.caption;
    if (caption) lines.push(cell(caption));
    t.querySelectorAll("tr").forEach((r) => {
      lines.push(
        Array.from(r.querySelectorAll("th,td"))
          .map((c) => cell((c as HTMLElement).innerText.replace(/\n/g, " ").trim()))
          .join(","),
      );
    });
  });
  if (!lines.length) {
    notify("Nothing to export yet.");
    return;
  }
  const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReportActions({ filename }: { filename: string }) {
  return (
    <div className="row" style={{ gap: 8 }}>
      <button type="button" className="btn" onClick={() => exportTables(filename)}>
        <Icon name="download" className="sm" />
        Export
      </button>
      <button type="button" className="btn" onClick={() => window.print()}>
        <Icon name="file" className="sm" />
        Print
      </button>
    </div>
  );
}
