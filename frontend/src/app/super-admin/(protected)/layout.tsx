import { ReactNode } from "react";

import { BrandingProvider } from "@/components/BrandingProvider";
import { PortalShell } from "@/components/PortalShell";
import { SuperAdminGuard } from "@/components/SuperAdminGuard";
import { SuperAdminNav } from "@/components/SuperAdminNav";

export default function SuperAdminProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <SuperAdminGuard>
      <BrandingProvider>
        <PortalShell
          nav={<SuperAdminNav />}
          width="max-w-7xl"
        >
          {children}
        </PortalShell>
      </BrandingProvider>
    </SuperAdminGuard>
  );
}
