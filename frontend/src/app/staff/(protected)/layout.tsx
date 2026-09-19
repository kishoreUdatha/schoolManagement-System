import { ReactNode } from "react";

import { BrandingProvider } from "@/components/BrandingProvider";
import { StaffGuard } from "@/components/StaffGuard";
import { StaffNav } from "@/components/StaffNav";

export default function StaffProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <StaffGuard>
      <BrandingProvider>
        <div className="flex min-h-screen flex-col md:flex-row">
          <StaffNav />
          <main className="flex-1 overflow-x-auto">
            <div className="mx-auto max-w-6xl px-6 py-5">{children}</div>
          </main>
        </div>
      </BrandingProvider>
    </StaffGuard>
  );
}
