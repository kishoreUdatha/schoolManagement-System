import { ReactNode } from "react";

import { BrandingProvider } from "@/components/BrandingProvider";
import { PortalShell } from "@/components/PortalShell";
import { StaffGuard } from "@/components/StaffGuard";
import { StaffNav } from "@/components/StaffNav";

export default function StaffProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <StaffGuard>
      <BrandingProvider>
        <PortalShell
          noticesHref="/staff/inbox"
          nav={<StaffNav />}
          width="max-w-5xl"
        >
          {children}
        </PortalShell>
      </BrandingProvider>
    </StaffGuard>
  );
}
