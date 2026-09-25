import { ReactNode } from "react";

import { AskAssistant } from "@/components/ai/AskAssistant";
import { BrandingProvider } from "@/components/BrandingProvider";
import { TeacherGuard } from "@/components/TeacherGuard";
import { TeacherNav } from "@/components/TeacherNav";

export default function TeacherProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <TeacherGuard>
      <BrandingProvider>
        <div className="flex min-h-screen flex-col md:flex-row">
          <TeacherNav />
          <main className="flex-1 overflow-x-auto">
            <div className="mx-auto max-w-6xl px-6 py-5">{children}</div>
          </main>
          <AskAssistant />
        </div>
      </BrandingProvider>
    </TeacherGuard>
  );
}
