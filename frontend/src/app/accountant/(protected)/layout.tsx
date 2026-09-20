import { ReactNode } from "react";

import { BrandingProvider } from "@/components/BrandingProvider";
import { PortalShell } from "@/components/PortalShell";
import { AccountantGuard } from "@/components/AccountantGuard";
import { AccountantNav } from "@/components/AccountantNav";

export default function AccountantProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <AccountantGuard>
      <BrandingProvider>
        <PortalShell
          nav={<AccountantNav />}
          width="max-w-7xl"
        >
          {children}
        </PortalShell>
      </BrandingProvider>
    </AccountantGuard>
  );
}
