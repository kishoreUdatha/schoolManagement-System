import { ReactNode } from "react";

import { BrandingProvider } from "@/components/BrandingProvider";
import { StudentGuard } from "@/components/StudentGuard";
import { StudentNav } from "@/components/StudentNav";

export default function StudentProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <StudentGuard>
      <BrandingProvider>
        <div className="flex min-h-screen flex-col md:flex-row">
          <StudentNav />
          <main className="flex-1 overflow-x-auto">
            <div className="mx-auto max-w-4xl px-6 py-5">{children}</div>
          </main>
        </div>
      </BrandingProvider>
    </StudentGuard>
  );
}
