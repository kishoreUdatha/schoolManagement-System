"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, Download } from "lucide-react";
import { ReactNode, useState } from "react";

import { Button } from "@/components/ui/Button";
import { ErrorBox, PageHeader } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";

/** Every report shares a frame: a way back to the index, a title that says
 *  what the figures are, and the error in the same place each time. */
export function ReportShell({
  title,
  subtitle,
  actions,
  error,
  children,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const atIndex = pathname === "/school/reports";

  return (
    <div className="space-y-6">
      {!atIndex && (
        <Link
          href="/school/reports"
          className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:underline"
        >
          <ChevronLeft className="h-4 w-4" />
          All reports
        </Link>
      )}
      <PageHeader title={title} subtitle={subtitle} actions={actions} />
      <ErrorBox>{error ?? null}</ErrorBox>
      {children}
    </div>
  );
}

/** A from/to pair. Both optional — every report has a sensible default
 *  window, and an empty box means "use it" rather than "no rows". */
export function DateRange({
  from,
  to,
  onFrom,
  onTo,
  onApply,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onApply: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-[12px] font-bold text-ink-muted">
        <span className="mb-1 block">From</span>
        <Input type="date" value={from} onChange={(e) => onFrom(e.target.value)} />
      </label>
      <label className="text-[12px] font-bold text-ink-muted">
        <span className="mb-1 block">To</span>
        <Input type="date" value={to} onChange={(e) => onTo(e.target.value)} />
      </label>
      <Button variant="secondary" onClick={onApply}>
        Apply
      </Button>
    </div>
  );
}

/** A download of exactly what is on screen.
 *
 *  The link carries the same query string as the fetch, so the file matches
 *  the table rather than the defaults — a spreadsheet that quietly covers a
 *  different period than the screen it came from is worse than no export.
 */
export function CsvButton({ path, query }: { path: string; query?: Record<string, string | undefined> }) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const res = await api.get(`/api/v1/school/analytics/${path}`, {
        params: query,
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = path;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="secondary" onClick={download} loading={busy}>
      <Download className="mr-1.5 h-4 w-4" />
      CSV
    </Button>
  );
}


/** The percentage colour used across the reports: the same number means the
 *  same thing whether it is a class, a route or a member of staff. */
export function percentTone(pct: number): "emerald" | "amber" | "rose" {
  if (pct >= 85) return "emerald";
  if (pct >= 70) return "amber";
  return "rose";
}
