import { ReactNode } from "react";

import { SuperAdminGuard } from "@/components/SuperAdminGuard";
import { SuperAdminNav } from "@/components/SuperAdminNav";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <SuperAdminGuard>
      <div className="flex min-h-screen flex-col md:flex-row">
        <SuperAdminNav />
        <main className="flex-1 overflow-x-auto">
          <div className="mx-auto max-w-7xl px-6 py-5">{children}</div>
        </main>
      </div>
    </SuperAdminGuard>
  );
}
