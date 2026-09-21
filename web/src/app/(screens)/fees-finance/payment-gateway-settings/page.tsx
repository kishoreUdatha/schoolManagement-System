// NEW-043 · Payment Gateway Settings
// Module: Fees & Finance · Role: School Admin · Release: Extension
// New screen (no mock)
// Wired: GET/PUT/DELETE /api/v1/school/payments/gateway. Secrets are write-only. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ClientOnly } from "@/features/fees/common";
import { GatewaySettings } from "@/features/fees/GatewaySettings";

export const metadata = { title: "NEW-043 · Payment Gateway Settings · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-043" actions={<button type="submit" form="gateway-form" className="btn primary">
        <Icon name="check" className="sm" />
        Save gateway
      </button>}>
      <ClientOnly>
        <GatewaySettings />
      </ClientOnly>
    </AppShell>
  );
}
