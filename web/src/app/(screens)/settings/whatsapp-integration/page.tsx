// NEW-082 · WhatsApp Integration
// Module: Settings / Roles / Permissions / Audit · Role: School Admin · Release: Extension
// New screen (no mock)
// Wired: GET/PUT/DELETE /api/v1/school/whatsapp, GET/PUT …/templates, POST …/test, GET …/deliveries. Tokens are write-only. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ClientOnly } from "@/features/fees/common";
import { WhatsappSettings } from "@/features/settings/WhatsappSettings";

export const metadata = { title: "NEW-082 · WhatsApp Integration · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-082" actions={<button type="submit" form="whatsapp-form" className="btn primary">
        <Icon name="check" className="sm" />
        Save connection
      </button>}>
      <ClientOnly>
        <WhatsappSettings />
      </ClientOnly>
    </AppShell>
  );
}
