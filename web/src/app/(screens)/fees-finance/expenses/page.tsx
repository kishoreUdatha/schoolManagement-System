// SCR-167 · Expenses
// Module: Fees & Finance · Role: Accountant · Release: Phase 3 · Stories: US-0333 / US-0334
// Mock: screens/SCR-167_Expenses.html
// Backend: the old frontend served this at /school/accounts — Expenses with void and reason
// Wired: GET/POST /api/v1/school/accounts/expenses, POST /accounts/expenses/{id}/void, GET /accounts/expense-categories, /inventory/suppliers. Hand-maintained.

import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ClientOnly } from "@/features/fees/common";
import { ExpenseList } from "@/features/fees/ExpenseList";

export const metadata = { title: "SCR-167 · Expenses · BrightCampus" };

export default function Page() {
  // "Add expense" (a direct expense) opens a live form in the filter bar; supplier bills are paid on SCR-169.
  return (
    <AppShell screen="SCR-167" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <Link href="/fees-finance/purchase-payment" className="btn primary">
          <Icon name="arrow" className="sm" />
          Pay a supplier bill
        </Link>
      </>}>
      <ClientOnly>
        <ExpenseList />
      </ClientOnly>
    </AppShell>
  );
}
