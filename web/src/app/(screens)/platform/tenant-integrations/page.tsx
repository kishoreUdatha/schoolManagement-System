// NEW-083 · Tenant Integrations
// Module: Super Admin / SaaS Administration · Role: Super Admin · Release: Extension
// New screen (no mock)
// Wired: GET /api/v1/super-admin/integrations — each school's payment gateway and WhatsApp connection. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { ClientOnly } from "@/features/fees/common";
import { TenantIntegrations } from "@/features/platform/TenantIntegrations";

export const metadata = { title: "NEW-083 · Tenant Integrations · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-083">
      <ClientOnly>
        <TenantIntegrations />
      </ClientOnly>
    </AppShell>
  );
}
