// NEW-103 · Stock Check
// Module: Library · Role: Librarian · Release: Extension
// New screen (no mock)
// Wired: GET/POST /api/v1/school/library/stock-checks, GET …/{id}, POST …/{id}/scans, mark-lost, mark-found, close. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { StockCheck } from "@/features/library/Tools";

export const metadata = { title: "NEW-103 · Stock Check · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-103">
      <StockCheck />
    </AppShell>
  );
}
