// SCR-294 · Audit Logs
// Module: Settings / Roles / Permissions / Audit · Role: IT Admin · Release: Phase 3 · Stories: US-0587 / US-0588
// Mock: screens/SCR-294_Audit_Logs.html
// Wired: GET /api/v1/school/audit-log (action, entity_type, from, to, limit/offset), GET /audit-log.csv. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { AuditLogs, ExportAuditLog } from "@/features/settings/AuditLogs";

export const metadata = { title: "SCR-294 · Audit Logs · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-294" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <ExportAuditLog />
      </>}>
      <AuditLogs />
    </AppShell>
  );
}
