import { ReactNode } from "react";

import { BrandingProvider } from "@/components/BrandingProvider";
import { PortalShell } from "@/components/PortalShell";
import { TeacherGuard } from "@/components/TeacherGuard";
import { TeacherNav } from "@/components/TeacherNav";

export default function TeacherProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <TeacherGuard>
      <BrandingProvider>
        <PortalShell
          noticesHref="/teacher/notices"
          messagesHref="/teacher/messages"
          nav={<TeacherNav />}
          width="max-w-6xl"
        >
          {children}
        </PortalShell>
      </BrandingProvider>
    </TeacherGuard>
  );
}
