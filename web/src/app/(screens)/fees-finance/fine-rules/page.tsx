// SCR-164 · Fine Rules
// Module: Fees & Finance · Role: Accountant · Release: Phase 2 · Stories: US-0327 / US-0328
// Mock: screens/SCR-164_Fine_Rules.html
// Backend: the old frontend served this at /school/fees/late-refunds — Rule CRUD with preview and charge
// Wired: GET/POST /api/v1/school/fees/late-fee-rules, PUT/DELETE /late-fee-rules/{id}, GET /fees/late-fees/preview, POST /fees/late-fees/apply, GET /fees/heads. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { FineRules } from "@/features/fees/FineRules";

export const metadata = { title: "SCR-164 · Fine Rules · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-164" actions={<button type="submit" form="fine-rule-form" className="btn primary">
        <Icon name="check" className="sm" />
        Save rule
      </button>}>
      <FineRules />
    </AppShell>
  );
}
