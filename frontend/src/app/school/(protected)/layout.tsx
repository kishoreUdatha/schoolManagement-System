import { ReactNode } from "react";

import { BrandingProvider } from "@/components/BrandingProvider";
import { SchoolAdminGuard } from "@/components/SchoolAdminGuard";
import { SchoolAdminNav } from "@/components/SchoolAdminNav";

export default function SchoolProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <SchoolAdminGuard>
      <BrandingProvider>
        <div className="flex min-h-screen flex-col md:flex-row">
          <SchoolAdminNav />
          <main className="flex-1 overflow-x-auto">
            <div className="mx-auto max-w-7xl px-6 py-5">{children}</div>
          </main>
        </div>
      </BrandingProvider>
    </SchoolAdminGuard>
  );
}
