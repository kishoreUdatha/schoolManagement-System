import { ReactNode } from "react";

import { BrandingProvider } from "@/components/BrandingProvider";
import { ParentGuard } from "@/components/ParentGuard";
import { ParentNav } from "@/components/ParentNav";

export default function ParentProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ParentGuard>
      <BrandingProvider>
        <div className="flex min-h-screen flex-col md:flex-row">
          <ParentNav />
          <main className="flex-1 overflow-x-auto">
            <div className="mx-auto max-w-5xl px-6 py-5">{children}</div>
          </main>
        </div>
      </BrandingProvider>
    </ParentGuard>
  );
}
