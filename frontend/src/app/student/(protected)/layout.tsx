import { ReactNode } from "react";

import { BrandingProvider } from "@/components/BrandingProvider";
import { PortalShell } from "@/components/PortalShell";
import { StudentGuard } from "@/components/StudentGuard";
import { StudentNav } from "@/components/StudentNav";

export default function StudentProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <StudentGuard>
      <BrandingProvider>
        <PortalShell
          nav={<StudentNav />}
          width="max-w-4xl"
        >
          {children}
        </PortalShell>
      </BrandingProvider>
    </StudentGuard>
  );
}
