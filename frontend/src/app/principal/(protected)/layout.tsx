import { ReactNode } from "react";

import { AcademicYearProvider } from "@/components/AcademicYearProvider";
import { BrandingProvider } from "@/components/BrandingProvider";
import { PortalShell } from "@/components/PortalShell";
import { PrincipalGuard } from "@/components/PrincipalGuard";
import { PrincipalNav } from "@/components/PrincipalNav";

export default function PrincipalProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <PrincipalGuard>
      <BrandingProvider>
        <AcademicYearProvider>
          <PortalShell
            showYear
            noticesHref="/principal/reports"
            nav={<PrincipalNav />}
            width="max-w-6xl"
          >
            {children}
          </PortalShell>
        </AcademicYearProvider>
      </BrandingProvider>
    </PrincipalGuard>
  );
}
