import { ReactNode } from "react";

import { AccountantGuard } from "@/components/AccountantGuard";
import { AccountantNav } from "@/components/AccountantNav";
import { BrandingProvider } from "@/components/BrandingProvider";

export default function AccountantProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AccountantGuard>
      <BrandingProvider>
        <div className="flex min-h-screen flex-col md:flex-row">
          <AccountantNav />
          <main className="flex-1 overflow-x-auto">
            <div className="mx-auto max-w-6xl px-6 py-5">{children}</div>
          </main>
        </div>
      </BrandingProvider>
    </AccountantGuard>
  );
}
