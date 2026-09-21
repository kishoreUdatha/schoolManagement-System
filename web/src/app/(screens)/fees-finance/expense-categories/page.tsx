// NEW-046 · Expense Categories
// Module: Fees & Finance · Role: Accountant · Release: Extension
// New screen (no mock)
// Wired: GET/POST /api/v1/school/accounts/expense-categories, PUT /accounts/expense-categories/{id}. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ExpenseCategories } from "@/features/fees/ExpenseCategories";

export const metadata = { title: "NEW-046 · Expense Categories · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-046" actions={<Link href="/fees-finance/expense-categories?new=1" className="btn primary">
        <Icon name="plus" className="sm" />
        Add category
      </Link>}>
      <Suspense>
        <ExpenseCategories />
      </Suspense>
    </AppShell>
  );
}
