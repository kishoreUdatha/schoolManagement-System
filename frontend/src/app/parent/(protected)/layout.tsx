import { ReactNode } from "react";

import { BrandingProvider } from "@/components/BrandingProvider";
import { PortalShell } from "@/components/PortalShell";
import { ParentGuard } from "@/components/ParentGuard";
import { ParentNav } from "@/components/ParentNav";

export default function ParentProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <ParentGuard>
      <BrandingProvider>
        <PortalShell
          noticesHref="/parent/notices"
          messagesHref="/parent/messages"
          nav={<ParentNav />}
          width="max-w-5xl"
        >
          {children}
        </PortalShell>
      </BrandingProvider>
    </ParentGuard>
  );
}
