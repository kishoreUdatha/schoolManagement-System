import { ReactNode } from "react";

import { AcademicYearProvider } from "@/components/AcademicYearProvider";
import { BrandingProvider } from "@/components/BrandingProvider";
import { PortalShell } from "@/components/PortalShell";
import { SchoolAdminGuard } from "@/components/SchoolAdminGuard";
import { SchoolAdminNav } from "@/components/SchoolAdminNav";

export default function SchoolProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <SchoolAdminGuard>
      <BrandingProvider>
        <AcademicYearProvider>
          <PortalShell
            showYear
            noticesHref="/school/notices"
            messagesHref="/school/messages"
            nav={<SchoolAdminNav />}
            width="max-w-7xl"
          >
            {children}
          </PortalShell>
        </AcademicYearProvider>
      </BrandingProvider>
    </SchoolAdminGuard>
  );
}
