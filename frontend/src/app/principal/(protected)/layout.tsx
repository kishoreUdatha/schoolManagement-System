import { ReactNode } from "react";

import { BrandingProvider } from "@/components/BrandingProvider";
import { PrincipalGuard } from "@/components/PrincipalGuard";
import { PrincipalNav } from "@/components/PrincipalNav";

export default function PrincipalProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <PrincipalGuard>
      <BrandingProvider>
        <div className="flex min-h-screen flex-col md:flex-row">
          <PrincipalNav />
          <main className="flex-1 overflow-x-auto">
            <div className="mx-auto max-w-6xl px-6 py-5">{children}</div>
          </main>
        </div>
      </BrandingProvider>
    </PrincipalGuard>
  );
}
