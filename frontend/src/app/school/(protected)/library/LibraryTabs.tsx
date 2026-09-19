"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/school/library", label: "Circulation desk" },
  { href: "/school/library/catalogue", label: "Catalogue" },
  { href: "/school/library/reservations", label: "Reservations" },
  { href: "/school/library/settings", label: "Settings" },
];

export function LibraryTabs() {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-surface-border">
      {TABS.map((t) => {
        const active = t.href === "/school/library" ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              active ? "border-brand-500 text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export type Loan = {
  id: number;
  accession_no: string;
  book_id: number;
  title: string;
  borrower_type: "student" | "staff";
  borrower_name: string;
  borrower_detail: string | null;
  issued_on: string;
  due_on: string;
  returned_on: string | null;
  lost_on: string | null;
  renew_count: number;
  overdue_days: number;
  fine_amount: string;
  accruing_fine: string;
  fine_status: "none" | "pending" | "billed" | "paid" | "waived";
  fine_note: string | null;
};

export type BookRow = {
  id: number;
  title: string;
  authors: string | null;
  isbn: string | null;
  publisher: string | null;
  edition: string | null;
  publish_year: number | null;
  category: string | null;
  language: string | null;
  shelf: string | null;
  description: string | null;
  digital_url: string | null;
  is_reference: boolean;
  is_active: boolean;
  total_copies: number;
  available_copies: number;
  waiting_reservations: number;
};

export type Copy = {
  id: number;
  accession_no: string;
  status: "available" | "issued" | "on_hold" | "lost" | "damaged" | "withdrawn";
  price: string | null;
  acquired_on: string | null;
  condition_note: string | null;
  borrower_name: string | null;
  due_on: string | null;
};

export const copyTone = {
  available: "emerald",
  issued: "brand",
  on_hold: "amber",
  lost: "rose",
  damaged: "rose",
  withdrawn: "neutral",
} as const;
