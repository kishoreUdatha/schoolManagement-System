import { ReactNode } from "react";

import { BrandingProvider } from "@/components/BrandingProvider";
import { PortalShell } from "@/components/PortalShell";
import { PrincipalGuard } from "@/components/PrincipalGuard";
import { PrincipalNav } from "@/components/PrincipalNav";

export default function PrincipalProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <PrincipalGuard>
      <BrandingProvider>
        <PortalShell
          noticesHref="/principal/reports"
          nav={<PrincipalNav />}
          width="max-w-6xl"
        >
          {children}
        </PortalShell>
      </BrandingProvider>
    </PrincipalGuard>
  );
}
